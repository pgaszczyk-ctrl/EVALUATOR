// api/analyze.js — Vercel serverless function
// Sends deck data to Claude for gameplan analysis.
// Requires ANTHROPIC_API_KEY set in Vercel project environment variables.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.'
    });
  }

  const { commander, colors, deckName, cardNames, themes, stats, score } = req.body || {};
  if (!commander) return res.status(400).json({ error: 'Missing commander in request body' });

  const colorNames = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' };
  const colorStr = (colors||[]).map(c => colorNames[c]||c).join('/') || 'Colorless';

  const prompt = `You are an expert Magic: The Gathering Commander (EDH) analyst. Analyze this deck and provide practical, specific insights.

DECK DATA:
- Commander: ${commander}
- Deck name: ${deckName || 'Unnamed'}
- Colors: ${colorStr} (${(colors||[]).join('')||'C'})
- Power level: ${score}/10
- Avg CMC: ${stats?.avgCmc?.toFixed(2) || '?'}
- Ramp pieces: ${stats?.ramp || 0}
- Card draw spells: ${stats?.draw || 0}
- Tutors: ${stats?.tutor || 0}
- Recursion pieces: ${stats?.recursion || 0}
- Estimated value: $${stats?.estDeckVal || '?'}
- Detected themes: ${(themes||[]).join(', ') || 'None detected'}

NON-LAND CARDS (first 50):
${(cardNames||[]).slice(0,50).join(', ')}

Respond ONLY with a single valid JSON object — no markdown, no explanation, no extra text. Use this exact structure:
{
  "gameplan": "2–3 sentences: what does this deck want to do, how does the commander enable it, what's the typical game arc",
  "wincons": ["specific win condition 1", "specific win condition 2", "specific win condition 3"],
  "keysynergies": ["specific synergy between named cards 1", "specific synergy 2", "specific synergy 3"],
  "weaknesses": ["concrete weakness 1", "concrete weakness 2"],
  "tips": ["practical in-game tip 1", "practical in-game tip 2", "practical in-game tip 3"]
}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({ error: `Anthropic API ${upstream.status}: ${body.slice(0,200)}` });
    }

    const data = await upstream.json();
    const raw = data.content?.[0]?.text || '';

    // Extract JSON robustly — strip any accidental markdown fences
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'AI returned non-JSON response', raw: raw.slice(0,300) });

    const analysis = JSON.parse(match[0]);
    return res.status(200).json(analysis);

  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'AI request timed out. Try again.' });
    return res.status(500).json({ error: err.message });
  }
}
