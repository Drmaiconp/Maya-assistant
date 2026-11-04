const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function accessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google não configurado na Vercel.");
  }
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`Login Google falhou: ${data.error_description || data.error}`);
  return data.access_token;
}

async function google(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Erro Google ${r.status}`);
  return data;
}

async function listEvents({ time_min, time_max, query }) {
  const token = await accessToken();
  const params = new URLSearchParams({
    timeMin: time_min,
    timeMax: time_max,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  if (query) params.set("q", query);
  const data = await google(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token);
  return (data.items || []).map((e) => ({
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location,
    meet: e.hangoutLink,
    attendees: e.attendees?.map((a) => a.email),
  }));
}

const header = (msg, name) =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value;

function bodyText(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const p of part.parts || []) {
    const text = bodyText(p);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }
  return "";
}

async function searchEmail({ query, max_results }) {
  const token = await accessToken();
  const params = new URLSearchParams({ q: query, maxResults: String(Math.min(max_results || 10, 20)) });
  const list = await google(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, token);
  const meta = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
  return Promise.all(
    (list.messages || []).map(async ({ id }) => {
      const m = await google(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${meta}`, token);
      return {
        id,
        from: header(m, "from"),
        subject: header(m, "subject"),
        date: header(m, "date"),
        snippet: m.snippet,
        unread: m.labelIds?.includes("UNREAD"),
      };
    })
  );
}

async function readEmail({ id }) {
  const token = await accessToken();
  const m = await google(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, token);
  return {
    from: header(m, "from"),
    to: header(m, "to"),
    subject: header(m, "subject"),
    date: header(m, "date"),
    body: bodyText(m.payload).slice(0, 8000),
  };
}

export const googleTools = [
  {
    name: "list_calendar_events",
    description: "Lista eventos da agenda principal do Google Calendar em um intervalo.",
    input_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "Início em RFC3339 com fuso, ex: 2026-11-04T00:00:00-05:00" },
        time_max: { type: "string", description: "Fim em RFC3339 com fuso" },
        query: { type: "string", description: "Texto para filtrar eventos (opcional)" },
      },
      required: ["time_min", "time_max"],
    },
  },
  {
    name: "search_email",
    description: "Busca e-mails no Gmail usando a sintaxe de busca do Gmail, ex: is:unread newer_than:1d. Retorna remetente, assunto, data e trecho.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "integer", description: "Até 20. Padrão 10." },
      },
      required: ["query"],
    },
  },
  {
    name: "read_email",
    description: "Lê o conteúdo de um e-mail pelo id retornado em search_email.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

const handlers = {
  list_calendar_events: listEvents,
  search_email: searchEmail,
  read_email: readEmail,
};

export async function runGoogleTool(name, input) {
  return handlers[name](input);
}

export const isGoogleTool = (name) => name in handlers;
