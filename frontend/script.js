const API = 'http://127.0.0.1:5000/api';
const $ = (id) => document.getElementById(id);

let starChart = null;
let flagChart = null;
let latestRequest = 0; // ignore stale responses when filters change quickly

/* ---------- Helpers ---------- */
const fmt = (n) => Number(n).toLocaleString('en-US');

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
    const duration = 900;
    el.dataset.value = target;
    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = from + (target - from) * eased;
        el.textContent = decimals ? value.toFixed(decimals) : fmt(Math.round(value));
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

/* ---------- Initialisation ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    ['bookSelect', 'flagSelect', 'sortSelect'].forEach((id) => $(id).addEventListener('change', onFilterChanged));
    $('resetBtn').addEventListener('click', resetFilters);

    // Toggle "Read more / Show less" inside the table
    $('reviewsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.more');
        if (!btn) return;
        const body = btn.previousElementSibling;
        const collapsed = body.classList.toggle('clamp');
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
    const optTitle = $('optSortTitle');

    if (book === 'ALL') {
        $('tableTitle').textContent = 'Review details (all books)';
        optTitle.hidden = false;
    } else {
        $('tableTitle').textContent = `Review details: ${book}`;
        optTitle.hidden = true;
        if ($('sortSelect').value === 'title_ASC') $('sortSelect').value = 'helpful_DESC';
    }
    refresh();
}

function refresh() {
    const id = ++latestRequest;
    insightBooks = [];
    // Load the main table and statistics first, then the per-book table (one request per book)
    Promise.allSettled([fetchTable(id), fetchAnalytics(id)]).then(() => loadBookCharts(id));
}

/* ---------- Review table ---------- */
function showSkeleton() {
    const row = `<tr class="skeleton"><td><i></i></td><td><i></i></td><td><i></i></td><td><i></i></td><td><i></i></td></tr>`;
    $('reviewsTableBody').innerHTML = row.repeat(6);
}

function showMessage(text, isError = false) {
    $('reviewsTableBody').innerHTML = `<tr><td colspan="5" class="state ${isError ? 'error' : ''}">${text}</td></tr>`;
    $('rowCount').textContent = '';
}

