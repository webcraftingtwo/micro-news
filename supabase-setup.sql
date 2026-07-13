-- ============================================================
-- HIGH FREQUENCY — Supabase setup
-- Run this once in your Supabase project: SQL Editor → New query
-- → paste everything → Run.
-- ============================================================

-- ---------- STORIES ----------
create table if not exists public.stories (
  id         bigint generated always as identity primary key,
  position   int         not null default 0,       -- feed order (low = first)
  category   text        not null default 'NEWS',
  headline   text        not null,
  hook       text        not null default '',
  body       text        not null default '',
  deep_dive  text        not null default '',
  source_url text        not null default '',
  image      text        not null default '',
  theme      text        not null default 'blue',  -- red | blue | green
  likes      int         not null default 0,
  published  boolean     not null default true,
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

drop policy if exists "Anyone can read published stories" on public.stories;
create policy "Anyone can read published stories"
  on public.stories for select
  to anon
  using (published = true);

-- ---------- SUBSCRIBERS ----------
create table if not exists public.subscribers (
  id         bigint generated always as identity primary key,
  email      text        not null unique,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- Visitors may add their email, but can never read the list.
drop policy if exists "Anyone can subscribe" on public.subscribers;
create policy "Anyone can subscribe"
  on public.subscribers for insert
  to anon
  with check (true);

-- ---------- LIKE COUNTERS ----------
-- Exposed as RPCs so anonymous visitors can bump counters without
-- having update rights on the stories table itself.
create or replace function public.like_story(p_story_id bigint)
returns int
language sql
security definer
set search_path = public
as $$
  update stories set likes = likes + 1 where id = p_story_id
  returning likes;
$$;

create or replace function public.unlike_story(p_story_id bigint)
returns int
language sql
security definer
set search_path = public
as $$
  update stories set likes = greatest(likes - 1, 0) where id = p_story_id
  returning likes;
$$;

grant execute on function public.like_story(bigint)   to anon;
grant execute on function public.unlike_story(bigint) to anon;

-- ---------- SEED CONTENT ----------
insert into public.stories
  (position, category, headline, hook, body, deep_dive, source_url, image, theme)
values
  (1, 'TECH', 'You''re running an app now',
   'This whole feed is three files and a database.',
   'High Frequency is a static web app backed by Supabase: no servers to manage, stories live in Postgres, and the feed updates the moment you edit a row.',
   'The card you''re reading came straight from the stories table in Supabase. Add a row, set published to true, and it appears in the feed instantly — no deploy needed. Likes are real too: every heart on every phone updates the same counter in the database.',
   'https://github.com/webcraftingtwo/micro-news',
   'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200', 'green'),

  (2, 'MARKETS', 'Why compounding feels slow then sudden',
   'The curve is flat for years, then it isn''t.',
   'Compound growth is exponential, but humans read the early, flat part as failure. Most of the payoff lives in the final stretch of the curve.',
   'At 10% a year, money doubles roughly every seven years. The first double is quiet; the fourth double is enormous, because each new gain is calculated on a much larger base. The people who capture exponential returns are usually the ones who simply stayed in long enough to reach the steep part of the curve.',
   'https://www.investopedia.com/terms/c/compoundinterest.asp',
   'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200', 'blue'),

  (3, 'POLITICS', 'How a bill actually becomes law',
   'The version you hear about is rarely the one that passes.',
   'Legislation is a negotiation, not an announcement. A bill is introduced, reshaped in committee, amended on the floor, reconciled between chambers, then signed or vetoed.',
   'Most bills die quietly in committee, never reaching a vote. The ones that survive are usually amended heavily to win enough support, which is why the final text can look very different from the headline proposal. Watching what gets stripped out is frequently more informative than watching what gets announced.',
   'https://www.congress.gov/legislative-process',
   'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?q=80&w=1200', 'red'),

  (4, 'TECH', 'The web is quietly getting native',
   'Installable apps, offline, push — no app store required.',
   'Progressive Web Apps let a website install to your home screen, run full-screen, and work offline. This feed is one of them.',
   'A PWA is just a website that ships a manifest describing how it should install, plus a service worker that caches its files. That combination is enough for the browser to offer ''Add to Home Screen'' and to launch the site full-screen with its own icon. For a content feed like this one, the web platform is more than enough.',
   'https://web.dev/learn/pwa/',
   'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?q=80&w=1200', 'green'),

  (5, 'MARKETS', 'Inflation is a tax nobody voted for',
   'When prices rise, idle cash quietly loses value.',
   'Inflation erodes purchasing power. Money sitting still buys a little less each year, which is why ''safe'' cash isn''t risk-free.',
   'At 3% annual inflation, cash loses roughly a quarter of its purchasing power over a decade. You feel safe because the number on the account doesn''t drop, but what that number can buy does. This is the core argument for owning productive assets over time.',
   'https://www.investopedia.com/terms/i/inflation.asp',
   'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1200', 'blue'),

  (6, 'POLITICS', 'Turnout decides more than opinion',
   'Elections often turn on who shows up, not who''s persuaded.',
   'Campaigns spend enormous effort not on changing minds but on getting existing supporters to actually vote.',
   'Persuasion is expensive and slow; mobilization is cheaper and faster. In many races the pool of truly undecided voters is small, so the marginal vote is easier to win by activating a supporter who might have stayed home than by converting an opponent. Watch the turnout machinery, not just the polls.',
   'https://www.pewresearch.org/topic/politics-policy/',
   'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?q=80&w=1200', 'red');
