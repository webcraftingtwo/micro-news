/**
 * HIGH FREQUENCY APP v15.0 (SUPER-APP)
 * - Real database: Supabase (Postgres) via REST — stories, global likes, subscribers
 * - Fallback chain: Supabase → bundled stories.json → inline backup (never empty)
 * - Engagement: swipe gestures, double-tap heart bursts, confetti, parallax,
 *   pull-to-refresh, staggered card reveals, haptics, swipe-to-close modal
 */

// ==========================================
// 1. CONFIGURATION — edit these to make the app yours
// ==========================================
const CONFIG = {
  // Your Supabase project (Settings → API). Leave both "" to run on stories.json only.
  // The anon key is safe to ship in client code — access is limited by RLS policies
  // (see supabase-setup.sql).
  supabaseUrl: "",            // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",        // the long "anon public" key

  // Used for the mailto: subscribe fallback when Supabase isn't configured.
  contactEmail: "hello@example.com",
};

// Last-resort inline data if both Supabase and stories.json are unreachable.
const BACKUP_STORIES = [
  {
    id: 1,
    category: "SYSTEM",
    image: "",
    headline: "Offline",
    hook: "Showing backup content.",
    body: "We couldn't reach the database or the bundled story file.",
    deep_dive: "Check your connection, then pull down to refresh. If you're the developer, verify CONFIG.supabaseUrl / supabaseAnonKey and that stories.json is deployed.",
    source_url: "#",
    theme: "red",
  },
];

// ==========================================
// 2. UTILITIES
// ==========================================
const Utils = {
  getStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  setStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
  escape(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  },
  haptic(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} },
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
    }, 2800);
  },
  formatCount(n) {
    if (!n || n < 1) return '';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return String(n);
  },
};

