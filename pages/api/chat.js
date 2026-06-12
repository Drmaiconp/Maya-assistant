export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.json({ error: "Method not allowed" });
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
        system: "Você é Maya, assistente pessoal do Dr. Maicon. Responda em português.",
        messages,
      }),
    });
    const data = await r.json();
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "Erro.";
    res.json({ text });
  } catch (e) {
    res.json({ error: "Erro na API" });
  }
}
