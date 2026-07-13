/**
 * HIGH FREQUENCY APP v14.0 (REVIVAL)
 * - Durable content: live Google Sheet (optional) → bundled stories.json → inline backup
 * - Robust CSV parsing (handles quoted commas and newlines)
 * - Category filters built dynamically from the data
 * - Working subscribe (POST to an endpoint, or mailto fallback)
 * - Honest like state, PWA service worker
 */

// ==========================================
// 1. CONFIGURATION  — edit these to make the app yours
// ==========================================
const CONFIG = {
  // OPTIONAL live source: a *published* Google Sheet CSV URL.
  // (Sheet → File → Share → Publish to web → CSV). Leave "" to use stories.json only.
  sheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRNPWeMACmMOYGRs40Ij2W7lSJ4EdbubacRWC1p1hChwZlm6Bzp-uUR6cZw1IAb-ie-fwk3Udx4ZkZ/pub?output=csv",

  // OPTIONAL email-collection endpoint (e.g. a Formspree URL). Leave "" to fall
  // back to a mailto: link so Subscribe still does something with no backend.
  subscribeEndpoint: "",

  // Used for the mailto: fallback when subscribeEndpoint is empty.
  contactEmail: "hello@example.com",

  // Column order expected in the sheet (0-based). Column A is ignored (id/date).
  columns: { category: 1, headline: 2, hook: 3, body: 4, deep_dive: 5, source_url: 6, image: 7, theme: 8 },
};

// Last-resort inline data if both the sheet and stories.json are unreachable.
const BACKUP_STORIES = [
  {
    id: 1,
    category: "SYSTEM",
    image: "",
    headline: "Offline",
    hook: "Showing backup content.",
    body: "We couldn't reach the live feed or the bundled story file.",
    deep_dive: "Check your connection, then pull to refresh. If you're the developer, verify CONFIG.sheetUrl and that stories.json is deployed.",
    source_url: "#",
    theme: "red",
    timestamp: new Date().toISOString(),
  },
];

