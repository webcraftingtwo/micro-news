# High Frequency (`micro-news`)

A lightning-fast, full-screen, swipeable news feed — a TikTok-style reader for
Markets, Tech, and Politics. Static front-end (no build step), **real Postgres
database via Supabase**, installable as a **PWA**, works offline.

---

## Features

- **Immersive story cards** — full-bleed imagery with cinematic overlays, category
  color glows, staggered content reveals, and parallax as you scroll
- **Super-app interactions** — vertical action rail (like / share / dive),
  double-tap heart bursts, swipe right to like, swipe left for the deep dive,
  pull-to-refresh, confetti when you're caught up, haptic feedback
- **Real database (Supabase)** — stories live in Postgres, **like counts are global**
  (every heart on every phone updates the same counter), subscriber emails are
  actually stored
- **Never-empty fallback chain** — Supabase → bundled `stories.json` → inline backup
- **Dynamic category filters** built from whatever categories your data contains
- **Installable PWA** — add to home screen, runs full-screen, offline app-shell cache
- Bottom-sheet deep-dive modal with swipe-down-to-close, toasts, scroll progress,
  story counter, skeleton loader

---

## Run it locally

The app fetches `stories.json`, so serve it (not `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

---

## Set up the database (Supabase, free — ~5 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project: **SQL Editor → New query**, paste the whole contents of
   [`supabase-setup.sql`](supabase-setup.sql), and **Run**. This creates the
   `stories` and `subscribers` tables, safe row-level-security policies, the
   like-counter functions, and seeds 6 starter stories.
3. In **Settings → API**, copy the **Project URL** and the **anon public** key.
4. Paste both into the `CONFIG` object at the top of [`app.js`](app.js):

```js
const CONFIG = {
  supabaseUrl: "https://YOURPROJECT.supabase.co",
  supabaseAnonKey: "eyJ...your anon key...",
  contactEmail: "you@yourdomain.com",
};
```

That's it. The anon key is safe to ship in client code — visitors can only do what
the RLS policies allow: read published stories, bump like counters, and insert an
email into `subscribers` (they can never read the subscriber list).

### Publishing stories

Open **Table Editor → stories** in Supabase and add a row — it appears in the app
instantly, no deploy needed. Columns:

| Column | Meaning |
| --- | --- |
| `position` | Feed order (low = first) |
| `category` | e.g. `MARKETS`, `TECH`, `POLITICS` — filters build themselves |
| `headline`, `hook`, `body` | Card text (big title, colored one-liner, preview) |
| `deep_dive` | Long text shown in the bottom-sheet modal |
| `source_url`, `image` | Optional link + image URL |
| `theme` | `red`, `blue`, or `green` (controls the card's color glow) |
| `published` | Set `false` to draft/hide a story |

If Supabase isn't configured (or unreachable), the app silently falls back to
[`stories.json`](stories.json), so the feed always works.

---

## Deploy (free, via GitHub Pages)

A workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
publishes the site on every push to `main`. One-time setup:

1. Push to `main`.
2. Repo **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
3. Live at `https://<user>.github.io/micro-news/`.

Any static host (Netlify, Vercel, Cloudflare Pages) also works.

---

## Project structure

```
index.html              # markup + PWA/meta tags
style.css               # design system (deep-ink base, sunset gradient brand)
app.js                  # data loading, Supabase client, rendering, gestures, FX
stories.json            # bundled fallback / demo content
supabase-setup.sql      # one-shot database setup: tables, RLS, RPCs, seed data
manifest.webmanifest    # PWA manifest
sw.js                   # service worker (offline app-shell cache)
icons/                  # app icons
.github/workflows/      # GitHub Pages deploy
```
