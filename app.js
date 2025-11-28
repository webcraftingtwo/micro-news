/**
 * HIGH FREQUENCY APP v8.0 (PLATINUM LAUNCH)
 * Includes: Back Button Handling, Overscroll Fixes, Safe Storage
 */

const rawStories = [
    {
        id: 1,
        category: "MARKETS",
        headline: "Crypto Flash Crash",
        hook: "Bitcoin dropped $2k in 30 seconds.",
        body: "Whales are dumping positions. Liquidation levels hit $500M. If you are holding leverage, watch your margin closely.",
        deep_dive: "The crash was triggered by a cascading liquidation event on Binance. Over $500M in long positions were wiped out in a single minute.",
        source_url: "https://bloomberg.com",
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        theme: "red"
    },
    {
        id: 2,
        category: "TECH",
        headline: "AI Agents Live",
        hook: "The new model codes without humans.",
        body: "OpenAI just dropped the update. Developers are reporting it can deploy full apps from a single prompt.",
        deep_dive: "This isn't just a chatbot. These agents have permission to access file systems.",
        source_url: "https://openai.com",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        theme: "blue"
    },
    {
        id: 3,
        category: "POLITICS",
        headline: "Green Bill Pass",
        hook: "Solar stocks are about to fly.",
        body: "The senate passed the subsidy package at 2am. Look for tickers in the renewable sector.",
        deep_dive: "The bill includes a 30% tax credit for residential solar and a $50B grant.",
        source_url: "https://reuters.com",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        theme: "green"
    }
];

const Utils = {
    getStorage(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    },
    setStorage(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    },
    showToast(message) {
        const container = document.getElementById('toast-container');
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
    toggleLike(id) {
        if (this.likes.includes(id)) this.likes = this.likes.filter(lid => lid !== id);
        else this.likes.push(id);
        Utils.setStorage('hf_likes', this.likes);
        return this.likes.includes(id);
    },
    isLiked(id) { return this.likes.includes(id); }
};

function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
}

function getThemeClass(theme) {
    const t = theme.toLowerCase();
    return (t === 'red' || t === 'blue' || t === 'green') ? `theme-${t}` : 'theme-blue';
}

const container = document.getElementById('feed-container');

function renderFeed() {
    container.innerHTML = ''; 
    const filtered = AppState.currentFilter === 'ALL' 
        ? rawStories : rawStories.filter(s => s.category === AppState.currentFilter);

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
                <span>${timeAgo(story.timestamp)}</span>
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
