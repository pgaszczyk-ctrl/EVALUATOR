# ⚔ PowerEDH — Commander Deck Evaluator

A browser-based tool for evaluating your Commander deck's true power level — beyond just brackets.

Paste an **Archidekt** or **Moxfield** link and the app automatically fetches your deck, pulls card art and prices from Scryfall, and scores it across 7 dimensions.

## 🚀 How to Deploy (GitHub Pages)

1. **Fork or clone** this repository
2. Go to your repo → **Settings** → **Pages**
3. Under *Source*, select `Deploy from a branch` → `main` → `/ (root)`
4. Click **Save**
5. Your app will be live at `https://YOUR-USERNAME.github.io/mtg-power-evaluator/`

> GitHub Pages serves over HTTPS which is required for the Archidekt, Moxfield, and Scryfall APIs to work correctly.

## 📊 Scoring Methodology (100 points total)

| Category | Max | How it's measured |
|---|---|---|
| **Game Changers** | 18 | Count of WotC official Game Changers list cards |
| **Est. Salt Sum** | 17 | Sum of EDHREC community salt scores per card |
| **Deck Value** | 15 | Avg card price from Scryfall (cheapest standard printing, min of Archi/SF to exclude foil inflation) |
| **Avg CMC** | 15 | Lower mana curve = faster = more powerful |
| **Ramp** | 12 | Cards that produce extra mana (oracle text + deck tags) |
| **Card Draw** | 12 | Card advantage spells (oracle text + deck tags) |
| **Tutors** | 11 | Library search spells (oracle text + deck tags) |

### Power Tiers

| Score | Tier |
|---|---|
| 0–24 | 🌱 Precon |
| 25–44 | 🐾 Casual |
| 45–62 | ⚔️ Upgraded |
| 63–77 | 🔥 High Power |
| 78–100 | 💀 cEDH-adjacent |

### About Price Scoring

Card price is used as a **proxy for power** — expensive staples like Mana Crypt, Imperial Seal, or dual lands tend to be expensive because they're objectively powerful. To avoid counting collectability (foils, special art, old borders), the tool uses the **lowest price** between Archidekt's stored price and Scryfall's standard printing price. This way a $200 foil Demonic Tutor scores the same as a $10 reprint.

## 🎨 Dynamic Color Themes

The UI recolors itself based on the commander's color identity:
- Boros (RW) → warm reds and gold
- Dimir (UB) → cold blue-black
- Golgari (BG) → mossy green-black
- … 25+ combinations supported

## ⚠️ Notes

- Decks must be **public** on Archidekt/Moxfield
- Moxfield may have stricter CORS policies — Archidekt works best
- Ramp/draw counts are estimated from oracle text keyword matching and Archidekt category tags; accuracy improves if your deck uses categories in Archidekt
- Combo detection is not included (use [Commander Spellbook](https://commanderspellbook.com) for that)

## License

MIT — do whatever you want with it.
