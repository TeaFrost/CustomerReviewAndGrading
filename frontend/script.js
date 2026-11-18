const API = 'http://127.0.0.1:5000/api';
const $ = (id) => document.getElementById(id);

/* Star thresholds ("x" in the requirement). Change them here if the team agrees on other values:
   a rating is GOOD at GOOD_STAR_MIN stars or more and BAD at BAD_STAR_MAX stars or fewer.
   Ratings in between are neutral. */
const GOOD_STAR_MIN = 4;
const BAD_STAR_MAX = 2;

const CATEGORIES = {
    good_good: { label: 'Good rating, good review', color: '#10b981', cls: 'flag-gg' },
    good_bad: { label: 'Good rating, bad review', color: '#f59e0b', cls: 'flag-gb' },
    bad_good: { label: 'Bad rating, good review', color: '#6366f1', cls: 'flag-bg' },
    bad_bad: { label: 'Bad rating, bad review', color: '#f43f5e', cls: 'flag-bb' },
};

// Configure global Chart.js typography and styling defaults for cleaner visuals
if (window.Chart) {
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 15;
    Chart.defaults.color = '#4a5873';
    Chart.defaults.borderColor = '#e8edf4'; // Softer grid lines
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.titleFont = { size: 14, weight: '700' };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 14 };
}

// Custom Chart.js plugin to render numerical value labels directly above bars
const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const values = chart.data.datasets[0].data;
        ctx.save();
        ctx.font = "800 18px 'Segoe UI', system-ui, sans-serif";
        ctx.fillStyle = '#14213d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(fmt(values[i]), bar.x, bar.y - 6));
        ctx.restore();
    },
};

// Custom Chart.js plugin for doughnut charts to show percentages and total count in the center
const doughnutLabels = {
    id: 'doughnutLabels',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const values = chart.data.datasets[0].data;
        const total = values.reduce((a, b) => a + b, 0);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = "800 15px 'Segoe UI', system-ui, sans-serif";
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
            if (!total || values[i] / total < 0.06) return; // Skip slice if too small to fit text
            const { x, y } = arc.getCenterPoint();
            ctx.fillText(`${((values[i] / total) * 100).toFixed(1)}%`, x, y);
        });
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.fillStyle = '#14213d';
        ctx.font = "800 34px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText(fmt(total), cx, cy - 12);
        ctx.fillStyle = '#66758c';
        ctx.font = "600 15px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText('reviews', cx, cy + 18);
        ctx.restore();
    },
};

let starChart = null;
let groupChart = null;
let sentimentChart = null;
let allCategories = []; // Cached category list used by the search suggestion box
let currentCategory = 'ALL'; // Active category filter selected by the user
let latestRequest = 0; // Timestamp/ID counter to ignore stale asynchronous responses

/* ---------- Utility Helpers ---------- */
const fmt = (n) => Number(n).toLocaleString('en-US');
const addUp = (arr) => arr.reduce((x, y) => x + y, 0);
const share = (n, total) => `${total ? ((n / total) * 100).toFixed(1) : '0.0'}%`;

