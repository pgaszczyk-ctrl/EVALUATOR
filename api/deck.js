// api/deck.js — Vercel serverless proxy
// Fetches Archidekt / Moxfield deck data server-side, where CORS doesn't apply.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'Missing ?url= parameter' });

  // Security: only proxy requests to trusted deck sites
  let target;
  try {
    target = new URL(decodeURIComponent(rawUrl));
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const allowed = ['archidekt.com', 'api.moxfield.com', 'www.moxfield.com'];
  if (!allowed.some(d => target.hostname === d)) {
    return res.status(403).json({ error: `Domain not allowed: ${target.hostname}` });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; PowerEDH/2.0)',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Upstream error ${upstream.status}: ${upstream.statusText}`,
      });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