async function fetchTable(id) {
    showSkeleton();
    const [sort, order] = $('sortSelect').value.split('_');
    const params = new URLSearchParams({
        title: $('bookSelect').value,
        sort,
        order,
        flag: $('flagSelect').value,
    });

    try {
        const res = await fetch(`${API}/book-details?${params}`);
        const reviews = await res.json();
        if (id !== latestRequest) return;

        if (!reviews.length) {
            showMessage('No reviews match these filters. Try changing or resetting them.');
            return;
        }

        $('rowCount').textContent = `Showing ${reviews.length} reviews`;
        $('reviewsTableBody').innerHTML = reviews.map((r, i) => {
            let flag = '';
            if (Number(r.high_rating_negative_flag) === 1) flag = '<br><span class="flag flag-neg">5 stars but negative</span>';
            else if (Number(r.low_rating_positive_flag) === 1) flag = '<br><span class="flag flag-pos">1 star but positive</span>';

            const body = cleanText(r.review_body);
            const long = body.length > 260;

            return `
                <tr class="row-in" style="--i:${Math.min(i, 15)}">
                    <td class="book">${cleanText(r.product_title)}</td>
                    <td>${starsHtml(r.star_rating)}${flag}</td>
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
        const total = stars.reduce((a, b) => a + b, 0);
        const avg = total ? stars.reduce((sum, c, i) => sum + c * (i + 1), 0) / total : 0;

        countUp($('statTotal'), total);
        countUp($('statAvg'), avg, 2);
        countUp($('statNeg'), flags[0]);
        countUp($('statPos'), flags[1]);

        setBaseInsights(stars, flags, total, avg);
        // Charts need the Chart.js CDN; if it is blocked, everything else must still show
        try {
            drawStarChart(stars);
            drawFlagChart(flags);
            drawSentimentChart(stars, flags);
        } catch (chartErr) {
            console.error('Charts unavailable:', chartErr);
        }
    } catch (err) {
        console.error('Could not load analytics:', err);
    }
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

function drawFlagChart(data) {
    if (flagChart) flagChart.destroy();
    flagChart = new Chart($('flagChart'), {
        type: 'doughnut',
        data: {
            labels: ['5 stars but negative', '1 star but positive'],
            datasets: [{ data, backgroundColor: ['#e5484d', '#7c5cff'], borderWidth: 3, borderColor: '#fff' }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: { legend: { position: 'bottom' } },
        },
    });
}

/* ---------- Three charts at the bottom (only uses existing backend APIs) ---------- */
const STAR_COLORS = ['#e5484d', '#f08c3c', '#f5c542', '#3b9ae1', '#22b573'];
const analyticsCache = new Map();
let bookChart = null;
let sentimentChart = null;
let boxChart = null;

const addUp = (arr) => arr.reduce((x, y) => x + y, 0);
// Plain text for canvas labels: remove stray escaped quotes (no HTML escaping needed on a canvas)
const plainText = (t) => String(t ?? '').replace(/\\+"/g, '"');
const shorten = (t, n = 30) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function getAnalytics(title) {
    if (!analyticsCache.has(title)) {
        const res = await fetch(`${API}/book-analytics?title=${encodeURIComponent(title)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        analyticsCache.set(title, await res.json());
    }
    return analyticsCache.get(title);
}

/* Chart 2 (donut): sentiment, inferred from star ratings and the two NLP mismatch flags */
function drawSentimentChart(stars, flags) {
    const [highNeg, lowPos] = flags;
    const negative = Math.max(0, stars[0] + stars[1] - lowPos) + highNeg;
    const positive = Math.max(0, stars[3] + stars[4] - highNeg) + lowPos;
    if (sentimentChart) sentimentChart.destroy();
    sentimentChart = new Chart($('sentimentChart'), {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{ data: [positive, stars[2], negative], backgroundColor: ['#22b573', '#8d99ae', '#e5484d'], borderWidth: 3, borderColor: '#fff' }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const all = addUp(c.dataset.data);
                            return ` ${c.label}: ${fmt(c.parsed)} (${all ? ((c.parsed / all) * 100).toFixed(1) : '0.0'}%)`;
                        },
                    },
                },
            },
        },
    });
    $('sentimentNote').textContent = 'Sentiment is inferred from star ratings: 4-5 stars are positive, 3 stars neutral and 1-2 stars negative. Reviews flagged by the NLP mismatch check are counted by what their text actually says.';
}

/* Chart 1 (bar): star distribution per book, as a share of each book's reviews */
function drawBookChart(rows, isAll, totalBooks) {
    const shown = isAll ? rows.slice(0, 10) : rows;
    if (bookChart) bookChart.destroy();
    bookChart = new Chart($('bookStarChart'), {
        type: 'bar',
        data: {
            labels: shown.map((r) => plainText(r.title)),
            datasets: [0, 1, 2, 3, 4].map((i) => ({
                label: `${i + 1} star${i ? 's' : ''}`,
                data: shown.map((r) => (r.total ? (r.counts[i] / r.total) * 100 : 0)),
                backgroundColor: STAR_COLORS[i],
            })),
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: {
                x: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } },
                y: { stacked: true, grid: { display: false }, ticks: { callback(v) { return shorten(this.getLabelForValue(v)); } } },
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        title: (items) => plainText(shown[items[0].dataIndex].title),
                        label: (c) => ` ${c.dataset.label}: ${fmt(shown[c.dataIndex].counts[c.datasetIndex])} reviews (${c.parsed.x.toFixed(1)}%)`,
                    },
                },
            },
        },
    });
    $('bookChartNote').textContent = isAll
        ? `Top ${shown.length} of ${totalBooks} listed books by number of reviews. Each bar shows the share of that book's reviews at each star level; hover for counts.`
        : 'Selected book. Each bar shows the share of its reviews at each star level; hover for counts.';
}