// Clean raw review text from escaped characters and sanitize against HTML injection
function cleanText(s) {
    const text = String(s ?? '').replace(/\\+"/g, '"').replace(/\\n/g, ' ');
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Convert category identifiers into human-friendly format (e.g., Digital_Ebook_Purchase -> Digital Ebook Purchase)
const labelOf = (cat) => String(cat).replace(/_/g, ' ');

function starsHtml(n) {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return `<span class="stars" title="${v} stars">${'★'.repeat(v)}<span>${'★'.repeat(5 - v)}</span></span>`;
}

// Smooth count-up number animation effect for KPI cards
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

// Determine which of the four sentiment/rating groups a review belongs to
function categoryOf(r) {
    if (Number(r.high_rating_negative_flag) === 1) return 'good_bad';
    if (Number(r.low_rating_positive_flag) === 1) return 'bad_good';
    const star = Number(r.star_rating);
    if (star >= GOOD_STAR_MIN) return 'good_good';
    if (star <= BAD_STAR_MAX) return 'bad_bad';
    return null;
}

// Compute group sizes based on star distribution counts and NLP mismatch flags
function groupCounts(stars, flags) {
    const [goodBad, badGood] = flags;
    return {
        good_good: Math.max(0, addUp(stars.slice(GOOD_STAR_MIN - 1)) - goodBad),
        good_bad: goodBad,
        bad_good: badGood,
        bad_bad: Math.max(0, addUp(stars.slice(0, BAD_STAR_MAX)) - badGood),
    };
}

/* ---------- Initialization & Event Listeners ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    ['productSelect', 'flagSelect', 'sortSelect'].forEach((id) => $(id).addEventListener('change', onFilterChanged));
    $('resetBtn').addEventListener('click', resetFilters);
    initSearch();

    // Toggle "Read more / Show less" expansion inside review text cells
    $('reviewsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.more');
        if (!btn) return;
        const collapsed = btn.previousElementSibling.classList.toggle('clamp');
        btn.textContent = collapsed ? 'Read more' : 'Show less';
    });

    try {
        const res = await fetch(`${API}/categories`);
        const categories = await res.json();
        allCategories = categories;
    } catch (err) {
        console.error('Could not load the category list:', err);
    }
    onFilterChanged();
});

// Update active category and trigger product list reload & data refresh
async function setCategory(cat) {
    currentCategory = cat;
    $('searchInput').value = cat === 'ALL' ? '' : labelOf(cat);
    $('searchClear').hidden = cat === 'ALL';
    await populateProductSelect();
    onFilterChanged();
}

async function populateProductSelect() {
    const sel = $('productSelect');
    if (currentCategory === 'ALL') {
        sel.innerHTML = '<option value="ALL">Search a category first</option>';
        sel.disabled = true;
        return;
    }
    sel.disabled = true;
    sel.innerHTML = '<option value="ALL">Loading products...</option>';
    try {
        const res = await fetch(`${API}/products?${new URLSearchParams({ category: currentCategory })}`);
        const products = await res.json();
        sel.innerHTML = `<option value="ALL">All products (${products.length})</option>` +
            products.map((p) => `<option value="${cleanText(p)}">${cleanText(p)}</option>`).join('');
        sel.disabled = false;
    } catch (err) {
        console.error('Could not load products:', err);
        sel.innerHTML = '<option value="ALL">Could not load products</option>';
    }
}

function resetFilters() {
    $('flagSelect').value = 'ALL';
    $('sortSelect').value = 'helpful_DESC';
    setCategory('ALL');
}

function onFilterChanged() {
    const product = $('productSelect').value;
    $('tableTitle').textContent = currentCategory === 'ALL'
        ? 'Review details (all categories)'
        : product !== 'ALL'
            ? `Review details: ${product} (${labelOf(currentCategory)})`
            : `Review details: ${labelOf(currentCategory)}`;
    refresh();
}

function refresh() {
    const id = ++latestRequest;
    fetchTable(id);
    fetchAnalytics(id);
}

/* ---------- Review Table Rendering ---------- */
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
    const params = new URLSearchParams({
        category: currentCategory,
        product: $('productSelect').value,
        sort,
        order,
        flag: group,
    });
    const showCategory = currentCategory === 'ALL';

    try {
        const res = await fetch(`${API}/product-details?${params}`);
        const reviews = await res.json();
        if (id !== latestRequest) return;

        if (!reviews.length) {
            showMessage('No reviews match these filters. Try changing or resetting them.');
            return;
        }

        $('rowCount').textContent = `Showing ${fmt(reviews.length)} reviews`;

        $('reviewsTableBody').innerHTML = reviews.map((r, i) => {
            const cat = categoryOf(r);
            const badge = cat ? `<br><span class="flag ${CATEGORIES[cat].cls}">${CATEGORIES[cat].label}</span>` : '';
            const body = cleanText(r.review_body);
            const long = body.length > 260;
            return `
                <tr class="row-in" style="--i:${Math.min(i, 15)}">
                    <td class="book">${cleanText(r.product_title)}${showCategory ? `<br><span class="cat-tag">${cleanText(labelOf(r.product_category))}</span>` : ''}</td>
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

/* ---------- Statistics and Charts Analytics ---------- */
async function fetchAnalytics(id) {
    try {
        const params = new URLSearchParams({ category: currentCategory, product: $('productSelect').value });
        const res = await fetch(`${API}/product-analytics?${params}`);
        const data = await res.json();
        if (id !== latestRequest) return;

        const stars = data.star_distribution;
        const flags = data.sentiment_mismatch_flags;
        const total = addUp(stars);
        const avg = total ? stars.reduce((sum, c, i) => sum + c * (i + 1), 0) / total : 0;
        const groups = groupCounts(stars, flags);

        setInsights(total, avg, groups);
        setKpis(total, avg, groups);

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

function setKpis(total, avg, g) {
    const mismatch = g.good_bad + g.bad_good;
    countUp($('kpiTotal'), total);
    $('kpiAvg').textContent = avg.toFixed(2);
    $('kpiAgree').textContent = share(g.good_good + g.bad_bad, total);
    $('kpiMismatch').textContent = fmt(mismatch);
    $('kpiMismatchSub').textContent = `${share(mismatch, total)} of reviews contradict their rating`;
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

const STAR_COLORS = ['#f43f5e', '#fb7185', '#94a3b8', '#34d399', '#10b981'];

function drawStarChart(data) {
    const starTotal = data.reduce((a, b) => a + b, 0);
    drawLegend('starLegend', data.map((n, i) => [`${i + 1} star${i ? 's' : ''}`, n, STAR_COLORS[i]]), starTotal);
    if (starChart) starChart.destroy();
    starChart = new Chart($('starChart'), {
        type: 'bar',
        data: {
            labels: ['1 star', '2 stars', '3 stars', '4 stars', '5 stars'],
            datasets: [{
                label: 'Reviews',
                data,
                backgroundColor: STAR_COLORS,
                borderRadius: 8,
                maxBarThickness: 70,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)} reviews` } },
            },
            scales: {
                y: { beginAtZero: true, grace: '12%', ticks: { precision: 0, font: { size: 15 } }, title: { display: true, text: 'Number of reviews', font: { size: 15, weight: '600' } } },
                x: { grid: { display: false }, ticks: { font: { size: 16, weight: '600' } } },
            },
        },
        plugins: [valueLabels],
    });
}

