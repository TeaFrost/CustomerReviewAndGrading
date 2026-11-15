const API = 'http://127.0.0.1:5000/api';
const $ = (id) => document.getElementById(id);

/* Star thresholds ("x" in the requirement). Change them here if the team agrees on other values:
   a rating is GOOD at GOOD_STAR_MIN stars or more and BAD at BAD_STAR_MAX stars or fewer.
   Ratings in between are neutral. */
const GOOD_STAR_MIN = 4;
const BAD_STAR_MAX = 2;

const CATEGORIES = {
    good_good: { label: 'Good rating, good review', color: '#22b573', cls: 'flag-gg' },
    good_bad: { label: 'Good rating, bad review', color: '#f08c3c', cls: 'flag-gb' },
    bad_good: { label: 'Bad rating, good review', color: '#7c5cff', cls: 'flag-bg' },
    bad_bad: { label: 'Bad rating, bad review', color: '#e5484d', cls: 'flag-bb' },
};

let starChart = null;
let groupChart = null;
let sentimentChart = null;
let latestRequest = 0; // ignore stale responses when filters change quickly

/* ---------- Helpers ---------- */
const fmt = (n) => Number(n).toLocaleString('en-US');
const addUp = (arr) => arr.reduce((x, y) => x + y, 0);
const share = (n, total) => `${total ? ((n / total) * 100).toFixed(1) : '0.0'}%`;

