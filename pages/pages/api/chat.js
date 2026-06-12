export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { messages } = req.body;
  const SYSTEM_PROMPT = `Você é a assistente pessoal exclusiva de Maicon, médico e empresário fundador da Clickuscare. Seu nome é Maya. Reuniões NUNCA podem ser agendadas antes das 10h sem autorização. Responda sempre em português brasileiro. Seja direta e proativa.`;
  const MCP_SERVERS = [
    { type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "google-calendar" },
    { type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail" },
    { type: "url", url: "https://ai.todoist.net/mcp", name: "todoist" },
    { type: "url", url: "https://context.era.app", name: "era-context" },
    { type: "url", url: "https://mcp.stripe.com", name: "stripe" },
  ];
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYSTEM_PROMPT, messages, mcp_servers: MCP_SERVERS }),
    });
    const data = await response.json();
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "Erro ao processar.";
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: "Erro ao conectar com a API" });
  }
}
