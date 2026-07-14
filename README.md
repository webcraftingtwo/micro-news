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

## 🤖 The News Agent (auto-publishing)

The repo includes an AI agent ([`agent/fetch-news.mjs`](agent/fetch-news.mjs)) that
keeps the feed fresh **without any manual work**:

1. Pulls the latest items from RSS feeds (The Verge, Ars Technica, MarketWatch,
   CNBC, BBC, Politico — edit the `FEEDS` list to change sources)
2. Skips anything already in the database (deduped by `source_url`)
3. Has **Claude** rewrite each new item into the card format — headline, hook,
   body, and deep dive — in High Frequency's editorial voice, constrained to a
   strict JSON schema so output is always valid
4. Inserts the new stories into Supabase (each card links back to the original
   article via "Read Source") and unpublishes stories beyond the newest 40

It runs automatically **every 6 hours** via
[`.github/workflows/news-agent.yml`](.github/workflows/news-agent.yml), and can be
triggered manually from the repo's **Actions** tab.

### Agent setup (one time)

Add three repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Where to get it |
| --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key (server-side only — never put this one in the web app) |

### Run it locally

```bash
cd agent && npm install
ANTHROPIC_API_KEY=sk-... SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
  node fetch-news.mjs

# Or test without writing to the database:
DRY_RUN=1 ANTHROPIC_API_KEY=... SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x node fetch-news.mjs
```

Tunables: `MAX_NEW_STORIES` (default 6 per run), `MAX_PER_CATEGORY`, `KEEP_PUBLISHED`,
and the model — all at the top of `fetch-news.mjs`.

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
agent/                  # AI news agent (RSS → Claude → Supabase)
.github/workflows/      # GitHub Pages deploy + scheduled news agent
```
