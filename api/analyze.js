// api/analyze.js — AI-powered deck analysis
// Supports multiple AI providers — tries them in order:
//   1. GOOGLE_API_KEY  → Gemini 1.5 Flash  (FREE, 1500 req/day, get at aistudio.google.com)
//   2. ANTHROPIC_API_KEY → Claude Haiku    (paid, ~$0.001/analysis)
//
// Recommended: set GOOGLE_API_KEY for free usage.
// Get a free Google key: https://aistudio.google.com/ → Get API key (no credit card needed)

const PROMPT_BODY = ({ commander, deckName, colorStr, stats, detectedThemes, cardNames }) => `
You are an expert Magic: The Gathering Commander (EDH) deck analyst.

DECK:
- Commander: ${commander}
- Name: ${deckName||'Unnamed'}
- Colors: ${colorStr}
- Avg CMC: ${stats?.avgCmc?.toFixed(2)||'?'}
- Ramp pieces: ${stats?.ramp||0}
- Card draw: ${stats?.draw||0}
- Tutors: ${stats?.tutor||0}
- Interaction pieces: ${stats?.interaction||0}
- Recursion pieces: ${stats?.recursion||0}
- Est. value: $${stats?.estDeckVal||'?'}
- Heuristic themes detected: ${(detectedThemes||[]).join(', ')||'none'}
- Non-land cards (first 60): ${(cardNames||[]).slice(0,60).join(', ')}

TASK: Analyze this deck. Return weights that RE-SCORE it for its actual strategy. Examples:
- Fast combo with 0 ramp but 8 tutors → ramp weight 0.1, tutors weight 2.0
- Big-mana stompy with high CMC → avgCmc weight 0.2
- Stax with few draw spells → draw weight 0.3
- cEDH with 20 lands → fine for fast combo, avgCmc weight 0.2
Weights: 0.0 = irrelevant, 1.0 = neutral, 2.0 = critical. Default 1.0.

Return ONLY valid JSON, no markdown fences, no text outside:
{
  "strategy": "one of: aggro|combo|control|midrange|stax|voltron|tribal|spellslinger|big-mana|reanimator|tokens|lifegain|sacrifice|graveyard|aristocrats|landfall|chaos|pillow-fort",
  "gameplan": "2-3 sentence description of strategy, how commander enables it, typical win arc",
  "wincons": ["specific win condition 1", "win condition 2", "win condition 3"],
  "keysynergies": ["named card + named card synergy 1", "synergy 2", "synergy 3"],
  "weaknesses": ["specific weakness 1", "weakness 2"],
  "tips": ["practical tip 1", "tip 2", "tip 3"],
  "weights": {
    "ramp": 1.0, "draw": 1.0, "tutors": 1.0, "avgCmc": 1.0,
    "gameChangers": 1.0, "salt": 1.0, "deckPrice": 1.0, "interaction": 1.0
  },
  "weightReasons": {
    "ramp": "only if weight differs from 1.0",
    "draw": "...", "tutors": "...", "avgCmc": "...",
    "gameChangers": "...", "salt": "...", "deckPrice": "...", "interaction": "..."
  },
  "aiKpis": [
    {"key": "combo",       "label": "Combo Potential",   "icon": "♾️",  "score": 0, "reason": "brief"},
    {"key": "resilience",  "label": "Resilience",         "icon": "🛡️",  "score": 0, "reason": "brief"},
    {"key": "speed",       "label": "Speed",              "icon": "⚡",  "score": 0, "reason": "brief"},
    {"key": "interaction", "label": "Interaction",        "icon": "🤝",  "score": 0, "reason": "brief"}
  ],
  "offTheme": [
    {"name": "Card Name", "reason": "why it doesn't fit the strategy"}
  ]
}
aiKpi scores: integers 0-10. weightReasons: only for weights that differ meaningfully from 1.0. offTheme: 3-6 cards maximum, empty array if deck is cohesive. Be specific — name actual cards.`;

async function callGemini(apiKey, promptText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
    }),
    signal: AbortSignal.timeout(28000),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Gemini ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(apiKey, promptText) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: promptText }],
    }),
    signal: AbortSignal.timeout(28000),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 401) throw new Error('Anthropic 401: Invalid API key. Keys start with sk-ant-api03-... Get one at console.anthropic.com → API Keys. Remember to redeploy Vercel after adding the key.');
    throw new Error(`Anthropic ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const googleKey = process.env.GOOGLE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!googleKey && !anthropicKey) {
    return res.status(500).json({
      error: '⚡ No AI key configured. Recommended (FREE): add GOOGLE_API_KEY from aistudio.google.com → Get API key (no credit card). Or add ANTHROPIC_API_KEY from console.anthropic.com. Both go in Vercel → Project → Settings → Environment Variables. Redeploy after adding.'
    });
  }

  const { commander, colors, deckName, cardNames, detectedThemes, stats } = req.body || {};
  if (!commander) return res.status(400).json({ error: 'Missing commander' });

  const colorNames = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' };
  const colorStr = (colors||[]).map(c => colorNames[c]||c).join('/') || 'Colorless';
  const promptText = PROMPT_BODY({ commander, deckName, colorStr, stats, detectedThemes, cardNames });

  let raw = '';
  let providerUsed = '';
  try {
    if (googleKey) {
      raw = await callGemini(googleKey, promptText);
      providerUsed = 'Gemini Flash';
    } else {
      raw = await callAnthropic(anthropicKey, promptText);
      providerUsed = 'Claude Haiku';
    }
  } catch (err) {
    // Try fallback provider if primary fails
    if (googleKey && anthropicKey) {
      try {
        raw = await callAnthropic(anthropicKey, promptText);
        providerUsed = 'Claude Haiku (fallback)';
      } catch (e2) {
        return res.status(500).json({ error: `Both providers failed. Google: ${err.message}. Anthropic: ${e2.message}` });
      }
    } else {
      return res.status(500).json({ error: err.message });
    }
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return res.status(500).json({ error: 'AI returned non-JSON response', raw: raw.slice(0, 300) });

  try {
    const analysis = JSON.parse(match[0]);
    // Clamp weights
    if (analysis.weights) {
      for (const k of Object.keys(analysis.weights)) {
        analysis.weights[k] = Math.max(0, Math.min(2.0, Number(analysis.weights[k]) || 1.0));
      }
    }
    if (analysis.aiKpis) {
      analysis.aiKpis = analysis.aiKpis.map(k => ({
        ...k, score: Math.max(0, Math.min(10, Math.round(Number(k.score) || 0)))
      }));
    }
    analysis._provider = providerUsed;
    return res.status(200).json(analysis);
  } catch (e) {
    return res.status(500).json({ error: `JSON parse error: ${e.message}`, raw: raw.slice(0, 300) });
  }
}
