@AGENTS.md

# Badminton Tournament App

A web app that helps organisers plan, price and run a badminton tournament. One tournament record serves two modes: Plan (design and decide) and Live (run on the day). Read `docs/PRD.md` before starting any work.

## Stack

* Next.js (App Router) + TypeScript (strict mode)
* Supabase: Postgres, Auth, Realtime, Row Level Security
* Hosting: Vercel (deploys from the main branch)
* Tests: Vitest
* UI: Tailwind + shadcn/ui, styled to the sporty high-contrast direction through the tokens in `src/app/globals.css` (see `docs/PRD.md`, "Design direction"). Icons: Phosphor.

## Structure

* `src/engine/`: pure TypeScript functions for all calculations (capacity, format generation, fixtures, brackets, tiebreaks, schedule, finance). No UI, database or framework imports in here.
* `src/app/`: pages and components
* `src/lib/`: Supabase client and shared helpers
* `docs/`: PRD and specs. Source of truth for requirements.

## Commands

* `npm run dev`: start local dev server
* `npm test`: run engine tests
* `npm run lint` and `npm run typecheck`: run both before finishing any task

## Conventions

* All calculation logic lives in `src/engine/` and has tests. Never put business rules in components.
* No tournament values (pair counts, group sizes, match counts, durations, fees, costs) in application code. Every one is an organiser input or is calculated from inputs. Sample values belong only in test files.
* Every tournament setting that affects results (match rules, group sizes, handicap, slot length, tiebreak order, eligibility) is a stored, editable value.
* Tournament structure is locked once a tournament goes Live. Only the controlled changes listed in the PRD may modify it, and each must write an audit log entry.
* Permissions are enforced in Supabase RLS, not only in the UI.
* Live screens are mobile-first. The court board must also work on a large screen.
* Store times in UTC; display in the tournament's time zone. UK English in all copy.
* Never commit secrets. Use `.env.local` and keep `.env.example` current.

## How to work

* One slice at a time (see `docs/PRD.md`, "Build slices"). Start each slice in plan mode and propose an approach before writing code.
* Keep changes small and committed per logical step.
* If a requirement is ambiguous or contradicts another, ask. Don't guess.
* Don't add anything listed under "Out of scope" in the PRD.
