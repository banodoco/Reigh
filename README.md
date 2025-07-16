# Reigh: Local Development

This repo is only used for development. For actual usage - including local usage, run in [Reigh.art](https://reigh.art/).

Looking for the full architecture & code walkthrough? Check **[structure.md](structure.md)**.  

Need the Python worker that processes queued tasks? See **[Headless-Wan2GP](https://github.com/peteromallet/Headless-Wan2GP)**.

---

## Prerequisites

* **Node.js 18+** and npm
* **Docker** running locally (Supabase containers rely on it)
* **Supabase CLI v1+** — `brew install supabase/tap/supabase` or see the [official docs](https://supabase.com/docs/guides/cli)

## Quick Start

1. **Clone & install dependencies**
   ```bash
   git clone https://github.com/peteromallet/reigh
   cd reigh && npm install
   ```
2. **Create `.env` & start Supabase**
   ```bash
   cp .env.example .env          # base env file
   supabase start                # launches Postgres, Auth, Storage, Realtime
   # copy the printed SUPABASE_URL, ANON_KEY & SERVICE_ROLE_KEY into .env
   supabase db push              # applies Drizzle migrations
   ```
3. **Run the app (two terminals)**
   ```bash
   # Terminal 1 – Front-end
   npm run dev              # Vite on http://localhost:2222

   # Terminal 2 – Background worker / WebSocket server
   npm run start:api        # Express worker on http://localhost:8085 (no REST routes)
   ```

That’s all you need to get Reigh running.  For advanced commands, troubleshooting, or deployment notes, head over to the docs linked above.
