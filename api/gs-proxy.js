// Serverless proxy to read recent entries from Google Apps Script Web App
// Configure in Vercel Project Settings → Environment Variables:
// - GS_WEBAPP_URL: https://script.google.com/macros/s/AKfycbw-SN_X8bGg2hFkNC_qiJS3i8omCuNhaXWmo3QlwXF48htmd0KVwDerGjAy11dg0t0ARg/exec
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
    // Allow overriding via query params (for quick setup/testing)
    const qBase = req.query.url;
    const qToken = req.query.token;
    const base = (typeof qBase === 'string' && qBase) || process.env.GS_WEBAPP_URL;
    const token = (typeof qToken === 'string' ? qToken : '') || process.env.GS_TOKEN || "";
    if (!base) {
      return res.status(500).json({ ok: false, error: "Missing env GS_WEBAPP_URL" });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    const sheet = typeof req.query.sheet === 'string' ? req.query.sheet : '';
    const ssid = typeof req.query.ssid === 'string' ? req.query.ssid : '';
    const ssurl = typeof req.query.ssurl === 'string' ? req.query.ssurl : '';
    const formId = typeof req.query.formId === 'string' ? req.query.formId : '';

    // Build Apps Script doGet URL: append ?op=list&limit=...&token=...
    const target = new URL(base);
    target.searchParams.set("op", "list");
    target.searchParams.set("limit", String(limit));
    if (token) target.searchParams.set("token", token);
    if (sheet) target.searchParams.set("sheet", sheet);
    if (ssid) target.searchParams.set("ssid", ssid);
    if (ssurl) target.searchParams.set("ssurl", ssurl);
    if (formId) target.searchParams.set("formId", formId);

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
