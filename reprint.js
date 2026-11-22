// Reprint receipt page: search by receipt number and date, preview, print again.
import { supabase, el, makeButton } from './common.js';
import { buildReceipt } from './receipt-view.js';
import { loadReceiptDesign, printReceipt } from './receipt.js';
import { openRefund, refundReady, canRefund } from './refund.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'reprint.css';
document.head.appendChild(link);

const LIMIT = 200;
const rm = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayMY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
}
const startISO = (dateStr) => new Date(dateStr + 'T00:00:00+08:00').toISOString();

// ---------- build the screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'reprint-screen';
screen.hidden = true;
const wrap = el('div', 'rr-wrap');

// left: filters + results
const left = el('section', 'card rr-left');

const filters = el('div', 'rr-filters');
const searchBox = el('div', 'rr-search');
const searchInput = document.createElement('input');
searchInput.type = 'text';
searchInput.placeholder = 'Search receipt number (e.g. 0037 or DR261113-0037)';
searchInput.autocomplete = 'off';
searchBox.innerHTML =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
searchBox.appendChild(searchInput);

const dateRow = el('div', 'rr-dates');
const fromLab = el('label', 'rr-date');
fromLab.appendChild(el('span', '', 'From'));
const fromInput = document.createElement('input');
fromInput.type = 'date';
fromLab.appendChild(fromInput);
const toLab = el('label', 'rr-date');
toLab.appendChild(el('span', '', 'To'));
const toInput = document.createElement('input');
toInput.type = 'date';
toLab.appendChild(toInput);

const chips = el('div', 'rr-chips');
const CHIPS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['month', 'This month'],
  ['all', 'All dates'],
];
const chipBtns = {};
CHIPS.forEach(([key, label]) => {
  const b = el('button', 'rr-chip', label);
  b.type = 'button';
  b.addEventListener('click', () => setRange(key));
  chipBtns[key] = b;
  chips.appendChild(b);
});
dateRow.append(fromLab, toLab, chips);
filters.append(searchBox, dateRow);

const summary = el('div', 'rr-summary', '');
const head = el('div', 'rr-row rr-headrow');
['Receipt no.', 'Date & time', 'Method', 'Amount (RM)'].forEach((t) => head.appendChild(el('span', '', t)));
const list = el('div', 'rr-list');
left.append(filters, summary, head, list);

// right: preview
const right = el('aside', 'card rr-right');
const prevTitle = el('div', 'rr-prev-title', 'Receipt preview');
const paper = el('div', 'rr-paper');
const printBtn = makeButton('Print this receipt', () => doPrint(), '');
printBtn.disabled = true;
const refundBtn = makeButton('Refund', () => selectedId && openRefund(selectedId, { onDone: () => load().then(() => select(selectedId)) }), 'rr-refund-btn');
refundBtn.hidden = true;
refundBtn.disabled = true;
const note = el('p', 'menu-message menu-error', '');
note.hidden = true;
right.append(prevTitle, paper, note, printBtn, refundBtn);

wrap.append(left, right);
screen.appendChild(wrap);
document.body.appendChild(screen);

// ---------- state ----------
let rows = [];
let selectedId = null;
let loadToken = 0;
let previewToken = 0;
let searchTimer = null;

function say(text) {
  note.textContent = text;
  note.hidden = !text;
}

function emptyPreview(text) {
  paper.replaceChildren(el('p', 'rr-paper-empty', text));
  printBtn.disabled = true;
  refundBtn.disabled = true;
}

// refund button: only for owner / cashier, and only after splitbill-refund.sql was run
let refundOk = false;
async function checkRefundAllowed() {
  refundOk = (await refundReady()) && (await canRefund());
  refundBtn.hidden = !refundOk;
}

function setRange(key) {
  const t = todayMY();
  let f = t;
  let to = t;
  if (key === 'yesterday') { f = addDays(t, -1); to = f; }
  if (key === 'week') f = addDays(t, -6);
  if (key === 'month') f = t.slice(0, 8) + '01';
  if (key === 'all') { f = ''; to = ''; }
  fromInput.value = f;
  toInput.value = to;
  load();
}

function markChips() {
  const t = todayMY();
  const f = fromInput.value;
  const to = toInput.value;
  const now = {
    today: f === t && to === t,
    yesterday: f === addDays(t, -1) && to === addDays(t, -1),
    week: f === addDays(t, -6) && to === t,
    month: f === t.slice(0, 8) + '01' && to === t,
    all: !f && !to,
  };
  Object.keys(chipBtns).forEach((k) => chipBtns[k].classList.toggle('on', !!now[k]));
}

