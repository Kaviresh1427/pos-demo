document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'reports-page.css' }));
import './shell.js';
import './cancelled-report.js';
import './pin-login.js';
import './numpad.js';
import './keyboard.js';
import './shift.js';
import './dashboard.js';
import './settings.js';
import './reprint.js';
import './modifiers-admin.js';
// the new look is loaded last so it wins over the older style files
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'tave.css' }));
import { supabase, el, makeButton, money } from './common.js';
import { downloadCsv, myDate, myTime } from './export-csv.js';

const DAY = 24 * 60 * 60 * 1000;
const MY_OFFSET = 8 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PEAK_LABEL = { day: 'Peak hour', week: 'Best day', month: 'Best day', year: 'Best month' };

let period = 'day';
let anchor = todayMY();
let reqId = 0;

// ---------- icons ----------
function icon(inner) {
  return (
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner +
    '</svg>'
  );
}
const ICON_SALES = '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>';
const ICON_RECEIPTS = '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>';
const ICON_AVG = '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>';
const ICON_PEAK = '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>';

// ---------- build the Reports screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'reports-screen';
screen.hidden = true;

const wrap = el('div', 'rp-wrap');

// top bar: period tabs + date arrows
const toolbar = el('div', 'rp-toolbar');
const tabs = el('div', 'rp-tabs');
const periodBtns = {};
[
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
].forEach(([key, text]) => {
  const b = makeButton(
    text,
    () => {
      period = key;
      anchor = todayMY();
      load();
    },
    'secondary'
  );
  periodBtns[key] = b;
  tabs.appendChild(b);
});

const nav = el('div', 'rp-nav');
const prevBtn = makeButton('\u2039', () => shift(-1), 'secondary');
prevBtn.title = 'Previous';
const label = el('span', 'rp-date', '');
const nextBtn = makeButton('\u203A', () => shift(1), 'secondary');
nextBtn.title = 'Next';
nav.append(prevBtn, label, nextBtn);
let lastRows = [];
let lastRange = null;
const exportBtn = makeButton('Download Excel (CSV)', () => {
  if (!lastRange) return;
  const rows = lastRows.map((p) => [myDate(p.created_at), myTime(p.created_at), (p.refund ? 'Refund - ' : '') + (p.method === 'cash' ? 'Cash' : 'DuitNow (QR)'), Number(p.amount).toFixed(2)]);
  const name = 'sales-' + fmt(lastRange.s) + '-to-' + fmt(new Date(lastRange.e.getTime() - DAY)) + '.csv';
  downloadCsv(name, ['Date', 'Time', 'Method', 'Amount (RM)'], rows);
}, 'secondary');
toolbar.append(tabs, nav, exportBtn);

const message = el('p', 'menu-message', '');
message.hidden = true;

// four tiles
function makeTile(iconInner, labelText, isMain) {
  const root = el('div', 'rp-tile' + (isMain ? ' rp-tile-main' : ''));
  const ic = el('span', 'rp-ic');
  ic.innerHTML = icon(iconInner);
  const body = el('div', 'rp-tile-body');
  const lab = el('span', 'rp-tile-label', labelText);
  const val = el('strong', 'rp-tile-value', '');
  const sub = el('span', 'rp-tile-sub', '');
  body.append(lab, val, sub);
  root.append(ic, body);
  return { root, lab, val, sub };
}

const stats = el('div', 'rp-stats');
const tSales = makeTile(ICON_SALES, 'Total sales', true);
const tReceipts = makeTile(ICON_RECEIPTS, 'Receipts', false);
const tAvg = makeTile(ICON_AVG, 'Average receipt', false);
const tPeak = makeTile(ICON_PEAK, 'Peak hour', false);
stats.append(tSales.root, tReceipts.root, tAvg.root, tPeak.root);

// chart and donut
const grid = el('div', 'rp-grid');

const trendPanel = el('section', 'rp-panel');
trendPanel.appendChild(el('h3', '', 'Sales trend'));
const trendBody = el('div', 'rp-chart');
trendPanel.appendChild(trendBody);

const payPanel = el('section', 'rp-panel');
payPanel.appendChild(el('h3', '', 'Payment methods'));
const payBody = el('div', 'rp-donut');
payPanel.appendChild(payBody);

