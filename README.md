# High Frequency (`micro-news`)

A lightning-fast, full-screen, swipeable news feed — think a TikTok-style reader for
Markets, Tech, and Politics. It's a **static web app** (one HTML file, one stylesheet,
one script), installable as a **PWA**, and it works offline.

⚡ **No backend. No build step. No database.** Just deploy the files.

---

## Features

- **Full-screen snap feed** — one story per screen, swipe/scroll to advance
- **Durable content** — loads from a live Google Sheet if configured, falls back to a
  bundled `stories.json`, then to inline backup data, so the feed is **never empty**
- **Category filters** built automatically from whatever categories your data contains
- **Installable PWA** — "Add to Home Screen", runs full-screen, works offline via a
  service worker
- **Likes** (saved locally), **native share**, double-tap to like, slide-up "deep dive"
  modal, scroll progress bar, skeleton loader, toast notifications
- **Working subscribe** — POSTs to an endpoint you configure, or falls back to a
  `mailto:` link so it always does something

---

## Run it locally

Because the app fetches `stories.json`, open it through a local server (not `file://`):

```bash
# any static server works; pick one you have
python3 -m http.server 8000
# then open http://localhost:8000
```

## Make it yours

All configuration lives at the top of [`app.js`](app.js) in the `CONFIG` object:

| Setting | What it does |
| --- | --- |
| `sheetUrl` | A **published** Google Sheet CSV URL. Rows overlay the bundled content. Leave `""` to use `stories.json` only. |
| `subscribeEndpoint` | A form endpoint (e.g. [Formspree](https://formspree.io)) that receives `{ "email": ... }`. Leave `""` for the `mailto:` fallback. |
| `contactEmail` | Address used by the `mailto:` fallback. |

### Adding stories

**Option A — edit the file.** Update [`stories.json`](stories.json) and redeploy. Each
story looks like:

```json
{
  "category": "TECH",
  "headline": "Short, punchy headline",
  "hook": "One-line hook shown under the headline.",
  "body": "The preview paragraph shown on the card.",
  "deep_dive": "The longer text shown in the tap-to-read modal.",
  "source_url": "https://example.com/full-article",
  "image": "https://…",
  "theme": "blue"
}
```

`theme` is `red`, `blue`, or `green`. `image` and `source_url` are optional.

**Option B — publish from a Google Sheet.** In the Sheet, use columns in this order:
`id | category | headline | hook | body | deep_dive | source_url | image | theme`
(the first row is treated as a header and skipped, and column A / `id` is ignored).
Then **File → Share → Publish to web → CSV**, and paste that URL into `CONFIG.sheetUrl`.

---

## Deploy (free, via GitHub Pages)

A workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes
the site on every push to `main`. To turn it on once:

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and select
   **GitHub Actions**.
3. Your site goes live at `https://<user>.github.io/micro-news/`.

Any other static host (Netlify, Vercel, Cloudflare Pages) also works — just serve the
repo root.

---

## Project structure

```
index.html              # markup + PWA/meta tags
style.css               # all styling
app.js                  # data loading, rendering, interactions, PWA registration
stories.json            # bundled fallback / demo content
manifest.webmanifest    # PWA manifest
sw.js                   # service worker (offline app-shell cache)
icons/                  # app icons (192, 512, apple-touch)
.github/workflows/      # GitHub Pages deploy
```
