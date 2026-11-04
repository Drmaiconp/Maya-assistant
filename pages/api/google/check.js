export default function handler(req, res) {
  const id = process.env.GOOGLE_CLIENT_ID;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    temId: !!id,
    tamanho: id?.length || 0,
    inicio: id?.slice(0, 13),
    fim: id?.slice(-27),
    temEspaco: id ? id !== id.trim() : false,
    temSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  });
}