function drawGroupChart(groups, total) {
    const keys = Object.keys(CATEGORIES);
    if (groupChart) groupChart.destroy();
    drawLegend('groupLegend', keys.map((k) => [CATEGORIES[k].label, groups[k], CATEGORIES[k].color]), total);
    groupChart = new Chart($('groupChart'), {
        type: 'bar',
        data: {
            labels: keys.map((k) => CATEGORIES[k].label.split(', ')),
            datasets: [{
                label: 'Reviews',
                data: keys.map((k) => groups[k]),
                backgroundColor: keys.map((k) => CATEGORIES[k].color),
                borderRadius: 8,
                maxBarThickness: 70,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => CATEGORIES[keys[items[0].dataIndex]].label,
                        label: (c) => ` ${fmt(c.parsed.y)} reviews (${share(c.parsed.y, total)})`,
                    },
                },
            },
            scales: {
                y: { beginAtZero: true, grace: '12%', ticks: { precision: 0, font: { size: 15 } }, title: { display: true, text: 'Number of reviews', font: { size: 15, weight: '600' } } },
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                },
            },
        },
        plugins: [valueLabels],
    });
    $('groupNote').textContent = `Reviews with a neutral star rating are not part of these four groups. Good rating = ${GOOD_STAR_MIN}+ stars, bad rating = ${BAD_STAR_MAX} stars or fewer; the review is judged by the NLP mismatch flags.`;
}