// ==========================================
// 3. DATABASE (Supabase REST — no SDK, no build step)
// ==========================================
const DB = {
  get enabled() { return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey); },
  headers(extra) {
    return Object.assign({
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    }, extra || {});
  },
  async fetchStories() {
    const url = `${CONFIG.supabaseUrl}/rest/v1/stories` +
      `?select=id,category,headline,hook,body,deep_dive,source_url,image,theme,likes` +
      `&published=eq.true&order=position.asc,id.asc`;
    const res = await fetch(url, { headers: this.headers(), cache: 'no-store' });
    if (!res.ok) throw new Error('Supabase HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) throw new Error('No stories in database');
    return rows;
  },
  // Fire-and-forget global like counters (UI updates optimistically).
  bumpLike(storyId, liked) {
    if (!this.enabled || !/^\d+$/.test(String(storyId))) return;
    fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${liked ? 'like_story' : 'unlike_story'}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_story_id: Number(storyId) }),
    }).catch(() => {});
  },
  async subscribe(email) {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/subscribers`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ email }),
    });
    if (res.status === 409) return 'duplicate';
    if (!res.ok) throw new Error('Subscribe HTTP ' + res.status);
    return 'ok';
  },
};

// ==========================================
// 4. STATE
// ==========================================
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
    likes: Number(story.likes) || 0,
  };
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

async function loadStories({ silent } = {}) {
  let stories = null;
  if (DB.enabled) {
    try {
      stories = (await DB.fetchStories()).map((s, i) => normalize(s, i));
      console.log('Loaded', stories.length, 'stories from Supabase');
    } catch (err) {
      console.warn('Supabase unavailable:', err.message);
    }
  }
  if (!stories) {
    try {
      stories = await fetchBundled();
      console.log('Loaded', stories.length, 'stories from stories.json');
    } catch (err) {
      console.warn('Bundled stories unavailable:', err.message);
      if (!silent) Utils.showToast('Offline — showing backup');
      stories = BACKUP_STORIES.map((s, i) => normalize(s, i));
    }
  }
  AppState.stories = stories;
  buildFilters();
  renderFeed();
  setupInteractions();
}

// ==========================================
// 5. RENDERING
// ==========================================
const container = document.getElementById('feed-container');
const fxLayer = document.getElementById('fx-layer');

function getThemeClass(theme) {
  const t = (theme || 'blue').toLowerCase().trim();
  return t === 'red' || t === 'blue' || t === 'green' ? `theme-${t}` : 'theme-blue';
}

function buildFilters() {
  const nav = document.getElementById('filter-bar');
  if (!nav) return;
  const cats = [];
  AppState.stories.forEach((s) => {
    const up = (s.category || '').toUpperCase().trim();
    if (up && up !== 'SYSTEM' && !cats.includes(up)) cats.push(up);
  });
  const buttons = ['ALL', ...cats];
  nav.innerHTML = buttons.map((cat, i) => {
    const label = cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase();
    return `<button class="filter-btn ${i === 0 && AppState.currentFilter === 'ALL' ? 'active' : ''}" data-filter="${Utils.escape(cat)}">${Utils.escape(label)}</button>`;
  }).join('');
  // Restore active state after re-render
  const active = nav.querySelector(`[data-filter="${CSS.escape(AppState.currentFilter)}"]`);
  if (active) {
    nav.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    active.classList.add('active');
  }
}

function getFiltered() {
  const target = AppState.currentFilter.toUpperCase().trim();
  return target === 'ALL'
    ? AppState.stories
    : AppState.stories.filter((s) => s.category && s.category.toUpperCase().trim() === target);
}

function renderFeed() {
  container.innerHTML = '';
  const filtered = getFiltered();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card empty-card active">
        <h2 class="empty-headline">Nothing here yet</h2>
        <p class="card-body" style="-webkit-line-clamp:unset;">No "${Utils.escape(AppState.currentFilter)}" stories right now.</p>
        <button class="filter-btn active" style="margin-top:1.2rem;" onclick="location.reload()">Refresh</button>
      </div>`;
    return;
  }

  filtered.forEach((story) => {
    const article = document.createElement('article');
    article.classList.add('card', getThemeClass(story.theme));
    article.dataset.id = story.id;
    const hasImage = story.image && story.image.includes('http');
    if (!hasImage) article.classList.add('no-image');
    const isLiked = AppState.isLiked(story.id);
    const likeCount = story.likes + (isLiked && DB.enabled ? 0 : 0); // server count already includes ours

    article.innerHTML = `
      <div class="card-bg">${hasImage ? `<img src="${Utils.escape(story.image)}" loading="lazy" alt="">` : ''}</div>
      <div class="card-content">
        <div class="card-meta reveal" style="--i:0">
          <span class="card-category">${Utils.escape(story.category)}</span>
          <span class="card-live">● LIVE</span>
        </div>
        <h2 class="card-headline reveal" style="--i:1">${Utils.escape(story.headline)}</h2>
        <p class="card-hook reveal" style="--i:2">${Utils.escape(story.hook)}</p>
        <p class="card-body reveal" style="--i:3">${Utils.escape(story.body)}</p>
        <span class="card-more reveal" style="--i:4">Tap for the deep dive <span class="chev">▾</span></span>
      </div>
      <div class="action-rail">
        <div class="rail-group">
          <button class="rail-btn like-btn ${isLiked ? 'liked' : ''}" aria-pressed="${isLiked}" aria-label="Like">♥</button>
          <span class="rail-label like-count">${Utils.formatCount(likeCount) || 'Like'}</span>
        </div>
        <div class="rail-group">
          <button class="rail-btn share-btn" aria-label="Share">➦</button>
          <span class="rail-label">Share</span>
        </div>
        <div class="rail-group">
          <button class="rail-btn dive-btn" aria-label="Read deep dive">☰</button>
          <span class="rail-label">Dive</span>
        </div>
      </div>`;
    container.appendChild(article);
  });

  const endCard = document.createElement('article');
  endCard.classList.add('card', 'subscribe-card');
  endCard.dataset.end = '1';
  endCard.innerHTML = `
    <div class="subscribe-emoji">⚡</div>
    <h2 class="subscribe-headline">Caught up.</h2>
    <p class="subscribe-sub">You've seen everything. Get the next drop in your inbox.</p>
    <form class="subscribe-form" novalidate>
      <input type="email" placeholder="Email address" class="subscribe-input" aria-label="Email address" required>
      <button type="submit" class="subscribe-btn">Subscribe</button>
    </form>`;
  container.appendChild(endCard);

  observeCards();
  updateCounter();
}

