import crypto from "crypto";

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

async function googlePost(url, token, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

const clean = (text) => String(text).replace(/[\r\n]+/g, " ").trim();

function confirmationCode(draftId) {
  return crypto
    .createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET)
    .update(draftId)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
}

async function prepareEmail({ to, subject, body }, context) {
  const recipient = clean(to);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) {
    throw new Error("E-mail do destinatário inválido.");
  }
  const title = clean(subject);
  const encodedTitle = Buffer.from(title, "utf8").toString("base64");
  const raw = Buffer.from(
    [
      `To: ${recipient}`,
      `Subject: =?UTF-8?B?${encodedTitle}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(String(body), "utf8").toString("base64"),
    ].join("\r\n")
  ).toString("base64url");

  const token = await accessToken();
  const draft = await googlePost("https://gmail.googleapis.com/gmail/v1/users/me/drafts", token, {
    message: { raw },
  });
  context.pending.push({ type: "email", id: draft.id, to: recipient, subject: title, body: String(body) });
  return { draft_id: draft.id, status: "Rascunho criado. O sistema mostrará o e-mail e o código ao Dr. Maicon." };
}

async function sendEmail({ draft_id }, context) {
  if (!context.lastUserText.toUpperCase().includes(confirmationCode(draft_id))) {
    throw new Error("Envio bloqueado: a última mensagem do Dr. Maicon não traz o código deste rascunho.");
  }
  const token = await accessToken();
  const sent = await googlePost("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", token, {
    id: draft_id,
  });
  return { status: "E-mail enviado.", message_id: sent.id };
}

const VALID_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

async function prepareEvent({ title, start, end, location, description, attendees }, context) {
  const guests = (attendees || []).map(clean);
  if (guests.some((guest) => !VALID_EMAIL.test(guest))) throw new Error("E-mail de convidado inválido.");
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    throw new Error("Data ou horário inválido.");
  }
  const event = { title: clean(title), start, end, location, description, attendees: guests };
  const eventToken = Buffer.from(JSON.stringify(event), "utf8").toString("base64url");
  context.pending.push({ type: "event", id: eventToken, ...event });
  return { event_token: eventToken, status: "Evento ainda não criado. O sistema mostrará os dados e o código ao Dr. Maicon." };
}

async function createEvent({ event_token }, context) {
  if (!context.lastUserText.toUpperCase().includes(confirmationCode(event_token))) {
    throw new Error("Agendamento bloqueado: a última mensagem do Dr. Maicon não traz o código deste evento.");
  }
  const event = JSON.parse(Buffer.from(event_token, "base64url").toString("utf8"));
  const token = await accessToken();
  const created = await googlePost(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    token,
    {
      summary: event.title,
      location: event.location,
      description: event.description,
      start: { dateTime: event.start, timeZone: "America/New_York" },
      end: { dateTime: event.end, timeZone: "America/New_York" },
      attendees: event.attendees.map((email) => ({ email })),
    }
  );
  return { status: "Evento criado.", link: created.htmlLink };
}

function formatTime(value) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "short",
  });
}

function pendingText(item) {
  const code = confirmationCode(item.id);
  if (item.type === "event") {
    const guests = item.attendees.length ? item.attendees.join(", ") : "nenhum";
    return `\n\n--- EVENTO PARA CONFIRMAR ---\nTítulo: ${item.title}\nInício: ${formatTime(item.start)}\nFim: ${formatTime(item.end)}\nLocal: ${item.location || "não informado"}\nConvidados: ${guests}\n\nToken: ${item.id}\nPara agendar, responda: AGENDAR ${code}`;
  }
  return `\n\n--- E-MAIL PARA CONFIRMAR ---\nPara: ${item.to}\nAssunto: ${item.subject}\n\n${item.body}\n\nRascunho: ${item.id}\nPara enviar, responda: ENVIAR ${code}`;
}

export function confirmationText(items) {
  return items.map(pendingText).join("");
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
  {
    name: "prepare_event",
    description: "Prepara um evento na agenda principal. Nunca cria o evento. O sistema mostra os dados e o código de confirmação ao Dr. Maicon. Convidados recebem convite por e-mail.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "Início em RFC3339 com fuso, ex: 2026-11-05T14:00:00-05:00" },
        end: { type: "string", description: "Fim em RFC3339 com fuso" },
        location: { type: "string" },
        description: { type: "string" },
        attendees: { type: "array", items: { type: "string" }, description: "E-mails dos convidados (opcional)" },
      },
      required: ["title", "start", "end"],
    },
  },
  {
    name: "create_event",
    description: "Cria o evento preparado. Use somente quando a última mensagem do Dr. Maicon contiver o código de confirmação desse evento.",
    input_schema: {
      type: "object",
      properties: { event_token: { type: "string" } },
      required: ["event_token"],
    },
  },
  {
    name: "prepare_email",
    description: "Cria um rascunho no Gmail para um destinatário. Nunca envia. O sistema mostra o e-mail e o código de confirmação ao Dr. Maicon.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Um único endereço de e-mail." },
        subject: { type: "string" },
        body: { type: "string", description: "Texto do e-mail." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "send_email",
    description: "Envia um rascunho. Use somente quando a última mensagem do Dr. Maicon contiver o código de confirmação desse rascunho.",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
    },
  },
];

const handlers = {
  list_calendar_events: listEvents,
  search_email: searchEmail,
  read_email: readEmail,
  prepare_email: prepareEmail,
  send_email: sendEmail,
  prepare_event: prepareEvent,
  create_event: createEvent,
};

export async function runGoogleTool(name, input, context) {
  return handlers[name](input, context);
}

export const isGoogleTool = (name) => name in handlers;