// The raw data has stray escaped quotes, so clean the text and escape HTML for safety
function cleanText(s) {
    const text = String(s ?? '').replace(/\\+"/g, '"').replace(/\\n/g, ' ');
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function starsHtml(n) {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return `<span class="stars" title="${v} stars">${'★'.repeat(v)}<span>${'★'.repeat(5 - v)}</span></span>`;
}

// Count-up animation from the current value to the new value
function countUp(el, target, decimals = 0) {
    const from = parseFloat(el.dataset.value || 0);
    const start = performance.now();
    el.dataset.value = target;
    function tick(now) {
        const t = Math.min((now - start) / 900, 1);
        const value = from + (target - from) * (1 - Math.pow(1 - t, 3));
        el.textContent = decimals ? value.toFixed(decimals) : fmt(Math.round(value));
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

/* Which of the four groups a review belongs to (null = neutral star rating).
   The two mismatch groups come from the NLP flags; the two matching groups use the star thresholds. */
function categoryOf(r) {
    if (Number(r.high_rating_negative_flag) === 1) return 'good_bad';
    if (Number(r.low_rating_positive_flag) === 1) return 'bad_good';
    const star = Number(r.star_rating);
    if (star >= GOOD_STAR_MIN) return 'good_good';
    if (star <= BAD_STAR_MAX) return 'bad_bad';
    return null;
}

// Group sizes for a whole book (or all books), from the star distribution and the two NLP flag counts
function groupCounts(stars, flags) {
    const [goodBad, badGood] = flags;
    return {
        good_good: Math.max(0, addUp(stars.slice(GOOD_STAR_MIN - 1)) - goodBad),
        good_bad: goodBad,
        bad_good: badGood,
        bad_bad: Math.max(0, addUp(stars.slice(0, BAD_STAR_MAX)) - badGood),
    };
}

/* ---------- Initialisation ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    ['bookSelect', 'flagSelect', 'sortSelect'].forEach((id) => $(id).addEventListener('change', onFilterChanged));
    $('resetBtn').addEventListener('click', resetFilters);

    // Toggle "Read more / Show less" inside the table
    $('reviewsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.more');
        if (!btn) return;
        const collapsed = btn.previousElementSibling.classList.toggle('clamp');
        btn.textContent = collapsed ? 'Read more' : 'Show less';
    });

    try {
        const res = await fetch(`${API}/books`);
        const books = await res.json();
        books.forEach((title) => {
            const opt = document.createElement('option');
            opt.value = title;
            opt.textContent = title;
            $('bookSelect').appendChild(opt);
        });
    } catch (err) {
        console.error('Could not load the book list:', err);
    }
    refresh();
});

function resetFilters() {
    $('bookSelect').value = 'ALL';
    $('flagSelect').value = 'ALL';
    $('sortSelect').value = 'helpful_DESC';
    onFilterChanged();
}

function onFilterChanged() {
    const book = $('bookSelect').value;
    if (book === 'ALL') {
        $('tableTitle').textContent = 'Review details (all books)';
        $('optSortTitle').hidden = false;
    } else {
        $('tableTitle').textContent = `Review details: ${book}`;
        $('optSortTitle').hidden = true;
        if ($('sortSelect').value === 'title_ASC') $('sortSelect').value = 'helpful_DESC';
    }
    refresh();
}

function refresh() {
    const id = ++latestRequest;
    fetchTable(id);
    fetchAnalytics(id);
}

/* ---------- Review table ---------- */
function showSkeleton() {
    const row = '<tr class="skeleton"><td><i></i></td><td><i></i></td><td><i></i></td><td><i></i></td><td><i></i></td></tr>';
    $('reviewsTableBody').innerHTML = row.repeat(6);
}

function showMessage(text, isError = false) {
    $('reviewsTableBody').innerHTML = `<tr><td colspan="5" class="state ${isError ? 'error' : ''}">${text}</td></tr>`;
    $('rowCount').textContent = '';
}

async function fetchTable(id) {
    showSkeleton();
    const [sort, order] = $('sortSelect').value.split('_');
    const group = $('flagSelect').value;
    // The backend can only filter the two mismatch groups; the other two are filtered in the browser
    const params = new URLSearchParams({
        title: $('bookSelect').value,
        sort,
        order,
        flag: { good_bad: 'high_neg', bad_good: 'low_pos' }[group] || 'ALL',
    });
    const browserFilter = group === 'good_good' || group === 'bad_bad';

    try {
        const res = await fetch(`${API}/book-details?${params}`);
        let reviews = await res.json();
        if (id !== latestRequest) return;

        const fetched = reviews.length;
        if (browserFilter) reviews = reviews.filter((r) => categoryOf(r) === group);

        if (!reviews.length) {
            showMessage(browserFilter
                ? 'None of the top 50 reviews in this sort order belong to this group. Try sorting by star rating or choosing another book.'
                : 'No reviews match these filters. Try changing or resetting them.');
            return;
        }

        $('rowCount').textContent = browserFilter
            ? `Showing ${reviews.length} of the top ${fetched} reviews (filtered in the browser)`
            : `Showing ${reviews.length} reviews`;

        $('reviewsTableBody').innerHTML = reviews.map((r, i) => {
            const cat = categoryOf(r);
            const badge = cat ? `<br><span class="flag ${CATEGORIES[cat].cls}">${CATEGORIES[cat].label}</span>` : '';
            const body = cleanText(r.review_body);
            const long = body.length > 260;
            return `
                <tr class="row-in" style="--i:${Math.min(i, 15)}">
                    <td class="book">${cleanText(r.product_title)}</td>
                    <td>${starsHtml(r.star_rating)}${badge}</td>
                    <td>
                        <div class="review ${long ? 'clamp' : ''}">${body}</div>
                        ${long ? '<button type="button" class="more">Read more</button>' : ''}
                    </td>
                    <td>👍 ${fmt(r.helpful_votes || 0)}</td>
                    <td>${cleanText(r.review_date) || 'N/A'}</td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        if (id === latestRequest) showMessage('Cannot connect to the backend. Run <b>python backend/app.py</b> and reload the page.', true);
    }
}

/* ---------- Statistics and charts ---------- */
async function fetchAnalytics(id) {
    try {
        const params = new URLSearchParams({ title: $('bookSelect').value });
        const res = await fetch(`${API}/book-analytics?${params}`);
        const data = await res.json();
        if (id !== latestRequest) return;

        const stars = data.star_distribution;
        const flags = data.sentiment_mismatch_flags;
        const total = addUp(stars);
        const avg = total ? stars.reduce((sum, c, i) => sum + c * (i + 1), 0) / total : 0;
        const groups = groupCounts(stars, flags);

        countUp($('statTotal'), total);
        countUp($('statAvg'), avg, 2);
        Object.keys(CATEGORIES).forEach((key) => {
            countUp($(`stat_${key}`), groups[key]);
            $(`sub_${key}`).textContent = `${share(groups[key], total)} of reviews`;
        });
        setInsights(total, avg, groups);

        // Charts need the Chart.js CDN; if it is blocked, everything else must still show
        try {
            drawStarChart(stars);
            drawGroupChart(groups, total);
            drawSentimentChart(groups, total);
        } catch (chartErr) {
            console.error('Charts unavailable:', chartErr);
        }
    } catch (err) {
        console.error('Could not load analytics:', err);
    }
}

function setInsights(total, avg, g) {
    const mismatch = g.good_bad + g.bad_good;
    const hasNeutral = GOOD_STAR_MIN - BAD_STAR_MAX > 1;
    const lines = [
        `<b>${fmt(total)}</b> reviews are analysed, with an average rating of <b>${avg.toFixed(2)}</b> out of 5.`,
        `Stars and text agree in <b>${share(g.good_good + g.bad_bad, total)}</b> of reviews: <b>${share(g.good_good, total)}</b> are good rating with a good review and <b>${share(g.bad_bad, total)}</b> are bad rating with a bad review.`,
        `<b>${fmt(mismatch)}</b> reviews (<b>${share(mismatch, total)}</b>) contradict their own rating: ${fmt(g.good_bad)} have a good rating but a bad review, and ${fmt(g.bad_good)} have a bad rating but a good review.`,
        `A rating counts as good at ${GOOD_STAR_MIN}+ stars and bad at ${BAD_STAR_MAX} stars or fewer${hasNeutral ? '; the stars in between are neutral' : ''}.`,
    ];
    $('insightList').innerHTML = lines.map((t) => `<li>${t}</li>`).join('');
}

function drawStarChart(data) {
    if (starChart) starChart.destroy();
    starChart = new Chart($('starChart'), {
        type: 'bar',
        data: {
            labels: ['1 star', '2 stars', '3 stars', '4 stars', '5 stars'],
            datasets: [{
                label: 'Reviews',
                data,
                backgroundColor: ['#e5484d', '#f08c3c', '#f5c542', '#3b9ae1', '#22b573'],
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        },
    });
}

function drawGroupChart(groups, total) {
    const keys = Object.keys(CATEGORIES);
    if (groupChart) groupChart.destroy();
    groupChart = new Chart($('groupChart'), {
        type: 'bar',
        data: {
            labels: keys.map((k) => CATEGORIES[k].label.split(', ')),
            datasets: [{
                label: 'Reviews',
                data: keys.map((k) => groups[k]),
                backgroundColor: keys.map((k) => CATEGORIES[k].color),
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)} reviews (${share(c.parsed.y, total)})` } },
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        },
    });
    $('groupNote').textContent = `Reviews with a neutral star rating are not part of these four groups. Good rating = ${GOOD_STAR_MIN}+ stars, bad rating = ${BAD_STAR_MAX} stars or fewer; the review is judged by the NLP mismatch flags.`;
}

// Sentiment is inferred from the four groups: a good review is positive, a bad review is negative
function drawSentimentChart(groups, total) {
    const positive = groups.good_good + groups.bad_good;
    const negative = groups.bad_bad + groups.good_bad;
    if (sentimentChart) sentimentChart.destroy();
    sentimentChart = new Chart($('sentimentChart'), {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{ data: [positive, Math.max(0, total - positive - negative), negative], backgroundColor: ['#22b573', '#8d99ae', '#e5484d'], borderWidth: 3, borderColor: '#fff' }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed)} (${share(c.parsed, total)})` } },
            },
        },
    });
}