// ==========================================
// 6. CARD OBSERVATION (active state, counter, confetti)
// ==========================================
let confettiFired = false;

function observeCards() {
  const cards = Array.from(container.querySelectorAll('.card'));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      if (entry.isIntersecting) {
        card.classList.add('active');
        updateCounter();
        if (card.dataset.end && !confettiFired) {
          confettiFired = true;
          spawnConfetti();
          Utils.haptic([15, 40, 15]);
        }
      } else {
        card.classList.remove('active');
      }
    });
  }, { threshold: 0.55 });
  cards.forEach((card) => observer.observe(card));
}

function updateCounter() {
  const chip = document.getElementById('story-counter');
  if (!chip) return;
  const cards = Array.from(container.querySelectorAll('.card[data-id]'));
  if (!cards.length) { chip.textContent = ''; return; }
  const idx = cards.findIndex((c) => c.classList.contains('active'));
  chip.textContent = `${Math.max(idx + 1, 1)}/${cards.length}`;
}

// ==========================================
// 7. FX — hearts & confetti
// ==========================================
function spawnHearts(x, y, big) {
  if (!fxLayer) return;
  if (big) {
    const h = document.createElement('span');
    h.className = 'fx-heart big';
    h.textContent = '♥';
    h.style.left = (x - 40) + 'px';
    h.style.top = (y - 40) + 'px';
    h.style.color = '#ff4d6d';
    fxLayer.appendChild(h);
    setTimeout(() => h.remove(), 950);
  }
  const n = big ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const h = document.createElement('span');
    h.className = 'fx-heart';
    h.textContent = '♥';
    h.style.left = (x - 14 + (Math.random() * 40 - 20)) + 'px';
    h.style.top = (y - 14) + 'px';
    h.style.color = ['#ff4d6d', '#ff6b35', '#ffc53d'][i % 3];
    h.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    h.style.setProperty('--rot', (Math.random() * 50 - 25) + 'deg');
    h.style.animationDelay = (Math.random() * 0.15) + 's';
    fxLayer.appendChild(h);
    setTimeout(() => h.remove(), 1300);
  }
}

