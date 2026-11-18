# Smart Indoor Navigation – Web (Vercel)

Web version of the Android Studio project. Same frontend, same Python backend (A* routing,
BLE positioning, emergency exits) – the Android/Chaquopy/WebView layer is replaced by Vercel.

```
public/          static frontend (index.html, css/, js/)
api/index.py     Vercel Python serverless function (wraps the original backend)
api/_backend/    original server.py, database.py, graph_engine.py, positioning.py + SQLite DB
vercel.json      routes /api/* to the function
```

## Deploy
**Option A – GitHub:** push this folder to a repo → vercel.com → *Add New Project* → import → Deploy
(no build settings needed; Framework Preset = Other).

**Option B – CLI:** `npm i -g vercel` then `vercel` inside this folder (`vercel --prod` for production).

## Run locally
`vercel dev` (needs the Vercel CLI).

## Things to know (good to mention in your viva)
- **HTTPS is required for camera / mic / GPS** – Vercel gives you this automatically. Voice input
  works best in Chrome/Edge (Web Speech API); text-to-speech uses the browser's speechSynthesis.
- **Data persistence:** Vercel functions have a read-only filesystem, so the SQLite DB is copied to
  `/tmp` on cold start. Admin edits (block corridor, add room), obstacle reports and history work
  but are **temporary** (lost when the instance recycles). For permanent storage swap SQLite for a
  hosted DB (Vercel Postgres/Neon, Turso, Supabase) in `database.py`.
- Object detection (TensorFlow.js/COCO-SSD) and OCR (Tesseract.js) load from CDNs, so they need internet.

## Accounts
`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`. Passwords are PBKDF2-hashed and sessions are
signed tokens (7 days). Set `SMARTNAV_SECRET` in Vercel > Settings > Environment Variables before deploying.
Seeded admin: `admin@smartnav.org` / `admin123` (change it). Admin tools only show for the admin role.
Like all other writes, new accounts live in `/tmp` on Vercel, so use a hosted DB for permanent accounts.
