/**
 * HIGH FREQUENCY APP v12.0 (SMART PARSER)
 * Fixes: Commas in text breaking the layout
 * Fixes: Image loading issues
 */

// 1. CONFIGURATION
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRRNPWeMACmMOYGRs40Ij2W7lSJ4EdbubacRWC1p1hChwZlm6Bzp-uUR6cZw1IAb-ie-fwk3Udx4ZkZ/pub?output=csv";

// 2. BACKUP DATA
const BACKUP_STORIES = [
    {
        id: 1,
        category: "SYSTEM",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1000",
        headline: "Connection Issue",
        hook: "Loading backup data.",
        body: "We couldn't connect to the Google Sheet. Check your internet or the CSV link.",
        deep_dive: "Check the console for errors.",
        source_url: "#",
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
// 3. SMART DATA ENGINE
// ==========================================

// Helper: correctly parses CSV lines even with commas inside quotes
function parseCSVLine(str) {
    const result = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result.map(text => text.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

async function loadStories() {
    console.log("Starting App...");
    
    try {
        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error("Sheet response failed");
        
        const text = await response.text();
        console.log("Sheet downloaded. Parsing...");
        
        const rows = text.split('\n').slice(1); // Remove header
        
        const parsedStories = rows.map((row, index) => {
            // Use the Smart Parser
            const cols = parseCSVLine(row);
            
            // Check if we have enough data (min 5 columns)
            if (cols.length < 5) return null;

            // MAPPING (Based on your wide screenshot):
            // 0: id
            // 1: category
            // 2: headline
            // 3: hook
            // 4: body
            // 5: deep_dive
            // 6: source_url
            // 7: image
            // 8: theme

            return {
                id: index + 100,
                category: cols[1],
                headline: cols[2],
                hook: cols[3],
                body: cols[4],
                deep_dive: cols[5],
                source_url: cols[6],
                image: cols[7], // Must be a URL!
                theme: cols[8] || 'blue',
                timestamp: new Date().toISOString()
            };
        }).filter(s => s !== null && s.headline); // Filter empty rows

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

        // Handle Image: Only show if it looks like a Link (http)
        let imageHTML = '';
        if (story.image && story.image.includes('http')) {
            imageHTML = `
            <div class="card-image-container">
                <img src="${story.image}" class="card-image" loading="lazy" alt="News">
            </div>`;
        } else {
            // Fallback for missing/bad images so layout stays nice
            imageHTML = `<div class="card-image-container" style="background: #222; display: flex; align-items: center; justify-content: center; color: #555;">No Image URL</div>`;
        }

        article.innerHTML = `
            <div class="card-meta">
                <span class="card-category">${story.category}</span>
                <span>LIVE</span>
            </div>
            ${imageHTML}
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
    
    let imageHTML = '';
    if (story.image && story.image.includes('http')) {
        imageHTML = `
        <div class="card-image-container" style="height: 180px; margin-bottom: 1rem;">
             <img src="${story.image}" class="card-image" style="filter: none;">
        </div>`;
    }

    modalBody.innerHTML = `
        <span style="font-family:monospace; color: #a1a1aa;">${story.category}</span>
        ${imageHTML}
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