function spawnConfetti() {
  if (!fxLayer) return;
  const colors = ['#ff6b35', '#ffc53d', '#10d98c', '#7c5cff', '#ff4d6d', '#ffffff'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('span');
    c.className = 'fx-confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--t', (1.8 + Math.random() * 1.6) + 's');
    c.style.setProperty('--spin', (360 + Math.random() * 540) + 'deg');
    c.style.animationDelay = Math.random() * 0.6 + 's';
    fxLayer.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// ==========================================
// 8. INTERACTIONS
// ==========================================
function setupInteractions() {
  if (window.listenersAttached) return;
  window.listenersAttached = true;

  // --- Filters (delegated; bar is rebuilt from data) ---
  const nav = document.getElementById('filter-bar');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      nav.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.currentFilter = btn.dataset.filter;
      confettiFired = false;
      Utils.haptic(8);
      renderFeed();
      container.scrollTo({ top: 0, behavior: 'auto' });
    });
  }

  // --- Subscribe ---
  container.addEventListener('submit', (e) => {
    if (e.target.classList.contains('subscribe-form')) {
      e.preventDefault();
      handleSubscribe(e.target);
    }
  });

  // --- Taps: rail buttons, card → modal ---
  container.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      e.stopPropagation();
      const r = likeBtn.getBoundingClientRect();
      toggleLikeUI(likeBtn, r.left + r.width / 2, r.top);
      return;
    }
    const shareBtn = e.target.closest('.share-btn');
    if (shareBtn) {
      e.stopPropagation();
      shareStory(shareBtn.closest('.card'));
      return;
    }
    const diveBtn = e.target.closest('.dive-btn');
    if (diveBtn) {
      e.stopPropagation();
      const card = diveBtn.closest('.card');
      if (card) openModal(card.dataset.id);
      return;
    }
    const card = e.target.closest('.card');
    if (card && card.dataset.id && !e.target.closest('input') && !e.target.closest('button') && !e.target.closest('form')) {
      openModal(card.dataset.id);
    }
  });

  // --- Double-tap to like (with heart burst at tap point) ---
  let lastTap = 0;
  container.addEventListener('pointerdown', (e) => {
    const now = Date.now();
    if (now - lastTap < 320) {
      const card = e.target.closest('.card');
      if (card && card.dataset.id && !e.target.closest('button') && !e.target.closest('input')) {
        const likeBtn = card.querySelector('.like-btn');
        spawnHearts(e.clientX, e.clientY, true);
        Utils.haptic([10, 30, 10]);
        if (likeBtn && !likeBtn.classList.contains('liked')) toggleLikeUI(likeBtn, e.clientX, e.clientY, true);
      }
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  // --- Horizontal swipe gestures: right = like, left = deep dive ---
  setupSwipes();

  // --- Pull-to-refresh ---
  setupPullToRefresh();

  // --- Scroll: progress bar + image parallax ---
  container.addEventListener('scroll', () => {
    const h = container.scrollHeight - container.clientHeight;
    const s = h > 0 ? (container.scrollTop / h) * 100 : 0;
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${s}%`;
    requestAnimationFrame(applyParallax);
  }, { passive: true });
}

function applyParallax() {
  const vh = container.clientHeight;
  container.querySelectorAll('.card').forEach((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > vh) return;
    const img = card.querySelector('.card-bg img');
    if (!img) return;
    // -1 (above) … 0 (centered) … 1 (below)
    const progress = rect.top / vh;
    img.style.setProperty('--parallax', `${progress * -34}px`);
  });
}

function setupSwipes() {
  let startX = 0, startY = 0, swiping = false, target = null;
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    target = e.target.closest('.card');
    swiping = Boolean(target && target.dataset.id);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!swiping || !target) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    // Only treat as horizontal gesture when clearly horizontal
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const damped = Math.tanh(dx / 220) * 56;
      target.style.transform = `translateX(${damped}px)`;
      target.style.transition = 'none';
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!swiping || !target) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    target.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    target.style.transform = '';
    if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx > 0) {
        // Swipe right → like
        const likeBtn = target.querySelector('.like-btn');
        const r = target.getBoundingClientRect();
        spawnHearts(r.left + r.width * 0.5, r.top + r.height * 0.5, true);
        Utils.haptic([10, 30, 10]);
        if (likeBtn && !likeBtn.classList.contains('liked')) {
          toggleLikeUI(likeBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, true);
        }
      } else {
        // Swipe left → deep dive
        Utils.haptic(8);
        openModal(target.dataset.id);
      }
    }
    swiping = false; target = null;
  }, { passive: true });
}

function setupPullToRefresh() {
  const ptr = document.getElementById('ptr');
  if (!ptr) return;
  let startY = 0, pulling = false, armed = false;

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop <= 0 && e.touches.length === 1) {
      startY = e.touches[0].clientY;
      pulling = true; armed = false;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 12 && container.scrollTop <= 0) {
      const travel = Math.min(dy * 0.45, 74);
      ptr.classList.add('armed');
      ptr.style.transform = `translateX(-50%) translateY(${travel - 60}px) rotate(${travel * 4}deg)`;
      armed = travel >= 70;
    }
  }, { passive: true });

  container.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (armed) {
      ptr.classList.add('loading');
      ptr.style.transform = 'translateX(-50%) translateY(8px)';
      Utils.haptic(12);
      confettiFired = false;
      await loadStories({ silent: true });
      Utils.showToast('Feed refreshed ⚡');
      setTimeout(() => {
        ptr.classList.remove('loading', 'armed');
        ptr.style.transform = '';
      }, 350);
    } else {
      ptr.classList.remove('armed');
      ptr.style.transform = '';
    }
  }, { passive: true });
}

async function shareStory(card) {
  const story = card ? AppState.stories.find((s) => String(s.id) === card.dataset.id) : null;
  const shareData = {
    title: 'High Frequency',
    text: story ? story.headline : 'High Frequency — intelligence at the speed of culture',
    url: window.location.href,
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (err) {}
  } else {
    try { await navigator.clipboard.writeText(window.location.href); Utils.showToast('Link copied!'); }
    catch (err) { Utils.showToast('Could not copy.'); }
  }
}

async function handleSubscribe(form) {
  const input = form.querySelector('.subscribe-input');
  const email = (input.value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Utils.showToast('Enter a valid email'); return; }

  if (DB.enabled) {
    try {
      const result = await DB.subscribe(email);
      if (result === 'duplicate') Utils.showToast("You're already on the list ⚡");
      else { Utils.showToast('Subscribed! See you at the next drop.'); spawnConfetti(); Utils.haptic([15, 40, 15]); }
      input.value = '';
    } catch (err) {
      Utils.showToast('Something went wrong — try again');
    }
  } else {
    const subject = encodeURIComponent('Subscribe: High Frequency');
    const body = encodeURIComponent(`Please add me to the list: ${email}`);
    window.location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${body}`;
    Utils.showToast('Opening your mail app…');
    input.value = '';
  }
}

function toggleLikeUI(btnElement, x, y, forceOn) {
  const card = btnElement.closest('.card');
  const id = card.dataset.id;
  if (forceOn && AppState.isLiked(id)) return;
  const isNowLiked = AppState.toggleLike(id);
  btnElement.classList.toggle('liked', isNowLiked);
  btnElement.setAttribute('aria-pressed', String(isNowLiked));

  // Update local count optimistically + sync the global counter
  const story = AppState.stories.find((s) => String(s.id) === String(id));
  if (story) {
    story.likes = Math.max(0, story.likes + (isNowLiked ? 1 : -1));
    const label = card.querySelector('.like-count');
    if (label) label.textContent = Utils.formatCount(story.likes) || 'Like';
  }
  DB.bumpLike(id, isNowLiked);

  if (isNowLiked) {
    Utils.haptic(12);
    if (x != null) spawnHearts(x, y, false);
  }
}

// ==========================================
// 9. MODAL (bottom sheet with swipe-to-close)
// ==========================================
const modal = document.getElementById('story-modal');
const modalContent = modal.querySelector('.modal-content');
const modalBody = document.getElementById('modal-body-content');
const modalLink = document.getElementById('modal-source-link');

function openModal(id) {
  const story = AppState.stories.find((s) => String(s.id) === String(id));
  if (!story) return;
  history.pushState({ modalOpen: true }, '', '#story');

  const imageHTML = story.image && story.image.includes('http')
    ? `<img src="${Utils.escape(story.image)}" class="modal-img" alt="${Utils.escape(story.headline)}">`
    : '';

  modalBody.innerHTML = `
    <span class="modal-cat">${Utils.escape(story.category)}</span>
    <h3 class="modal-headline">${Utils.escape(story.headline)}</h3>
    ${imageHTML}
    <p class="modal-dive">${Utils.escape(story.deep_dive)}</p>`;

  const hasSource = story.source_url && story.source_url !== '#';
  modalLink.href = story.source_url;
  modalLink.style.display = hasSource ? 'block' : 'none';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeModal() {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  modalContent.style.transform = '';
  setTimeout(() => modal.classList.add('hidden'), 320);
}

window.addEventListener('popstate', () => { if (!modal.classList.contains('hidden')) closeModal(); });
document.getElementById('close-modal').addEventListener('click', () => {
  if (history.state && history.state.modalOpen) history.back();
  else closeModal();
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    if (history.state && history.state.modalOpen) history.back();
    else closeModal();
  }
});

// Swipe down on the sheet (handle / header area) to dismiss
(function setupModalSwipe() {
  let startY = 0, dragging = false;
  modalContent.addEventListener('touchstart', (e) => {
    // Only start a drag from the top zone or when the inner scroll is at the top
    const scroller = modalBody;
    if (scroller.scrollTop <= 0 || e.target.closest('.modal-handle')) {
      startY = e.touches[0].clientY;
      dragging = true;
    }
  }, { passive: true });
  modalContent.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      modalContent.style.transition = 'none';
      modalContent.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  modalContent.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    modalContent.style.transition = '';
    if (dy > 110) {
      if (history.state && history.state.modalOpen) history.back();
      else closeModal();
    } else {
      modalContent.style.transform = '';
    }
  }, { passive: true });
})();

// ==========================================
// 10. START
// ==========================================
document.addEventListener('DOMContentLoaded', () => loadStories());

// Register the service worker (PWA offline + installable).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
}