/* Chart 3 (box plot): how the mismatch rate varies from book to book */
function quantile(sorted, p) {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function boxStats(values) {
    const s = [...values].sort((x, y) => x - y);
    const q1 = quantile(s, 0.25);
    const q3 = quantile(s, 0.75);
    const lowFence = q1 - 1.5 * (q3 - q1);
    const highFence = q3 + 1.5 * (q3 - q1);
    const inside = s.filter((v) => v >= lowFence && v <= highFence);
    return {
        q1, q3, median: quantile(s, 0.5), n: s.length, max: s[s.length - 1],
        whiskerMin: inside[0], whiskerMax: inside[inside.length - 1],
        outliers: s.filter((v) => v < lowFence || v > highFence),
    };
}

// Chart.js has no built-in box plot, so draw the median, whiskers and outliers on top of floating bars
function boxPlotPlugin(stats) {
    return {
        id: 'boxParts',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { y } } = chart;
            const bars = chart.getDatasetMeta(0).data;
            ctx.save();
            ctx.lineWidth = 2;
            stats.forEach((s, i) => {
                if (!bars[i]) return;
                const { x, width } = bars[i].getProps(['x', 'width'], true);
                const half = width / 2;
                const py = (v) => y.getPixelForValue(v);
                ctx.strokeStyle = s.color;
                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.moveTo(x - half, py(s.median)); ctx.lineTo(x + half, py(s.median));
                ctx.moveTo(x, py(s.q3)); ctx.lineTo(x, py(s.whiskerMax));
                ctx.moveTo(x, py(s.q1)); ctx.lineTo(x, py(s.whiskerMin));
                ctx.moveTo(x - half / 2, py(s.whiskerMax)); ctx.lineTo(x + half / 2, py(s.whiskerMax));
                ctx.moveTo(x - half / 2, py(s.whiskerMin)); ctx.lineTo(x + half / 2, py(s.whiskerMin));
                ctx.stroke();
                s.outliers.forEach((v) => { ctx.beginPath(); ctx.arc(x, py(v), 3, 0, Math.PI * 2); ctx.fill(); });
                if (s.selected != null) { // diamond marks the currently selected book
                    const cy = py(s.selected);
                    ctx.beginPath();
                    ctx.moveTo(x, cy - 7); ctx.lineTo(x + 7, cy); ctx.lineTo(x, cy + 7); ctx.lineTo(x - 7, cy); ctx.closePath();
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    ctx.strokeStyle = '#1b2a41';
                    ctx.stroke();
                }
            });
            ctx.restore();
        },
    };
}

function drawBoxChart(rows, selectedTitle) {
    const metrics = [
        { label: '5 stars but negative', color: '#e5484d', rate: (r) => (r.flags[0] / r.total) * 100 },
        { label: '1 star but positive', color: '#7c5cff', rate: (r) => (r.flags[1] / r.total) * 100 },
        { label: 'All mismatched', color: '#0ea5a4', rate: (r) => ((r.flags[0] + r.flags[1]) / r.total) * 100 },
    ];
    const picked = rows.find((r) => r.title === selectedTitle);
    const stats = metrics.map((m) => ({ ...boxStats(rows.map(m.rate)), color: m.color, selected: picked ? m.rate(picked) : null }));
    const top = Math.max(...stats.map((s) => s.max));
    if (boxChart) boxChart.destroy();
    boxChart = new Chart($('boxChart'), {
        type: 'bar',
        data: {
            labels: metrics.map((m) => m.label),
            datasets: [{
                data: stats.map((s) => [s.q1, s.q3]),
                backgroundColor: metrics.map((m) => `${m.color}33`),
                borderColor: metrics.map((m) => m.color),
                borderWidth: 2,
                borderSkipped: false,
                maxBarThickness: 80,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: {
                y: { beginAtZero: true, max: Math.ceil(top * 1.1 * 10) / 10, title: { display: true, text: "Mismatch rate (% of a book's reviews)" }, ticks: { callback: (v) => `${v}%` } },
                x: { grid: { display: false } },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const s = stats[c.dataIndex];
                            return [`Max (whisker): ${s.whiskerMax.toFixed(2)}%`, `Q3: ${s.q3.toFixed(2)}%`, `Median: ${s.median.toFixed(2)}%`, `Q1: ${s.q1.toFixed(2)}%`, `Min (whisker): ${s.whiskerMin.toFixed(2)}%`, `Outliers: ${s.outliers.length}`, `Books: ${s.n}`];
                        },
                    },
                },
            },
        },
        plugins: [boxPlotPlugin(stats)],
    });
    $('boxNote').textContent = `Each box spans the middle 50% of the ${rows.length} listed books (line = median, whiskers = typical range, dots = outliers).${picked ? ' The diamond marks the selected book.' : ''}`;
}