// ---------- load the list ----------
async function load() {
  const token = ++loadToken;
  markChips();
  list.replaceChildren(el('p', 'rr-empty', 'Loading...'));
  summary.textContent = '';

  const cols = 'id, receipt_no, amount, method, created_at';
  const build = (select) => {
    let q = supabase.from('payments').select(select).order('created_at', { ascending: false }).limit(LIMIT);
    const text = searchInput.value.trim().replace(/[%,()]/g, '');
    if (text) q = q.ilike('receipt_no', '%' + text + '%');
    if (fromInput.value) q = q.gte('created_at', startISO(fromInput.value));
    if (toInput.value) q = q.lt('created_at', startISO(addDays(toInput.value, 1)));
    return q;
  };
  let res = await build(cols + ', tender_seq, group_receipt');
  if (res.error) res = await build(cols); // Split Bill columns not installed yet
  if (token !== loadToken) return;
  list.replaceChildren();

  if (res.error) {
    list.appendChild(el('p', 'rr-empty rr-bad', 'Could not load: ' + res.error.message));
    return;
  }
  // a cash + QR split payment has two rows in the database: show it as one receipt
  const seconds = res.data.filter((p) => p.tender_seq === 2);
  rows = res.data
    .filter((p) => p.tender_seq !== 2)
    .map((p) => {
      const twin = p.tender_seq === 1 ? seconds.find((x) => x.group_receipt === p.group_receipt) : null;
      return twin ? Object.assign({}, p, { amount: Number(p.amount) + Number(twin.amount), method: 'mixed' }) : p;
    });
  // how much of each receipt was refunded
  const refunded = new Map();
  if (refundOk && rows.length) {
    const rr = await supabase.from('refunds').select('payment_id, amount').in('payment_id', rows.map((p) => p.id));
    if (!rr.error) rr.data.forEach((r) => refunded.set(r.payment_id, (refunded.get(r.payment_id) || 0) + Number(r.amount)));
  }
  if (token !== loadToken) return;
  if (rows.length === 0) {
    list.appendChild(el('p', 'rr-empty', 'No receipts found. Try another number or date.'));
    summary.textContent = '0 receipts';
    if (selectedId) { selectedId = null; emptyPreview('Pick a receipt from the list to see it here.'); }
    return;
  }

  const sum = rows.reduce((a, p) => a + Number(p.amount), 0);
  summary.textContent =
    rows.length + (rows.length === 1 ? ' receipt' : ' receipts') + '  |  Total RM ' + rm(sum) +
    (rows.length >= LIMIT ? '  |  showing the latest ' + LIMIT + ' (narrow the search to see others)' : '');

  rows.forEach((p) => {
    const d = new Date(p.created_at);
    const date = d.toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });
    const row = el('button', 'rr-row rr-item' + (p.id === selectedId ? ' selected' : ''));
    row.type = 'button';
    row.dataset.id = p.id;
    const no = el('strong', '', p.receipt_no);
    if (refunded.get(p.id)) no.appendChild(el('small', 'rr-refunded', 'Refunded ' + rm(refunded.get(p.id))));
    const when = el('span', 'rr-when');
    when.append(el('b', '', date), el('small', '', time));
    const meth = el('span', 'rr-method ' + (p.method === 'cash' ? 'is-cash' : 'is-qr'), p.method === 'cash' ? 'Cash' : p.method === 'mixed' ? 'Cash + QR' : 'DuitNow');
    const amt = el('span', 'rr-amt', rm(Number(p.amount)));
    row.append(no, when, meth, amt);
    row.addEventListener('click', () => select(p.id));
    list.appendChild(row);
  });
}

// ---------- preview ----------
async function select(id) {
  selectedId = id;
  list.querySelectorAll('.rr-item').forEach((r) => r.classList.toggle('selected', r.dataset.id === String(id)));
  const token = ++previewToken;
  say('');
  printBtn.disabled = true;
  refundBtn.disabled = true;
  paper.replaceChildren(el('p', 'rr-paper-empty', 'Loading receipt...'));
  const d = await loadReceiptDesign(id, (m) => say(m));
  if (token !== previewToken) return;
  if (!d) {
    emptyPreview('Could not load this receipt.');
    return;
  }
  paper.replaceChildren(buildReceipt(d));
  paper.scrollTop = 0;
  printBtn.disabled = false;
  refundBtn.disabled = false;
}

async function doPrint() {
  if (!selectedId) return;
  printBtn.disabled = true;
  await printReceipt(selectedId, (m) => say(m));
  printBtn.disabled = false;
}

// ---------- events ----------
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
});
fromInput.addEventListener('change', load);
toInput.addEventListener('change', load);

document.addEventListener('kamala:open-reprint', () => {
  screen.hidden = false;
  say('');
  selectedId = null;
  emptyPreview('Pick a receipt from the list to see it here.');
  searchInput.value = '';
  checkRefundAllowed().then(() => setRange('today'));
  searchInput.focus();
});