const Utils = {
  getStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  setStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
  escape(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  },
  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

const AppState = {
  likes: Utils.getStorage('hf_likes') || [],
  currentFilter: 'ALL',
  stories: [],
  toggleLike(id) {
    id = String(id);
    if (this.likes.includes(id)) this.likes = this.likes.filter((lid) => lid !== id);
    else this.likes.push(id);
    Utils.setStorage('hf_likes', this.likes);
    return this.likes.includes(id);
  },
  isLiked(id) { return this.likes.includes(String(id)); },
};

// ==========================================
// 2. DATA ENGINE
// ==========================================

// Full CSV parser: correctly handles quoted fields containing commas and newlines.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else field += c;
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore; handled by \n
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalize(story, index) {
  return {
    id: story.id != null ? story.id : 's' + index,
    category: (story.category || 'NEWS').trim(),
    headline: (story.headline || '').trim(),
    hook: (story.hook || '').trim(),
    body: (story.body || '').trim(),
    deep_dive: (story.deep_dive || story.body || '').trim(),
    source_url: (story.source_url || '#').trim(),
    image: (story.image || '').trim(),
    theme: (story.theme || 'blue').trim(),
    timestamp: story.timestamp || new Date().toISOString(),
  };
}

async function fetchSheet() {
  if (!CONFIG.sheetUrl) return null;
  const res = await fetch(CONFIG.sheetUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('Sheet HTTP ' + res.status);
  const rows = parseCSV(await res.text());
  const c = CONFIG.columns;
  const stories = rows.slice(1).map((cols, i) => {
    if (cols.length < 5) return null;
    return normalize({
      category: cols[c.category], headline: cols[c.headline], hook: cols[c.hook],
      body: cols[c.body], deep_dive: cols[c.deep_dive], source_url: cols[c.source_url],
      image: cols[c.image], theme: cols[c.theme],
    }, i);
  }).filter((s) => s && s.headline);
  if (!stories.length) throw new Error('Sheet had no usable rows');
  return stories;
}

async function fetchBundled() {
  const res = await fetch('./stories.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('stories.json HTTP ' + res.status);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.stories || [];
  const stories = list.map((s, i) => normalize(s, i)).filter((s) => s.headline);
  if (!stories.length) throw new Error('stories.json empty');
  return stories;
}

async function loadStories() {
  let stories = null;
  try {
    stories = await fetchSheet();
    if (stories) console.log('Loaded', stories.length, 'stories from live sheet');
  } catch (err) {
    console.warn('Live sheet unavailable:', err.message);
  }
  if (!stories) {
    try {
      stories = await fetchBundled();
      console.log('Loaded', stories.length, 'stories from stories.json');
    } catch (err) {
      console.warn('Bundled stories unavailable:', err.message);
      Utils.showToast('Offline — showing backup');
      stories = BACKUP_STORIES.map((s, i) => normalize(s, i));
    }
  }
  AppState.stories = stories;
  buildFilters();
  renderFeed();
  setupInteractions();
}

// ==========================================
// 3. RENDERING
// ==========================================
function getThemeClass(theme) {
  const t = (theme || 'blue').toLowerCase().trim();
  return t === 'red' || t === 'blue' || t === 'green' ? `theme-${t}` : 'theme-blue';
}

const container = document.getElementById('feed-container');

// Build the filter bar from the categories actually present in the data.
function buildFilters() {
  const nav = document.querySelector('.filter-bar');
  if (!nav) return;
  const cats = [];
  AppState.stories.forEach((s) => {
    const up = (s.category || '').toUpperCase().trim();
    if (up && up !== 'SYSTEM' && !cats.includes(up)) cats.push(up);
  });
  const buttons = ['ALL', ...cats];
  nav.innerHTML = buttons.map((cat, i) => {
    const label = cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase();
    return `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-filter="${Utils.escape(cat)}">${Utils.escape(label)}</button>`;
  }).join('');
}

function renderFeed() {
  container.innerHTML = '';
  const targetFilter = AppState.currentFilter.toUpperCase().trim();
  const filtered = targetFilter === 'ALL'
    ? AppState.stories
    : AppState.stories.filter((s) => s.category && s.category.toUpperCase().trim() === targetFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="justify-content:center;align-items:center;text-align:center;">
        <h2 class="card-headline" style="font-size:2rem;color:#555;">Nothing here yet</h2>
        <p class="card-body">No "${Utils.escape(AppState.currentFilter)}" stories right now.</p>
        <button class="filter-btn active" style="margin-top:1rem;" onclick="location.reload()">Refresh</button>
      </div>`;
    return;
  }

  filtered.forEach((story) => {
    const article = document.createElement('article');
    article.classList.add('card', getThemeClass(story.theme));
    article.dataset.id = story.id;
    const isLiked = AppState.isLiked(story.id);

    let imageHTML;
    if (story.image && story.image.includes('http')) {
      imageHTML = `<div class="card-image-container">
        <img src="${Utils.escape(story.image)}" class="card-image" loading="lazy" alt="${Utils.escape(story.headline)}">
      </div>`;
    } else {
      imageHTML = `<div class="card-image-container" style="background:#18181b;"></div>`;
    }

    article.innerHTML = `
      <div class="card-meta">
        <span class="card-category">${Utils.escape(story.category)}</span>
        <span>LIVE</span>
      </div>
      ${imageHTML}
      <h2 class="card-headline">${Utils.escape(story.headline)}</h2>
      <p class="card-hook">${Utils.escape(story.hook)}</p>
      <p class="card-body">
        ${Utils.escape(story.body)}<br><br>
        <span style="font-size:0.9em;opacity:0.7;text-decoration:underline;">Tap to read more…</span>
      </p>
      <div class="action-bar">
        <button class="icon-btn like-btn ${isLiked ? 'liked' : ''}" aria-pressed="${isLiked}">
          <span>♥</span> <span class="like-label">${isLiked ? 'Liked' : 'Like'}</span>
        </button>
        <button class="icon-btn share-btn"><span>➦</span> Share</button>
      </div>`;
    container.appendChild(article);
  });

  const endCard = document.createElement('article');
  endCard.classList.add('card', 'subscribe-card');
  endCard.innerHTML = `
    <h2 class="card-headline" style="font-size:2rem;">Caught up.</h2>
    <p class="card-body" style="margin-bottom:2rem;">Get the next drop in your inbox.</p>
    <form class="subscribe-form" novalidate>
      <input type="email" placeholder="Email address" class="subscribe-input" aria-label="Email address" required>
      <button type="submit" class="subscribe-btn">Subscribe</button>
    </form>`;
  container.appendChild(endCard);

  observeCards();
}

// ==========================================
// 4. INTERACTIONS
// ==========================================
function setupInteractions() {
  if (window.listenersAttached) return;
  window.listenersAttached = true;

  // Filter buttons (delegated, since the bar is rebuilt from data).
  const nav = document.querySelector('.filter-bar');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      nav.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.currentFilter = btn.dataset.filter;
      renderFeed();
      container.scrollTo({ top: 0 });
    });
  }

  container.addEventListener('submit', (e) => {
    if (e.target.classList.contains('subscribe-form')) {
      e.preventDefault();
      handleSubscribe(e.target);
    }
  });

  container.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) { e.stopPropagation(); toggleLikeUI(likeBtn); return; }

    const shareBtn = e.target.closest('.share-btn');
    if (shareBtn) {
      e.stopPropagation();
      const card = shareBtn.closest('.card');
      const story = AppState.stories.find((s) => String(s.id) === card?.dataset.id);
      const shareData = { title: 'High Frequency', text: story?.headline || 'High Frequency', url: window.location.href };
      if (navigator.share) { try { await navigator.share(shareData); } catch (err) {} }
      else {
        try { await navigator.clipboard.writeText(window.location.href); Utils.showToast('Link copied!'); }
        catch (err) { Utils.showToast('Could not copy.'); }
      }
      return;
    }

    const card = e.target.closest('.card');
    if (card && card.dataset.id && !e.target.closest('input') && !e.target.closest('button') && !e.target.closest('form')) {
      openModal(card.dataset.id);
    }
  });

  container.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn && !likeBtn.classList.contains('liked')) {
      toggleLikeUI(likeBtn);
      Utils.showToast('Liked!');
    }
  });

  container.addEventListener('scroll', () => {
    const h = container.scrollHeight - container.clientHeight;
    const s = h > 0 ? (container.scrollTop / h) * 100 : 0;
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${s}%`;
  });
}

function handleSubscribe(form) {
  const input = form.querySelector('.subscribe-input');
  const email = (input.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Utils.showToast('Enter a valid email'); return; }

  if (CONFIG.subscribeEndpoint) {
    fetch(CONFIG.subscribeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('bad status');
        Utils.showToast('Subscribed!');
        input.value = '';
      })
      .catch(() => Utils.showToast('Something went wrong — try again'));
  } else {
    // No backend configured: open the user's mail client so it genuinely does something.
    const subject = encodeURIComponent('Subscribe: High Frequency');
    const body = encodeURIComponent(`Please add me to the list: ${email}`);
    window.location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${body}`;
    Utils.showToast('Opening your mail app…');
    input.value = '';
  }
}

function toggleLikeUI(btnElement) {
  const card = btnElement.closest('.card');
  const isNowLiked = AppState.toggleLike(card.dataset.id);
  btnElement.classList.toggle('liked', isNowLiked);
  btnElement.setAttribute('aria-pressed', String(isNowLiked));
  const label = btnElement.querySelector('.like-label');
  if (label) label.textContent = isNowLiked ? 'Liked' : 'Like';
}

function observeCards() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      if (!entry.isIntersecting && entry.boundingClientRect.top < 0) card.classList.add('is-read');
      else if (entry.isIntersecting) card.classList.remove('is-read');
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.card').forEach((card) => observer.observe(card));
}

// --- MODAL ---
const modal = document.getElementById('story-modal');
const modalBody = document.getElementById('modal-body-content');
const modalLink = document.getElementById('modal-source-link');

function openModal(id) {
  const story = AppState.stories.find((s) => String(s.id) === String(id));
  if (!story) return;
  history.pushState({ modalOpen: true }, '', '#story');

  let imageHTML = '';
  if (story.image && story.image.includes('http')) {
    imageHTML = `<div class="card-image-container" style="height:180px;margin-bottom:1rem;">
      <img src="${Utils.escape(story.image)}" class="card-image" style="filter:none;" alt="${Utils.escape(story.headline)}">
    </div>`;
  }

  modalBody.innerHTML = `
    <span style="font-family:monospace;color:#a1a1aa;">${Utils.escape(story.category)}</span>
    ${imageHTML}
    <h3 style="font-size:2rem;margin:0.5rem 0 1rem 0;text-transform:uppercase;">${Utils.escape(story.headline)}</h3>
    <p style="font-size:1.2rem;line-height:1.6;color:#e4e4e7;">${Utils.escape(story.deep_dive)}</p>`;

  const hasSource = story.source_url && story.source_url !== '#';
  modalLink.href = story.source_url;
  modalLink.style.display = hasSource ? 'block' : 'none';
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('active'), 10);
}
function closeModal() {
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 300);
}
window.addEventListener('popstate', () => { if (!modal.classList.contains('hidden')) closeModal(); });
document.getElementById('close-modal').addEventListener('click', () => {
  if (history.state && history.state.modalOpen) history.back();
  else closeModal();
});

// ==========================================
// 5. START
// ==========================================
document.addEventListener('DOMContentLoaded', loadStories);

// Register the service worker (PWA offline + installable).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
}
