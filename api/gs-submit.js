// CommonJS handler to avoid ESM->CJS warning in Vercel logs
// Expects POST with JSON: { url: string, entry: object }
// Reads env GS_WEBAPP_URL and GS_TOKEN; body.url/body.entry override env URL when provided.

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Read raw body
    const bodyStr = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    const parsed = bodyStr ? JSON.parse(bodyStr) : {};

    const base = (typeof parsed.url === 'string' && parsed.url) || process.env.GS_WEBAPP_URL;
    if (!base) return res.status(500).json({ ok: false, error: 'Missing Web App URL (url or GS_WEBAPP_URL)' });

  const envToken = process.env.GS_TOKEN || '';
  const entry = parsed.entry || {};
  // Preferir el token del cliente si viene en el payload; usar el de servidor solo si falta
  const effToken = entry && entry.token ? entry.token : envToken;
  const withToken = effToken ? { ...entry, token: effToken } : entry;

    const gsRes = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(withToken),
    });

    const text = await gsRes.text();
    try {
      const json = JSON.parse(text);
      return res.status(gsRes.status).json(json);
    } catch {
      return res.status(gsRes.status).json({ ok: true, raw: text });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};