// Serverless proxy to read recent entries from Google Apps Script Web App
// Configure in Vercel Project Settings → Environment Variables:
// - GS_WEBAPP_URL: https://script.google.com/macros/s/.../exec
// - GS_TOKEN: your token (optional, e.g., Pasantias90)

export default async function handler(req, res) {
  // CORS for browser usage
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const base = process.env.GS_WEBAPP_URL;
    const token = process.env.GS_TOKEN || "";
    if (!base) {
      return res.status(500).json({ ok: false, error: "Missing env GS_WEBAPP_URL" });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));

    // Build Apps Script doGet URL: append ?op=list&limit=...&token=...
    const target = new URL(base);
    target.searchParams.set("op", "list");
    target.searchParams.set("limit", String(limit));
    if (token) target.searchParams.set("token", token);

    const gsRes = await fetch(target.toString(), { method: "GET" });
    const text = await gsRes.text();

    // Try JSON, otherwise wrap as text
    try {
      const data = JSON.parse(text);
      return res.status(gsRes.status).json(data);
    } catch {
      return res.status(gsRes.status).json({ ok: true, raw: text });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
