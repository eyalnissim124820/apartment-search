# מוצאים בית · Home Hunt

A mobile-first web app for Ofir & Eyal to track their apartment search together. Hebrew (RTL) by default, with an English toggle.

## Run

```bash
npm install
npm run dev        # API on :3001 + Vite on :5173 (open on your phone via the LAN address Vite prints)
```

Production:

```bash
npm run build
npm start          # serves the built app + API on $PORT (default 3001)
```

## How it works

- **No passwords.** You pick Ofir or Eyal on the first screen. The choice is saved in the browser and sent as an `X-User` header, so every action is attributed to the right person.
- **Pipeline:** ממתין לבדיקה → רלוונטי → יצרנו קשר → התקבלה תגובה → מאושר → מתקדמים מול בעלים → חוזה (plus נדחה, which sits outside the flow).
- **Approve together, Tinder-style.** Each person votes on the current step. When both approve, the apartment moves to the next step. When both reject, it moves to Rejected. A split vote stays open and gets flagged as "let's talk". Either of you can still set any status by hand, and a rejected apartment can be restored to the step it was on.
- **Contacts:** every listing starts with a contact person. When an apartment reaches "proceeding with owner", the app asks for the owner's details. Each contact has a call button and a WhatsApp button.
- **Sync:** the app refreshes every 15 seconds and whenever the tab gets focus, so you see each other's changes.

## Features added on top

| Feature | How it works | Cost |
|---|---|---|
| **Link auto-fill** | Paste a Yad2 / Madlan / any listing link. The server reads the page's embedded data (Next.js/Apollo state, JSON-LD, Open Graph) and fills the form. Yad2 and Madlan sometimes block automated readers; when that happens, the app asks you to paste the ad text, and a Hebrew parser pulls out price, rooms, size, floor, address, arnona, features and phone numbers. | Free |
| **Viewing checklist** | `/apt/:id/checklist`: 12 things to check on site (water pressure, mould, noise, signal…). Each item can be marked OK or an issue and given a note, and both of you see it live. | Free |
| **Map + commute** | Addresses are geocoded with OpenStreetMap **Nominatim**. Driving time to each partner's workplace comes from the public **OSRM** server (if OSRM is down, the app shows a straight-line estimate marked "estimate"). Each apartment also has a public-transport button that opens Google Maps directions. Map tiles: CARTO/OSM. Set work addresses in **Settings**. | Free |
| **Budget cap** | Set a monthly maximum in Settings, based on rent only or rent plus arnona and building fee. Apartments over it get a red price and a warning, and there's a "within budget" filter. | Free |
| **Push notifications** | Standard **Web Push (VAPID)**: no third-party account, and the server sends directly through the browser's own push service. You get alerts when your partner votes, adds an apartment, changes a status or comments, when you have a match, and 24h and 1h before a viewing. Turn it on per device in Settings. | Free |

### Push notification notes
- VAPID keys are generated on first run and stored with the data. To pin them, set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`) and `VAPID_SUBJECT` (a `mailto:` you own).
- **iPhone:** open the site in Safari → Share → *Add to Home Screen*, then open the app from the home screen and enable notifications in Settings (iOS 16.4+).
- Push needs HTTPS (localhost is fine for development).
- Viewing reminders: the long-running server checks every 5 minutes by itself. On Vercel, a scheduler calls `/api/cron/reminders` instead (see below).

### Free-service limits
Nominatim allows about 1 request per second (the server queues requests). The OSRM demo server is best-effort. For heavier use, point `GEOCODER_URL` / `OSRM_URL` at self-hosted instances.

## Deploying on Vercel (current setup)

- `api/index.ts` runs the whole Express API as one Vercel Function; `vercel.json` sends `/api/*` to it and every other path to the SPA.
- Storage is Supabase (`STORAGE=supabase`). The function runs in `dub1`, next to the Supabase project in `eu-west-1`.
- Background work after a response (push sends, geocoding) uses `waitUntil`.
- **Reminders:** Vercel Hobby cron runs only once a day, so Supabase `pg_cron` + `pg_net` calls `GET /api/cron/reminders` every 5 minutes with `Authorization: Bearer $CRON_SECRET` (job name `viewing-reminders`; inspect with `select * from cron.job;`).
- `GET /api/health` reports storage, push and cron readiness.

Vercel env vars: `STORAGE`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (optional: `TZ_DISPLAY`, `GEOCODER_URL`, `OSRM_URL`, `GEO_USER_AGENT`).

## Tests

```bash
npm test
```

## Storage

Data lives in `data/db.json`, set by `DATA_FILE`. The server only talks to storage through the small `Store` interface in `server/store/Store.ts`.

To move to **Supabase**:

1. Run `supabase/schema.sql` in the Supabase SQL editor (creates `apartments` and `app_meta`).
2. Set `STORAGE=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (see `.env.example`).
3. Optionally, copy existing data across. Each apartment in `db.json` becomes one row, with the whole object in the `data` column.

> Hosting note: platforms with temporary disks (Vercel, Render's free tier, etc.) wipe `db.json` on every deploy or restart. Use Supabase there, or a host with a persistent volume.

## Layout

```
shared/     domain types + workflow rules (used by server and client)
server/     Express API, service layer (business rules), storage adapters
src/        React + Tailwind client (pages/, components/, i18n/)
supabase/   SQL schema for the Supabase adapter
```