/* Charts 1 and 3 need data from every book: one /book-analytics call per book, cached after the first load */
async function loadBookCharts(id) {
    const book = $('bookSelect').value;
    const titles = [...$('bookSelect').options].map((o) => o.value).filter((v) => v !== 'ALL');
    $('bookChartNote').textContent = 'Loading per-book data...';
    $('boxNote').textContent = 'Loading per-book data...';

    let next = 0;
    let done = 0;
    async function worker() {
        while (next < titles.length) {
            const t = titles[next++];
            try { await getAnalytics(t); } catch (err) { console.error(err); }
            if (id !== latestRequest) return;
            $('bookChartNote').textContent = `Loading per-book data... ${++done}/${titles.length}`;
        }
    }
    await Promise.all(Array.from({ length: 3 }, worker));
    if (id !== latestRequest) return;

    const rows = titles.filter((t) => analyticsCache.has(t)).map((t) => {
        const a = analyticsCache.get(t);
        return { title: t, counts: a.star_distribution, flags: a.sentiment_mismatch_flags, total: addUp(a.star_distribution) };
    }).filter((r) => r.total > 0).sort((x, y) => y.total - x.total);

    if (!rows.length) {
        $('bookChartNote').textContent = 'No per-book data available.';
        $('boxNote').textContent = '';
        return;
    }
    try {
        drawBookChart(book === 'ALL' ? rows : rows.filter((r) => r.title === book), book === 'ALL', rows.length);
        drawBoxChart(rows, book);
    } catch (err) {
        console.error('Charts unavailable:', err);
    }
    if (book === 'ALL' && rows.length >= 2) paintBookInsights(rows.map((r) => ({ title: r.title, a: analyticsCache.get(r.title) })));
}

/* ---------- Key insights (text generated from the live data) ---------- */
let insightBase = [];
let insightBooks = [];

function paintInsights() {
    $('insightList').innerHTML = [...insightBase, ...insightBooks].map((t) => `<li>${t}</li>`).join('');
}

function setBaseInsights(stars, flags, total, avg) {
    const share = (n) => `${total ? ((n / total) * 100).toFixed(1) : '0.0'}%`;
    const mismatch = flags[0] + flags[1];
    insightBase = [
        `<b>${fmt(total)}</b> reviews are analysed, with an average rating of <b>${avg.toFixed(2)}</b> out of 5.`,
        `<b>${share(stars[4])}</b> of reviews give 5 stars, while <b>${share(stars[0])}</b> give just 1 star.`,
        `<b>${fmt(mismatch)}</b> reviews (<b>${share(mismatch)}</b>) contradict their own star rating: ${fmt(flags[0])} give 5 stars with negative text and ${fmt(flags[1])} give 1 star with positive text.`,
    ];
    paintInsights();
}

function paintBookInsights(results) {
    const rows = results.map(({ title, a }) => {
        const c = a.star_distribution;
        const total = c.reduce((x, y) => x + y, 0);
        const avg = total ? c.reduce((sum, n, i) => sum + n * (i + 1), 0) / total : 0;
        return { title, total, avg };
    });
    const established = rows.filter((r) => r.total >= 100);
    const pool = established.length >= 2 ? established : rows;
    const note = pool === established ? ' (100+ reviews)' : '';
    const most = rows.reduce((a, b) => (b.total > a.total ? b : a));
    const best = pool.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = pool.reduce((a, b) => (b.avg < a.avg ? b : a));
    insightBooks = [
        `Among the listed books, the most reviewed is <b>${cleanText(most.title)}</b> with ${fmt(most.total)} reviews.`,
        `Highest rated${note}: <b>${cleanText(best.title)}</b> with an average of ${best.avg.toFixed(2)}.`,
        `Lowest rated${note}: <b>${cleanText(worst.title)}</b> with an average of ${worst.avg.toFixed(2)}.`,
    ];
    paintInsights();
}