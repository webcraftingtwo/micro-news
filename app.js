/**
 * HIGH FREQUENCY APP v10.2 (CLEAN INSTALL)
 * Fixes: Syntax Error & Loading Glitch
 */

// 1. CONFIGURATION
// Paste your "Published to Web" CSV link inside the quotes
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRNPWeMACmMOYGRs40Ij2W7lSJ4EdbubacRWC1p1hChwZlm6Bzp-uUR6cZw1IAb-ie-fwk3Udx4ZkZ/pub?output=csv"; 
// ^ IMPORTANT: REPLACE THE LINK ABOVE WITH YOUR ACTUAL CSV LINK IF DIFFERENT

// 2. BACKUP DATA (Safety Net)
const BACKUP_STORIES = [
    {
        id: 1,
        category: "SYSTEM",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1000",
        headline: "Connection Issue",
        hook: "Loading backup data.",
        body: "We couldn't reach the live Google Sheet. Showing cached stories instead. Check your URL or internet connection.",
        deep_dive: "If you are the developer: Check the Console (F12) to see the specific error message.",
        source_url: "#",
        theme: "red",
        timestamp: new Date().toISOString()
    },
    {
        id: 2,
        category: "MARKETS",
        image: "https://images.unsplash.com/photo-1611974765270-ca1258634369?q=80&w=1000", 
        headline: "Crypto Flash Crash",
        hook: "Bitcoin dropped $2k in 30 seconds.",
        body: "Whales are dumping positions. Liquidation levels hit $500M. If you are holding leverage, watch your margin closely.",
        deep_dive: "The crash was triggered by a cascading liquidation event on Binance.",
        source_url: "https://bloomberg.com",
        theme: "red",
        timestamp: new Date().toISOString()
    }
];

const Utils = {
    getStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    setStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
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
    }
};

const AppState = {
    likes: Utils.getStorage('hf_likes') || [],
    currentFilter: 'ALL',
    stories: [], 
    toggleLike(id) {
        if (this.likes.includes(id)) this.likes = this.likes.filter(lid => lid !== id);
        else this.likes.push(id);
        Utils.setStorage('hf_likes', this.likes);
        return this.likes.includes(id);
    },
    isLiked(id) { return this.likes.includes(id); }
};

// ==========================================
// 3. DATA ENGINE
// ==========================================
async function loadStories() {
    console.log("Starting App...");
    
    try {
        // Check if URL is placeholder
        if (SHEET_URL.includes("PASTE_YOUR")) throw new Error("URL is still placeholder");

        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error("Sheet response failed");
        
        const text = await response.text();
        
        // Parse CSV
        const rows = text.split('\n').slice(1); // Remove header
        const parsedStories = rows.map((row, index) => {
            // Handle CSV commas correctly
            const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const clean = (txt) => txt ? txt.replace(/^"|"$/g, '').trim() : '';
            
            if (cols.length < 5) return null; 

            return {
                id: index + 100,
                category: clean(cols[1]),
                headline: clean(cols[2]),
                hook: clean(cols[3]),
                body: clean(cols[4]),
                deep_dive: clean(cols[5]),
                source_url: clean(cols[6]),
                image: clean(cols[7]),
                theme: clean(cols[8]) || 'blue',
                timestamp: new Date().toISOString()
            };
        }).filter(s => s !== null);

        if (parsedStories.length === 0) throw new Error("No stories found in sheet");

        AppState.stories = parsedStories;
        console.log("Loaded stories:", parsedStories.length);

    } catch (err) {
        console.warn("Loading Backup Data:", err);
        Utils.showToast("Offline Mode Active");
        AppState.stories = BACKUP_STORIES;
    }

    renderFeed();
    setupInteractions();
}

// ==========================================
// 4. RENDERING
// ==========================================
function timeAgo(dateString) { return "Today"; } 
function getThemeClass(theme) {
    const t = (theme || 'blue').toLowerCase().trim();
    return (t === 'red' || t === 'blue' || t === 'green') ? `theme-${t}` : 'theme-blue';
}

const container = document.getElementById('feed-container');

