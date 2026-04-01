// api/analyze.js — AI-powered deck analysis
// Returns score WEIGHTS per category + AI KPIs + gameplan.
// The weights let the score reflect actual strategy:
//   - combo deck with 0 ramp → ramp weight 0.1 (intentional, not a weakness)
//   - voltron with 20 lands → lands penalized less
//   - cEDH with no draw but 8 tutors → draw weight 0.4, tutor weight 2.0

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not set. Go to Vercel → Project → Settings → Environment Variables and add it. Get your key at console.anthropic.com (keys start with sk-ant-...).'
    });
  }

  const { commander, colors, deckName, cardNames, detectedThemes, stats } = req.body || {};
  if (!commander) return res.status(400).json({ error: 'Missing commander' });

  const colorNames = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' };
  const colorStr = (colors||[]).map(c => colorNames[c]||c).join('/') || 'Colorless';

  const prompt = `You are an expert Magic: The Gathering Commander (EDH) deck analyst.

DECK:
- Commander: ${commander}
- Name: ${deckName||'Unnamed'}
- Colors: ${colorStr}
- Avg CMC: ${stats?.avgCmc?.toFixed(2)||'?'}
- Ramp pieces: ${stats?.ramp||0}
- Card draw: ${stats?.draw||0}
- Tutors: ${stats?.tutor||0}
- Recursion pieces: ${stats?.recursion||0}
- Est. value: $${stats?.estDeckVal||'?'}
- Heuristic themes detected: ${(detectedThemes||[]).join(', ')||'none'}
- Non-land cards (first 60): ${(cardNames||[]).slice(0,60).join(', ')}

TASK: Analyze this deck and return JSON. Your weights will RE-SCORE the deck appropriately for its actual strategy. For example:
- A fast combo deck with 0 ramp but 8 tutors → ramp weight 0.1, tutors weight 2.0
- A big-mana stompy deck with high CMC → avgCmc weight 0.2 (high CMC is intentional)
- A stax deck with few draw spells → draw weight 0.3 (stax doesn't need draw)
- A cEDH deck with 20 lands → this is fine for fast combo, lands weight 0.3
Weights range 0.0 (irrelevant for this strategy) to 2.0 (critical for this strategy). Default 1.0 = neutral.

Return ONLY valid JSON, no text outside it, no markdown fences:
{
  "strategy": "one of: aggro|combo|control|midrange|stax|voltron|tribal|spellslinger|big-mana|reanimator|tokens|lifegain|sacrifice|graveyard|aristocrats|landfall|chaos|pillow-fort",
  "gameplan": "2-3 sentence description of what this deck actually wants to do, how the commander enables it, and what a typical winning game looks like",
  "wincons": ["specific win condition 1", "specific win condition 2", "specific win condition 3"],
  "keysynergies": ["synergy between specific named cards 1", "synergy 2", "synergy 3"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "tips": ["practical in-game tip 1", "tip 2", "tip 3"],
  "weights": {
    "ramp": 1.0,
    "draw": 1.0,
    "tutors": 1.0,
    "avgCmc": 1.0,
    "gameChangers": 1.0,
    "salt": 1.0,
    "deckPrice": 1.0
  },
  "weightReasons": {
    "ramp": "only include if weight deviates significantly from 1.0 — brief reason why",
    "draw": "...",
    "tutors": "...",
    "avgCmc": "...",
    "gameChangers": "...",
    "salt": "...",
    "deckPrice": "..."
  },
  "aiKpis": [
    {"key": "combo",       "label": "Combo Potential",   "icon": "♾️",  "score": 0, "reason": "brief reason"},
    {"key": "resilience",  "label": "Resilience",         "icon": "🛡️",  "score": 0, "reason": "brief reason"},
    {"key": "speed",       "label": "Speed",              "icon": "⚡",  "score": 0, "reason": "brief reason"},
    {"key": "interaction", "label": "Interaction",        "icon": "🤝",  "score": 0, "reason": "brief reason"}
  ],
  "offTheme": [
    {"name": "Card Name", "reason": "One sentence why this card doesn't fit the identified strategy"},
    {"name": "Card Name 2", "reason": "..."}
  ]
}
Rules for offTheme: List 3-6 cards from the deck that seem misaligned with the identified strategy. Only include cards that are genuinely questionable — don't flag lands or obvious staples. If everything fits well, return an empty array. Be specific in the reason: reference the strategy and why this card doesn't advance it.
All aiKpi scores are integers 0-10. weightReasons only needs entries for weights that differ meaningfully from 1.0.`;

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
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(28000),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: `Anthropic API ${upstream.status} — ${body.slice(0,200)}`
      });
    }

    const data = await upstream.json();
    const raw = data.content?.[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'AI returned non-JSON', raw: raw.slice(0,300) });

    const analysis = JSON.parse(match[0]);
    // Clamp all weights to [0.0, 2.0]
    if (analysis.weights) {
      for (const k of Object.keys(analysis.weights)) {
        analysis.weights[k] = Math.max(0, Math.min(2.0, Number(analysis.weights[k]) || 1.0));
      }
    }
    // Clamp all aiKpi scores to [0, 10]
    if (analysis.aiKpis) {
      analysis.aiKpis = analysis.aiKpis.map(k => ({
        ...k, score: Math.max(0, Math.min(10, Math.round(Number(k.score) || 0)))
      }));
    }
    return res.status(200).json(analysis);

  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'AI timed out — score uses static weights.' });
    return res.status(500).json({ error: err.message });
  }
}
