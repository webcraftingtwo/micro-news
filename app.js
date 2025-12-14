/**
 * HIGH FREQUENCY APP v10.0 (LIVE DATA)
 * Connected to Google Sheets via CSV
 */

// 1. CONFIGURATION
// PASTE YOUR GOOGLE SHEET CSV LINK HERE (Keep the quotes!)
const SHEET_URL = "PASTE_YOUR_GOOGLE_SHEET_CSV_LINK_HERE"; 

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
    stories: [], // Data now lives here, empty at start
    toggleLike(id) {
        if (this.likes.includes(id)) this.likes = this.likes.filter(lid => lid !== id);
        else this.likes.push(id);
        Utils.setStorage('hf_likes', this.likes);
        return this.likes.includes(id);
    },
    isLiked(id) { return this.likes.includes(id); }
};

// ==========================================
// 2. DATA ENGINE (CSV PARSER)
// ==========================================
async function loadStories() {
    try {
        const response = await fetch(SHEET_URL);
        const text = await response.text();
        
        // Parse CSV
        const rows = text.split('\n').slice(1); // Remove header row
        AppState.stories = rows.map((row, index) => {
            // Handle commas inside quotes (Simple regex split)
            const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            
            // Cleanup quotes if present
            const clean = (txt) => txt ? txt.replace(/^"|"$/g, '').trim() : '';

            // Map columns to our object (Order matters based on your sheet!)
            // Expects: id, category, headline, hook, body, deep_dive, source_url, image, theme
            if (cols.length < 5) return null; // Skip empty rows

            return {
                id: index + 1, // Auto-generate ID based on row
                category: clean(cols[1]),
                headline: clean(cols[2]),
                hook: clean(cols[3]),
                body: clean(cols[4]),
                deep_dive: clean(cols[5]),
                source_url: clean(cols[6]),
                image: clean(cols[7]),
                theme: clean(cols[8]) || 'blue',
                timestamp: new Date().toISOString() // Live posts are always "Now"
            };
        }).filter(s => s !== null); // Remove empty/failed rows

        renderFeed();
        setupInteractions();

    } catch (err) {
        console.error("Failed to load sheet:", err);
        document.getElementById('feed-container').innerHTML = 
            '<div class="card"><h2 class="card-headline">Connection Error.<br>Check Sheet URL.</h2></div>';
    }
}

// ==========================================
// 3. RENDERING (Same as before)
// ==========================================
function timeAgo(dateString) { return "Today"; } // Simplified for sheet data

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
        // Show skeleton if loading or empty
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
                <img src="${story.image}" class="card-image" loading="lazy" alt="News Image">
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
