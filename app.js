/**
 * HIGH FREQUENCY APP v10.1 (SAFETY MODE)
 * Features: Google Sheets Connection + Backup Data Fallback
 */

// 1. CONFIGURATION
// Paste your "Published to Web" CSV link here.
const SHEET_URL = "PASTE_YOUR_GOOGLE_SHEET_CSV_LINK_HERE"; 

// 2. BACKUP DATA (Loads if Sheet fails)
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
// 3. DATA ENGINE (ROBUST)
// ==========================================
async function loadStories() {
    console.log("Attempting to load Sheet...");
    
    try {
        if (!SHEET_URL.includes("http")) throw new Error("Invalid URL format");

        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error("Sheet response not OK");
        
        const text = await response.text();
        console.log("Sheet data received. Parsing...");

        // Parse CSV
        const rows = text.split('\n').slice(1); // Remove header row
        const parsedStories = rows.map((row, index) => {
            const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const clean = (txt) => txt ? txt.replace(/^"|"$/g, '').trim() : '';
            
            if (cols.length < 5) return null; // Skip bad rows

            return {
                id: index + 100, // IDs start at 100 to avoid conflict
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

        if (parsedStories.length === 0) throw new Error("Sheet was empty or parsed 0 rows");

        AppState.stories = parsedStories;
        console.log("Success! Loaded " + parsedStories.length + " stories.");

    } catch (err) {
        console.warn("Sheet Load Failed. Using Backup.", err);
        Utils.showToast("Using Offline Data");
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
                <img src="${story.image}" class="card-image" loading="lazy" alt="News Image" onerror="this.style.display='none'">
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
                Utils.showToast("Subscribed successfully!");
                input.value = '';
            } else { Utils.showToast("Please enter a valid email."); }
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
                catch (err) { Utils.showToast("Could not copy link."); }
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
        const height = container.scrollHeight - container.clientHeight;
        const scrolled = (container.scrollTop / height) * 100;
        document.getElementById('progress-fill').style.width = `${scrolled}%`;
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
// 6. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadStories();
});// ==========================================
// 4. INTERACTIONS (Same as before)
// ==========================================
function setupInteractions() {
    // Only attach listeners once to avoid duplicates
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
                Utils.showToast("Subscribed successfully!");
                input.value = '';
            } else { Utils.showToast("Please enter a valid email."); }
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
                catch (err) { Utils.showToast("Could not copy link."); }
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
        const height = container.scrollHeight - container.clientHeight;
        const scrolled = (container.scrollTop / height) * 100;
        document.getElementById('progress-fill').style.width = `${scrolled}%`;
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
// 5. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // START THE ENGINE
    loadStories();
});            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentFilter = e.target.dataset.filter;
            renderFeed();
        });
    });

    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('action-subscribe')) {
            const input = e.target.previousElementSibling;
            if (input.value.includes('@')) {
                Utils.showToast("Subscribed successfully!");
                input.value = '';
            } else { Utils.showToast("Please enter a valid email."); }
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
            if (navigator.share) {
                navigator.share({ title: 'HF App', url: window.location.href });
            } else {
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    Utils.showToast("Link copied to clipboard!");
                } catch (err) { Utils.showToast("Could not copy link."); }
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
        const height = container.scrollHeight - container.clientHeight;
        const scrolled = (container.scrollTop / height) * 100;
        document.getElementById('progress-fill').style.width = `${scrolled}%`;
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
            if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
                card.classList.add('is-read');
            } else if (entry.isIntersecting) {
                card.classList.remove('is-read');
            }
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('.card').forEach(card => observer.observe(card));
}

// --- MODAL & BACK BUTTON LOGIC ---
const modal = document.getElementById('story-modal');
const modalBody = document.getElementById('modal-body-content');
const modalLink = document.getElementById('modal-source-link');

function openModal(id) {
    const story = rawStories.find(s => s.id == id);
    if (!story) return;
    
    // Add History State so "Back Button" closes modal, not app
    history.pushState({ modalOpen: true }, '', '#story');

    modalBody.innerHTML = `
        <span style="font-family:monospace; color: #a1a1aa;">${story.category}</span>
        
        <!-- MODAL IMAGE -->
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

// Handle Hardware Back Button
window.addEventListener('popstate', (event) => {
    // If we pressed back, and the modal is open, just close it visually
    if (!modal.classList.contains('hidden')) {
        closeModal();
    }
});

// Handle 'X' Button Click
document.getElementById('close-modal').addEventListener('click', () => {
    // If we click X, we must manually remove the history state
    if (history.state && history.state.modalOpen) {
        history.back(); // This triggers 'popstate' which calls closeModal()
    } else {
        closeModal(); // Fallback
    }
});

// ==========================================
// 8. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        renderFeed();
        setupInteractions();
    }, 1000);
});            </div>
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
        <p class="card-body" style="margin-bottom: 2rem;">Next drop in 12 hours.</p>
        <input type="email" placeholder="Email Address" class="subscribe-input">
        <button class="subscribe-btn action-subscribe">Subscribe</button>
    `;
    container.appendChild(endCard);

    observeCards();
}

function setupInteractions() {
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
                Utils.showToast("Subscribed successfully!");
                input.value = '';
            } else { Utils.showToast("Please enter a valid email."); }
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
            if (navigator.share) {
                navigator.share({ title: 'HF App', url: window.location.href });
            } else {
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    Utils.showToast("Link copied to clipboard!");
                } catch (err) { Utils.showToast("Could not copy link."); }
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
        const height = container.scrollHeight - container.clientHeight;
        const scrolled = (container.scrollTop / height) * 100;
        document.getElementById('progress-fill').style.width = `${scrolled}%`;
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
            if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
                card.classList.add('is-read');
            } else if (entry.isIntersecting) {
                card.classList.remove('is-read');
            }
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('.card').forEach(card => observer.observe(card));
}

// --- MODAL & BACK BUTTON LOGIC ---
const modal = document.getElementById('story-modal');
const modalBody = document.getElementById('modal-body-content');
const modalLink = document.getElementById('modal-source-link');

function openModal(id) {
    const story = rawStories.find(s => s.id == id);
    if (!story) return;
    
    // Add History State so "Back Button" closes modal, not app
    history.pushState({ modalOpen: true }, '', '#story');

    modalBody.innerHTML = `
        <span style="font-family:monospace; color: #a1a1aa;">${story.category}</span>
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

// Handle Hardware Back Button
window.addEventListener('popstate', (event) => {
    // If we pressed back, and the modal is open, just close it visually
    // We don't need to call history.back() because the browser already did it
    if (!modal.classList.contains('hidden')) {
        closeModal();
    }
});

// Handle 'X' Button Click
document.getElementById('close-modal').addEventListener('click', () => {
    // If we click X, we must manually remove the history state
    if (history.state && history.state.modalOpen) {
        history.back(); // This triggers 'popstate' which calls closeModal()
    } else {
        closeModal(); // Fallback
    }
});

// ==========================================
// 8. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        renderFeed();
        setupInteractions();
    }, 1000);
});
