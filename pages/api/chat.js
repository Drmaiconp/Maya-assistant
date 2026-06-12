export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { messages } = req.body;
  const SYSTEM_PROMPT = `Você é Maya, assistente pessoal exclusiva de Maicon, médico e empresário fundador da Clickuscare. Responda sempre em português. Trate-o como Dr. Maicon. Nunca agende reuniões antes das 10h sem confirmação. Destaque sempre pagamentos pendentes. Seja direta e objetiva.`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        mcp_servers: [
          { type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "google-calendar" },
          { type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail" },
          { type: "url", url: "https://ai.todoist.net/mcp", name: "todoist" },
          { type: "url", url: "https://context.era.app", name: "era-context" },
          { type: "url", url: "https://mcp.stripe.com", name: "stripe" },
        ],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return res.status(200).json({ reply: text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
