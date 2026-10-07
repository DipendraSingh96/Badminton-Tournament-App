# Badminton Tournament App

A web app that helps organisers plan, price and run a badminton tournament. One tournament record drives both **Plan** mode (design and decide) and **Live** mode (run on the day).

Requirements live in [`docs/PRD.md`](docs/PRD.md). Working conventions are in [`CLAUDE.md`](CLAUDE.md).

## Stack

Next.js (App Router) + TypeScript, Supabase (Postgres, Auth, Realtime, RLS), Tailwind + shadcn/ui, Vitest. Hosted on Vercel from `main`.

## Getting started

Requires Node 22 or later.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and publishable key (Supabase dashboard > Project Settings > API Keys).
3. Start the dev server: `npm run dev`, then open http://localhost:3000

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm test` | Run engine tests (Vitest) |
| `npm run lint` | Lint, including the engine import guard |
| `npm run typecheck` | Generate Next route types and run `tsc` |
| `npm run build` | Production build |

## Layout

| Path | Contents |
|---|---|
| `src/engine/` | Pure calculation functions and their tests. No UI, database or framework imports. |
| `src/app/` | Pages and routes |
| `src/components/` | Shared components (`ui/` holds shadcn/ui) |
| `src/lib/` | Supabase clients and shared helpers |
| `supabase/` | Supabase config, migrations and RLS policies |
| `docs/` | PRD and specs |
