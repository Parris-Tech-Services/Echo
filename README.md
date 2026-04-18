# ECHO VAULT — Mobile

A stylish top-down arena shooter with a signature twist: cast **echoes** that replay your last 3 seconds and fight beside you.

Playable on Android/iOS browsers and desktop. No libraries, no build step, no backend.

---

## How to play it on your Android phone

You have three easy options, from quickest to nicest:

### Option 1 — Google Drive (easiest)
1. Upload the `echo-vault` folder (all three files) to your Google Drive from your computer.
2. On your phone, open Drive → open `index.html` → tap the three-dot menu → **"Open with"** → Chrome.
   - If that doesn't work, download `index.html`, `style.css`, and `game.js` to your phone's storage (all in the same folder), then open `index.html` with Chrome via a file manager like "Files by Google".

### Option 2 — GitHub Pages (best — permanent link)
1. Create a free GitHub account.
2. Make a new public repo (e.g. `echo-vault`).
3. Upload the three files to it.
4. Settings → Pages → Deploy from `main` branch, root folder.
5. Wait a minute, then visit `https://YOUR-USERNAME.github.io/echo-vault/` on your phone.
6. Tap Chrome's menu → **"Add to Home screen"** → now it launches fullscreen like an app.

### Option 3 — Local server on your PC, play over Wi-Fi
1. On your computer in the folder: `python -m http.server 8000`
2. Find your PC's local IP (e.g. `192.168.1.24`).
3. On your phone (same Wi-Fi): visit `http://192.168.1.24:8000`.

---

## Controls (mobile)

| | |
|---|---|
| **Left stick** (bottom-left) | Move |
| **Right stick** (bottom-right) | Aim & auto-fire — just tilt to shoot in a direction |
| **DASH button** | Short dash with invincibility frames |
| **ECHO button** | Release a ghost of your last 3 seconds |
| **II button** (top-right) | Pause |

Landscape orientation plays best. Portrait works but you'll see letterbox bars.

## Controls (desktop)
WASD move • Arrow keys aim & fire • Space dash • Shift echo • P pause

---

## The hook

Everything you do is recorded on a rolling 3-second buffer. When you tap **ECHO**, the game spawns a ghost version of you that replays exactly what you just did — same movement, same shots, same timing. You can have up to 3 echoes alive at once.

The skill is setting up your movement so that your echoes land in useful positions. Echo kills score **1.5×**, so lining up shots your past self will finish is the main way to climb the leaderboard.

## Enemies

- **Grunt** (pink diamond) — chases you, melee contact
- **Darter** (orange triangle) — dashes in arcs, fast
- **Turret** (gold hex) — fires aimed shots, keeps distance
- **Brute** (purple square) — big, slow, tanky, hurts more

New types unlock as waves progress. Every 3 waves you heal 1 HP on clear.

---

## Optional next-step upgrades

1. **Echo modifiers** — rare drops that change your next echo (ricochet, slow-mo with double damage, mirrored)
2. **Arena hazards** — rotating laser bars or safe zones that interact with echo paths
3. **Daily seed mode** — shared seed, local leaderboard, high replayability without a backend

---

MIT license. Have fun, Josh.
