# Fantasy Tennis

A fantasy-football-style league for our university BUCS tennis club. Managers pick a
squad of club players, captain one each week, and score points from real BUCS results.

Built with Next.js (App Router), Tailwind CSS + shadcn/ui, and Supabase (Auth, Postgres,
Storage). Hosted on Vercel, which deploys every push to `main`.

See [`CLAUDE.md`](./CLAUDE.md) for the full product brief and build phases.

## Environment variables

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL (no `/rest/v1/` on the end) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |

Set them in `.env.local` for local development (see `.env.example`) and in
Vercel → Project → Settings → Environment Variables for deployments. They are baked in
at build time, so redeploy after changing them.

## Scripts

```bash
npm run dev          # local dev server (DEV_SKIP_AUTH=1 skips sign-in locally)
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # Vitest unit tests
npm run screenshots  # 375px phone screenshots of every screen (needs a running server)
```

## Project layout

- `src/app/(app)/` — signed-in screens with the top bar and bottom nav (Home, Team, League, Rules, Admin)
- `src/app/login`, `src/app/auth/*` — Google sign-in, OAuth callback and sign-out
- `src/proxy.ts` — refreshes the Supabase session and sends signed-out visitors to `/login`
- `src/app/globals.css` — theme tokens (colours, fonts, radius, shadows, spacing)
- `src/components/ui` — shadcn/ui primitives; `src/components/app` — app components
- `src/lib` — Supabase clients, UK-time deadline helpers, formatting
