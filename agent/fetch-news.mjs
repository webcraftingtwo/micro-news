/**
 * HIGH FREQUENCY — News Agent
 *
 * Pulls fresh stories from RSS feeds, has Claude rewrite each one into the
 * app's card format (headline / hook / body / deep_dive), and inserts them
 * into the Supabase `stories` table. Designed to run on a schedule via
 * GitHub Actions (.github/workflows/news-agent.yml).
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY          — Claude API key (console.anthropic.com)
 *   SUPABASE_URL               — e.g. https://abcdefgh.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (Settings → API). Server-side
 *                                only — never ship this key in the web app.
 *
 * Optional:
 *   MAX_NEW_STORIES            — cap on new stories per run (default 6)
 *   DRY_RUN=1                  — fetch + summarize but skip the DB write
 */

import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";

// ==========================================
// CONFIG — edit feeds to change your sources
// ==========================================
const FEEDS = [
  // RSS is the syndication channel publishers intend for reuse. Cards always
  // link back to the original article via source_url.
  { category: "TECH",     theme: "green", source: "The Verge",    url: "https://www.theverge.com/rss/index.xml" },
  { category: "TECH",     theme: "green", source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { category: "MARKETS",  theme: "blue",  source: "MarketWatch",  url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { category: "MARKETS",  theme: "blue",  source: "CNBC",         url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { category: "POLITICS", theme: "red",   source: "BBC News",     url: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { category: "POLITICS", theme: "red",   source: "Politico",     url: "https://rss.politico.com/politics-news.xml" },
];

const MAX_NEW_STORIES = Number(process.env.MAX_NEW_STORIES || 6);
const MAX_PER_CATEGORY = 2;         // keep the feed balanced across categories
const KEEP_PUBLISHED = 40;          // unpublish stories beyond the newest N
const MODEL = "claude-opus-4-8";

const DRY_RUN = process.env.DRY_RUN === "1";
const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// ==========================================
// Claude — rewrite an RSS item into a card
// ==========================================
const anthropic = new Anthropic();

const CARD_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "Punchy headline, max 9 words. Declarative, no clickbait, no trailing period.",
    },
    hook: {
      type: "string",
      description: "One-line hook shown under the headline. A sharp angle or consequence, max 14 words.",
    },
    body: {
      type: "string",
      description: "2-3 sentence preview of the story for the card. Plain language, no fluff.",
    },
    deep_dive: {
      type: "string",
      description: "4-6 sentence explainer for the tap-to-read view: what happened, why it matters, what to watch next. Only use facts present in the provided material.",
    },
  },
  required: ["headline", "hook", "body", "deep_dive"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are the editor of High Frequency, a fast, swipeable news feed. You rewrite raw news items into tight, energetic cards.

Voice: confident, direct, zero filler. Write like a sharp friend explaining why a story matters, not like a wire service.

Hard rules:
- Use ONLY facts present in the material you're given. Never invent numbers, quotes, names, or outcomes.
- If the material is thin, keep the deep_dive shorter rather than padding or speculating.
- No hashtags, no emoji, no "BREAKING", no editorializing about politics — explain stakes, don't take sides.
- Write in your own words; do not copy sentences from the source.`;

async function summarizeItem(item, feed) {
  const material = [
    `SOURCE: ${feed.source} (${feed.category})`,
    `TITLE: ${item.title}`,
    item.contentSnippet ? `SUMMARY: ${item.contentSnippet.slice(0, 1500)}` : null,
    item.pubDate ? `PUBLISHED: ${item.pubDate}` : null,
    `LINK: ${item.link}`,
  ].filter(Boolean).join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: CARD_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Rewrite this news item as a High Frequency card:\n\n${material}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    console.warn(`  ⤷ skipped (model declined): ${item.title}`);
    return null;
  }
  if (response.stop_reason === "max_tokens") {
    console.warn(`  ⤷ skipped (output truncated): ${item.title}`);
    return null;
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  return JSON.parse(text);
}

// ==========================================
// RSS
// ==========================================
const parser = new Parser({
  timeout: 20000,
  customFields: { item: [["media:content", "mediaContent"], ["media:thumbnail", "mediaThumbnail"]] },
});

function extractImage(item) {
  if (item.enclosure?.url && /image|jpg|jpeg|png|webp/i.test(item.enclosure.type || item.enclosure.url)) {
    return item.enclosure.url;
  }
  const media = item.mediaContent || item.mediaThumbnail;
  const url = media?.$?.url || media?.url;
  return typeof url === "string" ? url : "";
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || [])
      .filter((i) => i.title && i.link)
      .slice(0, 10)
      .map((i) => ({ ...i, _feed: feed }));
  } catch (err) {
    console.warn(`Feed failed (${feed.source}): ${err.message}`);
    return [];
  }
}

// ==========================================
// Supabase (REST, service role)
// ==========================================
function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${path} → HTTP ${res.status}`);
  return res.json();
}

async function getExistingUrls() {
  const rows = await sbGet("stories?select=source_url&order=id.desc&limit=1000");
  return new Set(rows.map((r) => (r.source_url || "").trim()).filter(Boolean));
}

async function insertStories(stories) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stories`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(stories),
  });
  if (!res.ok) throw new Error(`Supabase insert → HTTP ${res.status}: ${await res.text()}`);
}

// Keep the feed fresh: unpublish everything beyond the newest KEEP_PUBLISHED.
async function pruneOldStories() {
  const rows = await sbGet("stories?select=id&published=eq.true&order=position.asc,id.desc");
  const stale = rows.slice(KEEP_PUBLISHED).map((r) => r.id);
  if (!stale.length) return 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stories?id=in.(${stale.join(",")})`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ published: false }),
  });
  if (!res.ok) throw new Error(`Supabase prune → HTTP ${res.status}`);
  return stale.length;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  for (const [name, value] of Object.entries({ ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
    if (!value) {
      console.error(`Missing required env var: ${name}`);
      process.exit(1);
    }
  }

  console.log(`Fetching ${FEEDS.length} feeds…`);
  const feedResults = await Promise.all(FEEDS.map(fetchFeed));
  const allItems = feedResults.flat();
  console.log(`Got ${allItems.length} items total.`);

  const existing = await getExistingUrls();

  // Pick fresh items, capped per category and overall, newest first.
  const perCategory = {};
  const picked = [];
  for (const item of allItems.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))) {
    const cat = item._feed.category;
    if (existing.has(item.link.trim())) continue;
    if ((perCategory[cat] || 0) >= MAX_PER_CATEGORY) continue;
    if (picked.length >= MAX_NEW_STORIES) break;
    perCategory[cat] = (perCategory[cat] || 0) + 1;
    picked.push(item);
  }

  if (!picked.length) {
    console.log("No new stories — feed is up to date.");
    return;
  }
  console.log(`Summarizing ${picked.length} new items with ${MODEL}…`);

  // New stories sort first: position = negative minutes since epoch.
  const basePosition = -Math.floor(Date.now() / 60000);
  const rows = [];
  for (const [i, item] of picked.entries()) {
    console.log(`• [${item._feed.category}] ${item.title}`);
    try {
      const card = await summarizeItem(item, item._feed);
      if (!card) continue;
      rows.push({
        position: basePosition + i,
        category: item._feed.category,
        headline: card.headline,
        hook: card.hook,
        body: card.body,
        deep_dive: card.deep_dive,
        source_url: item.link,
        image: extractImage(item),
        theme: item._feed.theme,
        published: true,
      });
    } catch (err) {
      console.warn(`  ⤷ failed: ${err.message}`);
    }
  }

  if (!rows.length) {
    console.log("Nothing usable produced this run.");
    return;
  }

  if (DRY_RUN) {
    console.log("DRY RUN — would insert:");
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  await insertStories(rows);
  const pruned = await pruneOldStories();
  console.log(`✅ Published ${rows.length} new stories (pruned ${pruned} old ones).`);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});