function renderFeed() {
    container.innerHTML = ''; 
    const filtered = AppState.currentFilter === 'ALL' 
        ? AppState.stories : AppState.stories.filter(s => s.category === AppState.currentFilter);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="card"><h2 class="card-headline">No stories found.</h2></div>';
        return;
    }

    filtered.forEach(story => {
        const article = document.createElement('article');
        article.classList.add('card', getThemeClass(story.theme));
        article.dataset.id = story.id;
        const isLiked = AppState.isLiked(story.id) ? 'liked' : '';
        const likeCount = 100 + (isLiked ? 1 : 0); 

        article.innerHTML = `
            <div class="card-meta">
                <span class="card-category">${story.category}</span>
                <span>LIVE</span>
            </div>
            <div class="card-image-container">
                <img src="${story.image}" class="card-image" loading="lazy" alt="News" onerror="this.style.display='none'">
            </div>
            <h2 class="card-headline">${story.headline}</h2>
            <p class="card-hook">${story.hook}</p>
            <p class="card-body">
                ${story.body} <br><br>
                <span style="font-size: 0.9em; opacity: 0.7; text-decoration: underline;">Tap to read more...</span>
            </p>
            <div class="action-bar">
                <button class="icon-btn like-btn ${isLiked}"><span>♥</span> <span class="like-count">${likeCount}</span></button>
                <button class="icon-btn share-btn"><span>➦</span> Share</button>
            </div>
        `;
        container.appendChild(article);
    });

    const endCard = document.createElement('article');
    endCard.classList.add('card', 'subscribe-card');
    endCard.innerHTML = `
        <h2 class="card-headline" style="font-size: 2rem;">Caught Up.</h2>
        <p class="card-body" style="margin-bottom: 2rem;">Next drop soon.</p>
        <input type="email" placeholder="Email Address" class="subscribe-input">
        <button class="subscribe-btn action-subscribe">Subscribe</button>
    `;
    container.appendChild(endCard);

    observeCards();
}

// ==========================================
// 5. INTERACTIONS
// ==========================================
function setupInteractions() {
    if (window.listenersAttached) return;
    window.listenersAttached = true;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentFilter = e.target.dataset.filter;
            renderFeed();
        });
    });

    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('action-subscribe')) {
            const input = e.target.previousElementSibling;
            if (input.value.includes('@')) {
                Utils.showToast("Subscribed!");
                input.value = '';
            } else { Utils.showToast("Invalid email"); }
            return;
        }
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            e.stopPropagation();
            toggleLikeUI(likeBtn);
            return;
        }
        const shareBtn = e.target.closest('.share-btn');
        if (shareBtn) {
            e.stopPropagation();
            if (navigator.share) navigator.share({ title: 'HF App', url: window.location.href });
            else {
                try { await navigator.clipboard.writeText(window.location.href); Utils.showToast("Link copied!"); } 
                catch (err) { Utils.showToast("Could not copy."); }
            }
            return;
        }
        const card = e.target.closest('.card');
        if (card && card.dataset.id && !e.target.closest('input') && !e.target.closest('button')) {
            openModal(card.dataset.id);
        }
    });

    container.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            const likeBtn = card.querySelector('.like-btn');
            if (likeBtn && !likeBtn.classList.contains('liked')) {
                toggleLikeUI(likeBtn);
                Utils.showToast("Liked!");
            }
        }
    });

    container.addEventListener('scroll', () => {
        const h = container.scrollHeight - container.clientHeight;
        const s = (container.scrollTop / h) * 100;
        document.getElementById('progress-fill').style.width = `${s}%`;
    });
}

function toggleLikeUI(btnElement) {
    const card = btnElement.closest('.card');
    const id = parseInt(card.dataset.id);
    const isNowLiked = AppState.toggleLike(id);
    btnElement.classList.toggle('liked', isNowLiked);
    const countSpan = btnElement.querySelector('.like-count');
    let count = parseInt(countSpan.textContent);
    countSpan.textContent = isNowLiked ? count + 1 : count - 1;
}

function observeCards() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target;
            if (!entry.isIntersecting && entry.boundingClientRect.top < 0) card.classList.add('is-read');
            else if (entry.isIntersecting) card.classList.remove('is-read');
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('.card').forEach(card => observer.observe(card));
}

// --- MODAL ---
const modal = document.getElementById('story-modal');
const modalBody = document.getElementById('modal-body-content');
const modalLink = document.getElementById('modal-source-link');

function openModal(id) {
    const story = AppState.stories.find(s => s.id == id);
    if (!story) return;
    history.pushState({ modalOpen: true }, '', '#story');
    modalBody.innerHTML = `
        <span style="font-family:monospace; color: #a1a1aa;">${story.category}</span>
        <div class="card-image-container" style="height: 180px; margin-bottom: 1rem;">
             <img src="${story.image}" class="card-image" style="filter: none;">
        </div>
        <h3 style="font-size: 2rem; margin: 0.5rem 0 1rem 0; text-transform: uppercase;">${story.headline}</h3>
        <p style="font-size: 1.2rem; line-height: 1.6; color: #e4e4e7;">${story.deep_dive}</p>
    `;
    modalLink.href = story.source_url;
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
// 6. START APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadStories();
});