// Render aligned legend rows under charts: color dot, item name, count value, and percentage share
function drawLegend(elId, rows, total) {
    $(elId).innerHTML = rows.map(([name, n, color]) =>
        `<div class="lg-row"><span class="lg-dot" style="background:${color}"></span>` +
        `<span class="lg-name">${name}</span><span class="lg-num">${fmt(n)}</span>` +
        `<span class="lg-pct">${share(n, total)}</span></div>`).join('');
}

function drawSentimentChart(groups, total) {
    const positive = groups.good_good + groups.bad_good;
    const negative = groups.bad_bad + groups.good_bad;
    const neutral = Math.max(0, total - positive - negative);
    if (sentimentChart) sentimentChart.destroy();
    sentimentChart = new Chart($('sentimentChart'), {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{ data: [positive, neutral, negative], backgroundColor: ['#10b981', '#94a3b8', '#f43f5e'], borderWidth: 3, borderColor: '#fff' }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '56%',
            layout: { padding: 8 },
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed)} reviews (${share(c.parsed, total)})` } },
            },
        },
        plugins: [doughnutLabels],
    });
    drawLegend('sentimentLegend', [
        ['Positive', positive, '#10b981'],
        ['Neutral', neutral, '#94a3b8'],
        ['Negative', negative, '#f43f5e'],
    ], total);
}

/* ---------- Search Bar with Live Suggestions ---------- */
const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MAX_SUGGESTIONS = 8;

// Highlight and bold matching characters in search suggestions
function highlight(title, q) {
    const i = title.toLowerCase().indexOf(q.toLowerCase());
    const safe = (t) => cleanText(t);
    if (i < 0 || !q) return safe(title);
    return `${safe(title.slice(0, i))}<mark>${safe(title.slice(i, i + q.length))}</mark>${safe(title.slice(i + q.length))}`;
}

function initSearch() {
    const input = $('searchInput');
    const list = $('suggestList');
    const box = $('searchBox');
    let items = [];
    let active = -1;

    const close = () => {
        list.hidden = true;
        box.classList.remove('open');
        box.setAttribute('aria-expanded', 'false');
        active = -1;
    };

    const setActive = (i) => {
        active = i;
        [...list.children].forEach((li, idx) => li.classList.toggle('active', idx === i));
        if (i >= 0) list.children[i].scrollIntoView({ block: 'nearest' });
    };

    const choose = (cat) => {
        close();
        input.blur();
        setCategory(cat);
    };

    const render = () => {
        const q = input.value.trim();
        $('searchClear').hidden = !input.value;
        if (!q) {
            items = allCategories.slice(0, MAX_SUGGESTIONS);
        } else {
            const lower = q.toLowerCase();
            const starts = allCategories.filter((c) => labelOf(c).toLowerCase().startsWith(lower));
            const contains = allCategories.filter((c) => !labelOf(c).toLowerCase().startsWith(lower) && labelOf(c).toLowerCase().includes(lower));
            items = [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
        }
        list.innerHTML = items.length
            ? items.map((t, i) => `<li role="option" data-i="${i}">${SEARCH_ICON}<span>${highlight(labelOf(t), q)}</span></li>`).join('')
            : '<li class="empty">No matching category</li>';
        list.hidden = false;
        box.classList.add('open');
        box.setAttribute('aria-expanded', 'true');
        active = -1;
    };

    input.addEventListener('input', () => {
        render();
        if (!input.value && currentCategory !== 'ALL') setCategory('ALL');
    });
    input.addEventListener('focus', render);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); setActive(Math.min(active + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = items[active >= 0 ? active : 0];
            if (pick && input.value.trim()) choose(pick);
        } else if (e.key === 'Escape') close();
    });

    list.addEventListener('mousedown', (e) => {
        const li = e.target.closest('li[data-i]');
        if (!li) return;
        e.preventDefault();
        choose(items[Number(li.dataset.i)]);
    });

    $('searchClear').addEventListener('click', () => {
        setCategory('ALL');
        input.focus();
    });

    document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
}