grid.append(trendPanel, payPanel);
wrap.append(toolbar, message, stats, grid);
screen.appendChild(wrap);
document.body.appendChild(screen);

// ---------- date helpers (Malaysia dates, worked out in UTC) ----------
function todayMY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function toUTC(s) {
  const p = s.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function getRange(anchorStr) {
  const a = toUTC(anchorStr);
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth();
  let s;
  let e;
  if (period === 'day') {
    s = a;
    e = new Date(a.getTime() + DAY);
  } else if (period === 'week') {
    const dow = (a.getUTCDay() + 6) % 7; // Monday = 0
    s = new Date(a.getTime() - dow * DAY);
    e = new Date(s.getTime() + 7 * DAY);
  } else if (period === 'month') {
    s = new Date(Date.UTC(y, m, 1));
    e = new Date(Date.UTC(y, m + 1, 1));
  } else {
    s = new Date(Date.UTC(y, 0, 1));
    e = new Date(Date.UTC(y + 1, 0, 1));
  }
  return { s, e };
}

function niceDate(d, opts) {
  return d.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts));
}

function getLabel(r) {
  if (period === 'day') {
    return niceDate(r.s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (period === 'week') {
    const last = new Date(r.e.getTime() - DAY);
    const f = { day: 'numeric', month: 'short' };
    return niceDate(r.s, f) + ' - ' + niceDate(last, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (period === 'month') return niceDate(r.s, { month: 'long', year: 'numeric' });
  return niceDate(r.s, { year: 'numeric' });
}

function shiftAnchor(anchorStr, dir) {
  const a = toUTC(anchorStr);
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth();
  let n;
  if (period === 'day') n = new Date(a.getTime() + dir * DAY);
  else if (period === 'week') n = new Date(a.getTime() + dir * 7 * DAY);
  else if (period === 'month') n = new Date(Date.UTC(y, m + dir, 1));
  else n = new Date(Date.UTC(y + dir, 0, 1));
  return fmt(n);
}

function shift(dir) {
  anchor = shiftAnchor(anchor, dir);
  load();
}

// ---------- get the payments of a date range ----------
async function fetchPayments(r) {
  const startISO = new Date(fmt(r.s) + 'T00:00:00+08:00').toISOString();
  const endISO = new Date(fmt(r.e) + 'T00:00:00+08:00').toISOString();

  // the database gives 1000 rows at a time, so we fetch page by page
  let rows = [];
  let from = 0;
  while (true) {
    let res = await supabase
      .from('payments')
      .select('amount, method, created_at, tender_seq')
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .order('id')
      .range(from, from + 999);
    if (res.error) {
      res = await supabase.from('payments').select('amount, method, created_at').gte('created_at', startISO).lt('created_at', endISO).order('id').range(from, from + 999);
    }

    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }

  // refunds count as negative sales (the table exists only after splitbill-refund.sql was run)
  from = 0;
  while (true) {
    const rr = await supabase.from('refunds').select('amount, method, created_at').gte('created_at', startISO).lt('created_at', endISO).order('id').range(from, from + 999);
    if (rr.error) break;
    rows = rows.concat(rr.data.map((x) => ({ amount: -Number(x.amount), method: x.method, created_at: x.created_at, refund: true })));
    if (rr.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

// ---------- group the payments for the chart ----------
function hourLabel(h) {
  return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
}

function bucketize(rows, r) {
  const labels = [];
  const names = [];
  let values = [];

  // every payment: amount in sen + its Malaysia date and time
  const list = rows.map((p) => ({
    sen: Math.round(Number(p.amount) * 100),
    d: new Date(new Date(p.created_at).getTime() + MY_OFFSET),
  }));

  if (period === 'day') {
    let minH = 8;
    let maxH = 22;
    list.forEach((s) => {
      const h = s.d.getUTCHours();
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    });
    for (let h = minH; h <= maxH; h++) {
      labels.push(hourLabel(h));
      names.push(hourLabel(h));
    }
    values = new Array(labels.length).fill(0);
    list.forEach((s) => {
      values[s.d.getUTCHours() - minH] += s.sen;
    });
  } else if (period === 'week') {
    for (let i = 0; i < 7; i++) {
      const dt = new Date(r.s.getTime() + i * DAY);
      labels.push(WEEKDAYS[i]);
      names.push(WEEKDAYS[i] + ' ' + dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()]);
    }
    values = new Array(7).fill(0);
    list.forEach((s) => {
      const dayStart = Date.UTC(s.d.getUTCFullYear(), s.d.getUTCMonth(), s.d.getUTCDate());
      const i = Math.round((dayStart - r.s.getTime()) / DAY);
      if (i >= 0 && i < 7) values[i] += s.sen;
    });
  } else if (period === 'month') {
    const count = Math.round((r.e.getTime() - r.s.getTime()) / DAY);
    for (let i = 0; i < count; i++) {
      labels.push(String(i + 1));
      names.push(i + 1 + ' ' + MONTHS[r.s.getUTCMonth()]);
    }
    values = new Array(count).fill(0);
    list.forEach((s) => {
      const i = s.d.getUTCDate() - 1;
      if (i >= 0 && i < count) values[i] += s.sen;
    });
  } else {
    for (let i = 0; i < 12; i++) {
      labels.push(MONTHS[i]);
      names.push(MONTHS[i] + ' ' + r.s.getUTCFullYear());
    }
    values = new Array(12).fill(0);
    list.forEach((s) => {
      values[s.d.getUTCMonth()] += s.sen;
    });
  }

  return { labels, names, values };
}

// ---------- draw the sales trend ----------
function niceStep(raw) {
  if (!(raw > 0)) return 25;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const options = [1, 2, 2.5, 5, 10];
  for (let i = 0; i < options.length; i++) {
    if (options[i] * mag >= raw) return options[i] * mag;
  }
  return 10 * mag;
}

function showLabel(i, n) {
  if (period === 'day') return i % 2 === 0;
  if (period === 'month') return i === 0 || (i + 1) % 5 === 0;
  return true;
}

function renderTrend(b) {
  const W = 640;
  const H = 270;
  const L = 58;
  const R = 18;
  const T = 34;
  const B = 36;
  const pw = W - L - R;
  const ph = H - T - B;
  const n = b.values.length;

  let maxSen = 0;
  let maxIdx = 0;
  b.values.forEach((v, i) => {
    if (v > maxSen) {
      maxSen = v;
      maxIdx = i;
    }
  });

  const step = niceStep(maxSen / 100 / 4);
  const yMax = step * 4;
  const x = (i) => L + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
  const y = (sen) => T + ph - (sen / 100 / yMax) * ph;

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sales trend">';
  svg +=
    '<defs><linearGradient id="rpGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" style="stop-color:var(--accent);stop-opacity:0.45"/>' +
    '<stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/>' +
    '</linearGradient></defs>';

  // grid lines and money labels on the left
  for (let t = 0; t <= 4; t++) {
    const yy = T + ph - (ph * t) / 4;
    const value = Number((step * t).toFixed(1)).toLocaleString('en-MY');
    svg += '<line class="rp-grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>';
    svg += '<text class="rp-axis" x="' + (L - 10) + '" y="' + (yy + 4) + '" text-anchor="end">' + value + '</text>';
  }

  // the line and the soft area under it
  // smooth curve (monotone cubic) - looks only, same numbers
  const px = b.values.map((v, i) => x(i));
  const py = b.values.map((v) => y(v));
  let path = 'M' + px[0].toFixed(1) + ',' + py[0].toFixed(1) + ' ';
  if (n > 1) {
    const dx = [], sl = [], tg = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = px[i + 1] - px[i];
      sl[i] = dx[i] === 0 ? 0 : (py[i + 1] - py[i]) / dx[i];
    }
    tg[0] = sl[0];
    tg[n - 1] = sl[n - 2];
    for (let i = 1; i < n - 1; i++) tg[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (sl[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
      const a = tg[i] / sl[i], c = tg[i + 1] / sl[i], h = Math.hypot(a, c);
      if (h > 3) { tg[i] = (3 * a * sl[i]) / h; tg[i + 1] = (3 * c * sl[i]) / h; }
    }
    for (let i = 0; i < n - 1; i++) {
      const d3 = dx[i] / 3;
      path += 'C' + (px[i] + d3).toFixed(1) + ',' + (py[i] + tg[i] * d3).toFixed(1) + ' ' +
        (px[i + 1] - d3).toFixed(1) + ',' + (py[i + 1] - tg[i + 1] * d3).toFixed(1) + ' ' +
        px[i + 1].toFixed(1) + ',' + py[i + 1].toFixed(1) + ' ';
    }
  }
  const area =
    path + 'L' + x(n - 1).toFixed(1) + ',' + (T + ph) + ' L' + x(0).toFixed(1) + ',' + (T + ph) + ' Z';
  svg += '<path class="rp-area" d="' + area + '"/>';
  svg += '<path class="rp-line" d="' + path + '"/>';

  // dots (hover shows the amount)
  const dotSize = n > 16 ? 2.5 : 4;
  b.values.forEach((v, i) => {
    const isPeak = maxSen > 0 && i === maxIdx;
    svg +=
      '<circle class="rp-dot' + (isPeak ? ' rp-dot-peak' : '') + '" cx="' + x(i).toFixed(1) +
      '" cy="' + y(v).toFixed(1) + '" r="' + (isPeak ? dotSize + 1.5 : dotSize) + '">' +
      '<title>' + b.names[i] + ': ' + money(v / 100) + '</title></circle>';
  });

  // time labels at the bottom
  b.labels.forEach((text, i) => {
    if (!showLabel(i, n)) return;
    svg += '<text class="rp-axis" x="' + x(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + text + '</text>';
  });

  // amber badge on the best point
  if (maxSen > 0) {
    const bw = 86;
    const bh = 24;
    const px = x(maxIdx);
    const py = y(maxSen);
    const bx = Math.min(Math.max(px - bw / 2, L), W - R - bw);
    const by = py - 36 < 2 ? py + 12 : py - 36;
    svg += '<rect class="rp-badge" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw + '" height="' + bh + '" rx="8"/>';
    svg +=
      '<text class="rp-badge-text" x="' + (bx + bw / 2).toFixed(1) + '" y="' + (by + 16).toFixed(1) +
      '" text-anchor="middle">' + money(maxSen / 100) + '</text>';
  }

  svg += '</svg>';
  trendBody.innerHTML = svg;
}

// ---------- draw the payment methods donut ----------
function renderPay(cashSen, qrSen) {
  const total = cashSen + qrSen;
  const C = 2 * Math.PI * 70;

  let svg = '<svg viewBox="0 0 200 200" role="img" aria-label="Payment methods">';
  svg += '<circle class="rp-ring-bg" cx="100" cy="100" r="70"/>';
  if (total > 0) {
    const cashLen = (C * cashSen) / total;
    const qrLen = (C * qrSen) / total;
    if (cashSen > 0) {
      svg +=
        '<circle class="rp-seg rp-seg-cash" cx="100" cy="100" r="70" stroke-dasharray="' + cashLen + ' ' + C +
        '" transform="rotate(-90 100 100)"/>';
    }
    if (qrSen > 0) {
      svg +=
        '<circle class="rp-seg rp-seg-qr" cx="100" cy="100" r="70" stroke-dasharray="' + qrLen + ' ' + C +
        '" stroke-dashoffset="' + -cashLen + '" transform="rotate(-90 100 100)"/>';
    }
  }
  svg += '<text class="rp-donut-big" x="100" y="98" text-anchor="middle">' + money(total / 100) + '</text>';
  svg += '<text class="rp-donut-small" x="100" y="118" text-anchor="middle">Total sales</text>';
  svg += '</svg>';

  const chart = el('div', '');
  chart.innerHTML = svg;

  const legend = el('div', 'rp-legend');
  [
    ['rp-key-cash', 'Cash', cashSen],
    ['rp-key-qr', 'DuitNow (QR)', qrSen],
  ].forEach(([keyClass, name, sen]) => {
    const row = el('div', 'rp-legend-row');
    const pct = total > 0 ? Math.round((sen / total) * 100) : 0;
    row.append(
      el('span', 'rp-key ' + keyClass),
      el('span', '', name),
      el('strong', 'rp-legend-pct', pct + '%'),
      el('span', 'rp-legend-amt', money(sen / 100))
    );
    legend.appendChild(row);
  });

  payBody.replaceChildren(chart.firstChild, legend);
}

// ---------- fill the whole page ----------
function render(rows, prevRows, r) {
  let totalSen = 0;
  let cashSen = 0;
  let qrSen = 0;
  let cashCount = 0;
  let qrCount = 0;
  let receipts = 0;
  rows.forEach((p) => {
    const sen = Math.round(Number(p.amount) * 100);
    totalSen += sen;
    const real = !p.refund && p.tender_seq !== 2; // a refund is not a receipt; a cash + QR split is one receipt
    if (real) receipts += 1;
    if (p.method === 'cash') {
      cashSen += sen;
      if (real) cashCount += 1;
    } else {
      qrSen += sen;
      if (real) qrCount += 1;
    }
  });

  let prevSen = 0;
  prevRows.forEach((p) => {
    prevSen += Math.round(Number(p.amount) * 100);
  });

  // tile 1: total sales and the change since the last period
  tSales.val.textContent = money(totalSen / 100);
  if (prevSen > 0) {
    const pct = ((totalSen - prevSen) / prevSen) * 100;
    tSales.sub.className = 'rp-tile-sub ' + (pct >= 0 ? 'rp-up' : 'rp-down');
    tSales.sub.textContent =
      (pct >= 0 ? '\u2191 +' + pct.toFixed(1) : '\u2193 -' + Math.abs(pct).toFixed(1)) + '% vs previous ' + period;
  } else {
    tSales.sub.className = 'rp-tile-sub';
    tSales.sub.textContent = 'No sales in the previous ' + period;
  }

  // tile 2: receipts
  tReceipts.val.textContent = String(receipts);
  tReceipts.sub.textContent = cashCount + ' cash  |  ' + qrCount + ' DuitNow';

  // tile 3: average receipt
  const avgSen = receipts > 0 ? Math.round(totalSen / receipts) : 0;
  tAvg.val.textContent = money(avgSen / 100);
  tAvg.sub.textContent = receipts > 0 ? 'per receipt' : 'No receipts yet';

  // chart and tile 4: peak
  const b = bucketize(rows, r);
  let maxSen = 0;
  let maxIdx = 0;
  b.values.forEach((v, i) => {
    if (v > maxSen) {
      maxSen = v;
      maxIdx = i;
    }
  });
  tPeak.lab.textContent = PEAK_LABEL[period];
  if (maxSen > 0) {
    tPeak.val.textContent = b.names[maxIdx];
    tPeak.sub.textContent = money(maxSen / 100);
  } else {
    tPeak.val.textContent = '-';
    tPeak.sub.textContent = 'No sales yet';
  }

  renderTrend(b);
  renderPay(cashSen, qrSen);
}

async function load() {
  const myReq = ++reqId;
  const r = getRange(anchor);
  const pr = getRange(shiftAnchor(anchor, -1));

  Object.keys(periodBtns).forEach((k) => {
    periodBtns[k].className = k === period ? '' : 'secondary';
  });
  label.textContent = getLabel(r);
  nextBtn.disabled = r.e.getTime() > toUTC(todayMY()).getTime(); // cannot go into the future
  message.hidden = true;
  wrap.classList.add('rp-loading');

  try {
    const both = await Promise.all([fetchPayments(r), fetchPayments(pr)]);
    if (myReq !== reqId) return; // user clicked something else meanwhile
    lastRows = both[0];
    lastRange = r;
    render(both[0], both[1], r);
  } catch (err) {
    if (myReq !== reqId) return;
    message.textContent = 'Could not load: ' + err.message;
    message.className = 'menu-message menu-error';
    message.hidden = false;
  }
  if (myReq === reqId) wrap.classList.remove('rp-loading');
}

// ---------- screen helpers ----------
function showScreen(target) {
  document.querySelectorAll('main.screen').forEach((s) => {
    s.hidden = s !== target;
  });
}

function openReports() {
  period = 'day';
  anchor = todayMY();
  showScreen(screen);
  load();
}

// ---------- Reports button on the home screen (owner only) ----------
const stack = document.querySelector('#home-screen .stack');
const reportsBtn = makeButton('Sales reports', openReports, '');
reportsBtn.hidden = true;
if (stack) {
  const logout = document.getElementById('logout-btn');
  stack.insertBefore(reportsBtn, logout);
}

async function refreshButton() {
  const s = await supabase.auth.getSession();
  const user = s.data && s.data.session ? s.data.session.user : null;
  if (!user) {
    reportsBtn.hidden = true;
    return;
  }
  const p = await supabase.from('profiles').select('role').eq('id', user.id).single();
  reportsBtn.hidden = !(p.data && p.data.role === 'owner');
}

supabase.auth.onAuthStateChange(() => {
  setTimeout(refreshButton, 0);
});
refreshButton();