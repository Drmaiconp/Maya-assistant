export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  try {
    const { messages } = req.body;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: "Você é Maya, assistente pessoal do Dr. Maicon. Responda em português. Reuniões nunca antes das 10h sem autorização.",
        messages,
      }),
    });
    const data = await r.json();
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "Erro.";
    res.end(JSON.stringify({ text }));
  } catch (e) {
    res.end(JSON.stringify({ error: "Erro na API" }));
  }
}
