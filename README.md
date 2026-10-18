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

## Storage

Data lives in `data/db.json`, set by `DATA_FILE`. The server only talks to storage through the four-method `Store` interface in `server/store/Store.ts`.

To move to **Supabase**:

1. Run `supabase/schema.sql` in the Supabase SQL editor.
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
