# ⚔ PowerEDH — Commander Deck Evaluator

Paste an Archidekt or Moxfield link. Get a full power-level breakdown with card art, prices, and scoring across 7 dimensions.

## 🚀 Deploy to Vercel

1. Push this repo to GitHub
2. [vercel.com](https://vercel.com) → **Add New Project** → import your repo → **Deploy**
3. Live at `https://your-project.vercel.app` in ~60 seconds

> **Why a proxy?** Archidekt and Moxfield hardcode `Access-Control-Allow-Origin: http://localhost:3000`. No browser request from any other origin will ever work directly. `api/deck.js` is a Vercel serverless function that fetches those APIs **server-side** (CORS-free) and relays data to the frontend. Scryfall has open CORS and is fetched directly by the browser.

## Project Structure

```
/
├── index.html     ← entire frontend, single file
├── api/
│   └── deck.js   ← serverless CORS proxy for Archidekt & Moxfield
└── README.md
```

## Scoring (100 pts total)

| Category | Pts | Source |
|---|---|---|
| Game Changers | 18 | WotC official list |
| Est. Salt Sum | 17 | EDHREC community scores |
| Deck Value | 15 | Scryfall cheapest printing (min of Archidekt vs SF price — no foil inflation) |
| Avg CMC | 15 | Lower = faster = stronger |
| Ramp | 12 | Oracle text + deck category tags |
| Card Draw | 12 | Oracle text + deck category tags |
| Tutors | 11 | Oracle text + deck category tags |

### Tiers: 0–24 🌱 Precon · 25–44 🐾 Casual · 45–62 ⚔️ Upgraded · 63–77 🔥 High Power · 78–100 💀 cEDH-adjacent

## Notes
- Decks must be **public**
- Moxfield also works via the proxy
- Combo count not included — use [commanderspellbook.com](https://commanderspellbook.com)

MIT License
