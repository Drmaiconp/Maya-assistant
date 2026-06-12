import { useState, useEffect, useRef } from "react";
const QUICK_ACTIONS = [
  { icon: "🌅", label: "Resumo do dia", prompt: "Faça um resumo completo do meu dia: agenda, tarefas, e-mails importantes e status financeiro" },
  { icon: "📅", label: "Agenda hoje", prompt: "Mostre minha agenda de hoje no Google Calendar" },
  { icon: "✅", label: "Tarefas", prompt: "Quais minhas tarefas pendentes hoje no Todoist?" },
  { icon: "💳", label: "Cartões", prompt: "Mostre o saldo atual de todos os meus cartões" },
  { icon: "💰", label: "Stripe", prompt: "Quantos pagamentos falhados tivemos nas últimas 24 horas no Stripe?" },
  { icon: "📧", label: "E-mails", prompt: "Mostre meus e-mails não lidos mais importantes" },
];
const formatTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatDate = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const renderMarkdown = (text) => text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/\n/g, "<br/>");
export default function Maya() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Olá, Maicon! 👋 Sou a **Maya**, sua assistente pessoal.\n\nEstou conectada ao seu Google Calendar, Gmail, Todoist, cartões e Stripe. Como posso te ajudar agora?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(formatTime());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { const i = setInterval(() => setTime(formatTime()), 30000); return () => clearInterval(i); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    const userMessage = { role: "user", content: userText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMessages.map((m) => ({ role: m.role, content: m.content })) }) });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply || "Erro ao processar." }]);

      
    } catch { setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]); }
    finally { setLoading(false); inputRef.current?.focus(); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a, #0d1b2a)", display: "flex", flexDirection: "column", fontFamily: "sans-serif", color: "#e8eaf0" }}>
      <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #4f8ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff" }}>M</div>
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>Maya</div><div style={{ fontSize: 11, color: "#4f8ef7" }}>Assistente Pessoal · Maicon</div></div>
        </div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 700 }}>{time}</div><div style={{ fontSize: 10, color: "#64748b" }}>{formatDate()}</div></div>
      </div>
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {[["📅","Calendar"],["📧","Gmail"],["✅","Todoist"],["💳","Cartões"],["💰","Stripe"]].map(([icon, name]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "3px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
            <span>{icon}</span><span style={{ color: "#94a3b8" }}>{name}</span><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {QUICK_ACTIONS.map((a) => (<button key={a.label} onClick={() => sendMessage(a.prompt)} disabled={loading} style={{ background: "rgba(79,142,247,0.1)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 20, padding: "6px 14px", color: "#93b8f8", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{a.icon} {a.label}</button>))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
            {msg.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #4f8ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>M</div>}
            <div style={{ maxWidth: "78%", background: msg.role === "user" ? "linear-gradient(135deg, #4f8ef7, #6366f1)" : "rgba(255,255,255,0.06)", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          </div>
        ))}
        {loading && <div style={{ display: "flex", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #4f8ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>M</div><div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "4px 18px 18px 18px", padding: "12px 16px" }}>...</div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 10 }}>
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Pergunte qualquer coisa, Maicon..." disabled={loading} rows={1} style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "10px 14px", color: "#e8eaf0", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit" }} />
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #4f8ef7, #6366f1)", border: "none", color: "#fff", cursor: "pointer", fontSize: 18 }}>➤</button>
      </div>
    </div>
  );
}
