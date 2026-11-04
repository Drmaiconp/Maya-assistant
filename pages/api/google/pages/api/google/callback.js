export default async function handler(req, res) {
  const { code, state, error } = req.query;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (error) return res.status(400).send(`Google recusou: ${error}`);
  if (!code || !state || req.cookies.google_state !== state) {
    return res.status(400).send("Sessão inválida. Abra /api/google/login de novo.");
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `https://${req.headers.host}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = await r.json();

  if (!data.refresh_token) {
    return res.status(400).send(`Sem refresh token: ${data.error_description || data.error || "tente de novo"}`);
  }
  return res.status(200).send(`Copie o valor abaixo para GOOGLE_REFRESH_TOKEN na Vercel:\n\n${data.refresh_token}`);
}
