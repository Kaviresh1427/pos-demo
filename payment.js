document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'payment-page.css' }));
import { supabase, el, makeButton, money } from './common.js';
import { printReceipt, printBill } from './receipt.js';
import { drawerAfterCashPayment } from './drawer.js';
import { openSplitBill, splitReady } from './split-bill.js';
import { modsReady, modsText } from './mod-core.js';
import { buildReceipt, nowText, getStaffName, orderText, SHOP } from './receipt-view.js';


// ---------- New layout: Order Summary (left) + Payment Method (right) ----------
// The page is built here, so index.html does not need to change.
// All the old element ids are kept, so the payment logic below works as before.
(function buildLayout() {
  const main = document.getElementById('pay-main');
  if (!main) return;
  const ICO = {
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 12h.01M18 12h.01"/></svg>',
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9l4 6M17 9l-4 6"/></svg>',
  };
  main.innerHTML =
    // ---- column 1: orders to pay ----
    '<section class="pp-card pp-orders">' +
    '  <div class="pp-head"><h3>Orders to pay</h3><span id="pay-count" class="pp-pill">0 selected</span></div>' +
    '  <div class="pp-search">' + ICO.search + '<input id="pay-search" type="text" autocomplete="off" placeholder="Search table, TA, grab..."></div>' +
    '  <div id="pp-tabs" class="pp-tabs"></div>' +
    '  <div id="pay-list" class="pp-olist"></div>' +
    '  <p class="pp-hint">Tap orders to select them. You can pay several at once.</p>' +
    '</section>' +
    // ---- column 2: the bill / printer ----
    '<section class="pp-card pp-receipt">' +
    '  <div class="pp-head"><h3>Bill</h3><span class="pp-sub">Preview of the receipt</span></div>' +
    '  <div id="pp-stage" class="pp-stage">' +
    '    <div id="pp-paper" class="pp-paper"></div>' +
    '    <div class="pp-slot" aria-hidden="true"><i></i></div>' +
    '  </div>' +
    '  <div hidden>' +
    '    <div id="pay-detail"></div>' +
    '    <div id="pay-totals">' +
    '      <div class="pay-line"><span>Subtotal</span><span id="pay-subtotal">RM 0.00</span></div>' +
    '      <div id="pay-rounding-line" class="pay-line" hidden><span>Rounding</span><span id="pay-rounding"></span></div>' +
    '    </div>' +
    '    <strong id="pay-total">RM 0.00</strong>' +
    '  </div>' +
    '</section>' +
    // ---- column 3: payment ----
    '<section class="pp-card pp-pay">' +
    '  <div id="pp-form" class="pp-form">' +
    '    <div class="pp-total">' +
    '      <div class="pp-total-main"><span>Total to pay</span><strong id="pp-big">RM 0.00</strong></div>' +
    '      <div id="pp-mini" class="pp-mini"></div>' +
    '    </div>' +
    '    <div class="pay-methods">' +
    '      <button id="pay-cash-btn" type="button">' + ICO.cash + '<span>Cash</span></button>' +
    '      <button id="pay-qr-btn" type="button" class="secondary">' + ICO.qr + '<span>DuitNow QR</span></button>' +
    '    </div>' +
    '    <div id="pay-cash-box">' +
    '      <div class="money-field"><span>Received RM</span>' +
    '        <input id="pay-cash-input" type="text" inputmode="none" autocomplete="off" value="0.00">' +
    '      </div>' +
    '      <div class="pp-keypad">' +
    '        <div id="pp-digits" class="pp-digits"></div>' +
    '        <div id="pay-quick" class="pay-quick"></div>' +
    '      </div>' +
    '      <p id="pay-change" class="pay-change"></p>' +
    '    </div>' +
    '    <div id="pay-qr-box" class="pp-qrbox" hidden>' +
    '      <img id="pp-qr-img" alt="DuitNow QR" hidden>' +
    '      <p id="pay-qr-note" class="pp-qr-note">The customer scans the DuitNow QR to pay. Press Confirm Payment after the money is received.</p>' +
    '    </div>' +
    '    <button id="pay-confirm-btn" type="button">Confirm Payment</button>' +
    '  </div>' +
    '  <div id="pp-success" class="pp-success" hidden></div>' +
    '</section>';
  main.dataset.back = ICO.back;

  const heading = document.querySelector('#payment-screen .menu-header h2');
  if (heading) heading.textContent = 'Take Payment';
})();

const ordersScreen = document.getElementById('orders-screen');
const paymentScreen = document.getElementById('payment-screen');
const ordersBtn = document.getElementById('orders-btn');
const openBtn = document.getElementById('pay-open-btn');
const backBtn = document.getElementById('pay-back-btn');
const message = document.getElementById('pay-message');
const mainBox = document.getElementById('pay-main');
const doneBox = document.getElementById('pay-done');
const doneText = document.getElementById('pay-done-text');
const doneBtn = document.getElementById('pay-done-btn');
const listBox = document.getElementById('pay-list');
const searchBox = document.getElementById('pay-search');
searchBox.addEventListener('input', () => render());

const countText = document.getElementById('pay-count');
const detailBox = document.getElementById('pay-detail');
const totalsBox = document.getElementById('pay-totals');
const subtotalText = document.getElementById('pay-subtotal');
const roundingLine = document.getElementById('pay-rounding-line');
const roundingText = document.getElementById('pay-rounding');
const totalText = document.getElementById('pay-total');
const cashBtn = document.getElementById('pay-cash-btn');
const qrBtn = document.getElementById('pay-qr-btn');
const cashBox = document.getElementById('pay-cash-box');
const qrNote = document.getElementById('pay-qr-note');
const qrBox = document.getElementById('pay-qr-box');
const qrPic = document.getElementById('pp-qr-img');
const tabsBox = document.getElementById('pp-tabs');
const bigTotal = document.getElementById('pp-big');
const miniBox = document.getElementById('pp-mini');
const digitsBox = document.getElementById('pp-digits');
let typeTab = 'all'; // all | table | takeaway
const cashInput = document.getElementById('pay-cash-input');
const quickBox = document.getElementById('pay-quick');
const changeText = document.getElementById('pay-change');
const confirmBtn = document.getElementById('pay-confirm-btn');
const stage = document.getElementById('pp-stage');
const paper = document.getElementById('pp-paper');
const formBox = document.getElementById('pp-form');
const successBox = document.getElementById('pp-success');
let finalPaper = null;
let busyPrinting = false;
let stickBottom = false; // after typing the cash, show the bottom of the receipt (Paid by / Change)

let staffName = '-';
getStaffName().then((n) => { staffName = n; });

let openOrders = [];
let selected = new Set();
let method = 'cash';
let cashCents = 0;
let roundingOn = true;

// Discount state (type: 'percent' or 'amount', or null when there is no discount)
let discType = null;
let discValue = 0;
let discReason = '';
let pendType = 'percent';

// ---------- Helpers (all money is counted in sen, to avoid decimal errors) ----------

function fromCents(c) {
  return money(c / 100);
}

// 5-sen rounding (BNM rule): last digit 1,2,6,7 go down; 3,4,8,9 go up
function roundAdjust(cents) {
  const adjust = { 1: -1, 2: -2, 3: 2, 4: 1, 6: -1, 7: -2, 8: 2, 9: 1 };
  return adjust[cents % 10] || 0;
}

// money shown as two parts: "RM" in one straight column, numbers lined up on the right
function setMoney(node, text) {
  const m = /^([+-]?)\s*RM\s*(.+)$/.exec(text);
  node.replaceChildren();
  if (!m) {
    node.classList.remove('pp-money');
    node.textContent = text;
    return;
  }
  node.classList.add('pp-money');
  node.append(el('span', 'pm-rm', 'RM'), el('span', 'pm-num', m[1] + m[2]));
}

function showMessage(text, isError) {
  if (!text) {
    message.hidden = true;
    return;
  }
  message.textContent = text;
  message.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  message.hidden = false;
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function discountCents(sub) {
  if (!discType) return 0;
  if (discType === 'percent') {
    const pct100 = Math.round(discValue * 100); // percent with 2 decimals
    return Math.floor((sub * pct100 * 2 + 10000) / 20000);
  }
  return Math.round(discValue * 100);
}

function totals() {
  let sub = 0;
  openOrders.forEach((o) => {
    if (selected.has(o.id)) sub += o.cents;
  });
  let disc = discountCents(sub);
  let bad = false;
  if (disc > 0 && disc >= sub) {
    bad = true; // discount is too high for the ticked orders
    disc = 0;
  }
  const after = sub - disc;
  const adj = roundingOn ? roundAdjust(after) : 0;
  return { sub, disc, bad, adj, total: after + adj };
}

// ---------- Discount panel (built here, so index.html is not changed) ----------

const inputStyle =
  'background:transparent;color:inherit;border:1px solid rgba(128,128,128,.6);border-radius:8px;padding:8px;font:inherit;width:100%;box-sizing:border-box;margin-top:8px;';

const discWrap = el('div', 'pay-discount-wrap');
const discToggle = makeButton('Add discount', () => {
  discBox.hidden = !discBox.hidden;
}, 'secondary small');
const discBox = el('div', 'pay-discount-box');
discBox.hidden = true;

const typeRow = el('div', 'pay-disc-row');
const typePctBtn = makeButton('% Percent', () => {
  pendType = 'percent';
  refreshPanel();
}, 'small');
const typeAmtBtn = makeButton('RM Amount', () => {
  pendType = 'amount';
  refreshPanel();
}, 'small');
typeRow.append(typePctBtn, typeAmtBtn);

const discValueInput = document.createElement('input');
discValueInput.type = 'text';
discValueInput.inputMode = 'decimal';
discValueInput.placeholder = 'Discount value';
discValueInput.style.cssText = inputStyle;

const discReasonInput = document.createElement('input');
discReasonInput.type = 'text';
discReasonInput.placeholder = 'Reason (required)';
discReasonInput.maxLength = 80;
discReasonInput.style.cssText = inputStyle;

const btnRow = el('div', 'pay-disc-row');
btnRow.style.marginTop = '10px';
const applyBtn = makeButton('Apply discount', applyDiscount, 'small');
const removeBtn = makeButton('Remove discount', removeDiscount, 'secondary small');
btnRow.append(applyBtn, removeBtn);

discBox.append(typeRow, discValueInput, discReasonInput, btnRow);
const billBtn = makeButton('Print bill', () => {
  if (selected.size === 0) {
    showMessage('Tick at least one order first.', true);
    return;
  }
  showMessage('');
  printBill(currentBill());
}, 'secondary small');
discWrap.append(el('div', 'pay-disc-row'), discBox);
discWrap.firstChild.append(discToggle, billBtn);
formBox.insertBefore(discWrap, confirmBtn);

// The "Discount" line in the totals
const discountLine = roundingLine.cloneNode(false);
discountLine.removeAttribute('id');
discountLine.hidden = true;
const discountLabel = el('span', '', 'Discount');
const discountText = el('span', '', '');
discountLine.append(discountLabel, discountText);
roundingLine.parentElement.insertBefore(discountLine, roundingLine);

function refreshPanel() {
  const npMode = pendType === 'percent' ? 'int' : 'money';
  if (discValueInput.dataset.numpad !== npMode) {
    discValueInput.dataset.numpad = npMode;
    discValueInput.value = ''; // percent and RM amounts must not mix
  }
  typePctBtn.classList.toggle('secondary', pendType !== 'percent');
  typeAmtBtn.classList.toggle('secondary', pendType !== 'amount');
  discValueInput.placeholder = pendType === 'percent' ? 'Percent, e.g. 10' : 'Amount in RM, e.g. 5.00';
}

function applyDiscount() {
  showMessage('');
  if (selected.size === 0) {
    showMessage('Tick at least one order first.', true);
    return;
  }
  const value = Number(discValueInput.value.replace(',', '.'));
  const reason = discReasonInput.value.trim();
  if (!(value > 0)) {
    showMessage('Type a discount value bigger than 0.', true);
    return;
  }
  if (pendType === 'percent' && value > 100) {
    showMessage('A percent discount cannot be over 100.', true);
    return;
  }
  if (!reason) {
    showMessage('Please type the reason for the discount.', true);
    return;
  }

  const oldType = discType;
  const oldValue = discValue;
  const oldReason = discReason;
  discType = pendType;
  discValue = Math.round(value * 100) / 100;
  discReason = reason;

  if (totals().bad) {
    discType = oldType;
    discValue = oldValue;
    discReason = oldReason;
    showMessage('The discount must be less than the subtotal.', true);
    return;
  }
  discBox.hidden = true;
  renderTotals();
}

function removeDiscount() {
  discType = null;
  discValue = 0;
  discReason = '';
  discValueInput.value = '';
  discReasonInput.value = '';
  discBox.hidden = true;
  showMessage('');
  renderTotals();
}

// ---------- Load open orders ----------

async function loadOrders(preselectId) {
  resetStage();
  showMessage('');
  selected = new Set();
  cashCents = 0;
  cashInput.value = '0.00';
  method = 'cash';
  discType = null;
  discValue = 0;
  discReason = '';
  discValueInput.value = '';
  discReasonInput.value = '';
  discBox.hidden = true;
  pendType = 'percent';
  refreshPanel();
  mainBox.hidden = false;
  doneBox.hidden = true;
  listBox.replaceChildren(el('p', 'menu-empty', 'Loading...'));

  const modCol = (await modsReady()) ? ', modifiers' : '';
  const ORD = 'id, order_type, table_no, platform_order_no, created_at, order_items(item_name, unit_price, qty, status, serve_type, note' + modCol + ')';
  // paid_subtotal exists only after splitbill-refund.sql was run
  let res = await supabase.from('orders').select(ORD.replace('created_at,', 'created_at, paid_subtotal,')).eq('status', 'open').order('created_at');
  if (res.error) res = await supabase.from('orders').select(ORD).eq('status', 'open').order('created_at');

  if (res.error) {
    showMessage('Could not load the orders: ' + res.error.message, true);
    return;
  }

  openOrders = res.data
    .map((o) => {
      let cents = 0;
      let qty = 0;
      const types = new Set();
      const grouped = new Map();
      o.order_items.forEach((i) => {
        if (i.status !== 'active') return;
        cents += Math.round(Number(i.unit_price) * 100) * i.qty;
        qty += i.qty;
        types.add(i.serve_type);
        const note = modsText(i.modifiers, i.note); // options + the free note, shown under the dish name
        const key = i.item_name + '|' + i.unit_price + '|' + note + '|' + i.serve_type;
        if (!grouped.has(key)) {
          grouped.set(key, { name: i.item_name, unit: Math.round(Number(i.unit_price) * 100), qty: 0, note, serve: i.serve_type });
        }
        grouped.get(key).qty += i.qty;
      });
      const paidSub = Math.round(Number(o.paid_subtotal || 0) * 100);
      cents -= paidSub; // a part-paid bill only asks for the rest
      return {
        id: o.id,
        paidSub,
        type: o.order_type,
        created: o.created_at,
        kind: o.order_type === 'table' ? 'table' : o.order_type === 'takeaway' ? 'takeaway' : 'table',
        label:
          o.order_type === 'table'
            ? 'Table ' + o.table_no
            : o.order_type === 'takeaway'
              ? 'Takeaway ' + o.platform_order_no
              : 'Order #' + o.platform_order_no,
        short: orderText(o.order_type, o.table_no, o.platform_order_no),
        sort: o.order_type === 'table' ? Number(o.table_no) : o.order_type === 'takeaway' ? 500 : 1000,
        cents,
        qty,
        types,
        lines: Array.from(grouped.values()),
      };
    })
    .filter((o) => o.cents > 0)
    .sort((a, b) => a.sort - b.sort);

  // Is rounding switched on? (If the setting cannot be read, it is on by default)
  const setting = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'rounding_5sen')
    .maybeSingle();
  roundingOn = setting.error || !setting.data ? true : setting.data.value === 'on';

  // coming from the order page: tick that order. Only one open order? Tick it too.
  if (preselectId && openOrders.some((o) => o.id === preselectId)) selected.add(preselectId);
  else if (openOrders.length === 1) selected.add(openOrders[0].id);

  render();
}

// ---------- Draw the screen ----------

function orderTypeText(picked) {
  const names = new Set();
  picked.forEach((o) => {
    if (o.type === 'takeaway') {
      names.add('Takeaway');
      return;
    }
    if (o.types.has('dine_in')) names.add('Dine-in');
    if (o.types.has('bungkus')) names.add('Takeaway');
  });
  return Array.from(names).join(' + ') || '-';
}

function infoRow(label, valueNode) {
  const row = el('div', 'pp-info-row');
  row.appendChild(el('span', '', label));
  row.appendChild(valueNode);
  return row;
}

// ---------- The receipt paper: same design as the printed receipt (see receipt-view.js) ----------

// d for buildReceipt(): UNPAID bill (preview and "Print bill") or PAID receipt (after payment)
function receiptData(picked, o) {
  const where = picked.map((x) => x.short).join(', ');
  const onlyTables = picked.length > 0 && picked.every((x) => x.type === 'table');
  const all = [];
  picked.forEach((x) => x.lines.forEach((l) => all.push({ name: l.name, unit: l.unit, qty: l.qty, note: l.note, takeaway: l.serve === 'bungkus' })));
  const hasTa = all.some((i) => i.takeaway);
  const hasDi = all.some((i) => !i.takeaway);
  const grouped = new Map();
  all.forEach((i) => {
    const key = i.name + '|' + i.unit + '|' + i.note + '|' + (i.takeaway ? 1 : 0);
    if (!grouped.has(key)) grouped.set(key, { name: i.name, unit: i.unit, qty: 0, note: i.note, takeaway: i.takeaway });
    grouped.get(key).qty += i.qty;
  });
  return Object.assign(
    {
      rowLabel: onlyTables ? 'Table' : 'Order',
      where: where || '-',
      items: Array.from(grouped.values()),
      tagTakeaway: hasTa && hasDi,
      discTag: discType === 'percent' ? ' (' + discValue + '%)' : '',
      methodKind: method === 'cash' ? 'cash' : 'qr',
      methodText: method === 'cash' ? 'Cash' : 'QR Pay (DuitNow)',
      emptyText: 'Select an order above',
    },
    o
  );
}

// the live preview: updates while you tick orders, add a discount or type the cash
function currentBill() {
  const picked = openOrders.filter((o) => selected.has(o.id));
  const t = totals();
  return receiptData(picked, {
    paid: false,
    receiptNo: '',
    when: nowText(),
    staff: staffName,
    subCents: t.sub,
    discCents: t.disc,
    adj: t.adj,
    totalCents: t.total,
  });
}

function renderPaper() {
  const keep = paper.scrollTop;
  paper.replaceChildren(buildReceipt(currentBill()));
  paper.scrollTop = stickBottom ? paper.scrollHeight : keep;
}

function renderDetail() {
  renderPaper();
}

function agoText(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}

const KIND_NAMES = { all: 'All', table: 'Tables', takeaway: 'Takeaway' };

function badgeText(o) {
  if (o.type === 'table') return 'T' + String(o.label.replace('Table ', '')).padStart(2, '0');
  if (o.type === 'takeaway') return o.label.replace('Takeaway ', '');
  return String(o.type).slice(0, 2).toUpperCase();
}

function render() {
  stickBottom = false;
  listBox.replaceChildren();

  // tabs with counts
  const counts = { all: openOrders.length, table: 0, takeaway: 0 };
  openOrders.forEach((o) => { counts[o.kind] += 1; });
  tabsBox.replaceChildren();
  Object.keys(KIND_NAMES).forEach((k) => {
    const b = el('button', 'pp-tab' + (typeTab === k ? ' on' : ''));
    b.type = 'button';
    b.append(el('span', '', KIND_NAMES[k]), el('em', '', String(counts[k])));
    b.addEventListener('click', () => {
      typeTab = k;
      render();
    });
    tabsBox.appendChild(b);
  });

  if (openOrders.length === 0) {
    listBox.appendChild(el('p', 'menu-empty', 'There are no open orders to pay.'));
  }

  const q = searchBox.value.trim().toLowerCase();
  const shown = openOrders.filter(
    (o) =>
      (typeTab === 'all' || o.kind === typeTab) &&
      (!q || selected.has(o.id) || (o.label + ' ' + o.short).toLowerCase().includes(q))
  );
  if (openOrders.length > 0 && shown.length === 0) {
    listBox.appendChild(el('p', 'menu-empty', q ? 'No open order matches "' + searchBox.value.trim() + '".' : 'No ' + KIND_NAMES[typeTab] + ' orders to pay.'));
  }

  shown.forEach((o) => {
    const isOn = selected.has(o.id);
    const card = el('button', 'pp-ocard k-' + o.kind + (isOn ? ' selected' : ''));
    card.type = 'button';
    const badge = el('span', 'pp-obadge', badgeText(o));
    const body = el('span', 'pp-obody');
    body.append(el('strong', '', o.label), el('small', '', o.qty + (o.qty === 1 ? ' item' : ' items') + ' · ' + agoText(o.created) + (o.paidSub > 0 ? ' · part paid' : '')));
    const amt = el('span', 'pp-oamt', '');
    setMoney(amt, fromCents(o.cents));
    const tick = el('span', 'pp-otick', '✓');
    card.append(badge, body, amt, tick);
    card.addEventListener('click', () => {
      if (selected.has(o.id)) selected.delete(o.id);
      else selected.add(o.id);
      render();
    });
    listBox.appendChild(card);
  });

  renderDetail();

  cashBtn.classList.toggle('secondary', method !== 'cash');
  qrBtn.classList.toggle('secondary', method !== 'duitnow');
  cashBox.hidden = method !== 'cash';
  qrBox.hidden = method !== 'duitnow';
  if (method === 'duitnow' && SHOP.qr) {
    qrPic.hidden = false;
    if (qrPic.getAttribute('src') !== SHOP.qr) qrPic.src = SHOP.qr;
    qrPic.onerror = () => { qrPic.hidden = true; };
  } else {
    qrPic.hidden = true;
  }

  renderTotals();
}

function renderTotals() {
  const t = totals();
  countText.textContent = selected.size + ' selected';
  refreshSplitBtn();
  setMoney(subtotalText, fromCents(t.sub));
  totalText.textContent = fromCents(t.total);
  bigTotal.textContent = fromCents(t.total);
  miniBox.replaceChildren();
  const mini = (label, text) => {
    const r = el('div', 'pp-mini-row');
    r.append(el('span', '', label), el('b', '', text));
    miniBox.appendChild(r);
  };
  mini('Subtotal', fromCents(t.sub).replace('RM ', ''));
  if (t.bad) mini('Discount', 'too high');
  else if (t.disc > 0) mini('Discount' + (discType === 'percent' ? ' ' + discValue + '%' : ''), '-' + fromCents(t.disc).replace('RM ', ''));
  if (roundingOn && t.adj !== 0) mini('Rounding', (t.adj > 0 ? '+' : '-') + fromCents(Math.abs(t.adj)).replace('RM ', ''));

  discToggle.textContent = discType ? 'Edit discount' : 'Add discount';
  if (t.bad) {
    discountLine.hidden = false;
    discountText.textContent = 'Too high - change it';
  } else if (t.disc > 0) {
    discountLine.hidden = false;
    const tag = discType === 'percent' ? ' (' + discValue + '%)' : '';
    discountLabel.textContent = 'Discount' + tag;
    setMoney(discountText, '-' + fromCents(t.disc));
  } else {
    discountLine.hidden = true;
  }

  roundingLine.hidden = !(roundingOn && t.adj !== 0);
  setMoney(roundingText, (t.adj > 0 ? '+' : '-') + fromCents(Math.abs(t.adj)));

  quickBox.replaceChildren();
  const exactOn = t.total > 0 && cashCents === t.total;
  quickBox.appendChild(makeButton('Exact', () => setCash(t.total), exactOn ? 'small' : 'secondary small'));
  [20, 50, 100].forEach((n) => {
    const on = !exactOn && cashCents === n * 100;
    quickBox.appendChild(makeButton('RM ' + n, () => setCash(n * 100), on ? 'small' : 'secondary small'));
  });

  if (method === 'cash' && t.total > 0) {
    if (cashCents >= t.total) {
      changeText.textContent = 'Change: ' + fromCents(cashCents - t.total);
      changeText.className = 'pay-change ok';
    } else {
      changeText.textContent = 'Short by: ' + fromCents(t.total - cashCents);
      changeText.className = 'pay-change short';
    }
  } else {
    changeText.textContent = '';
  }
  renderPaper();
}

function setCash(cents) {
  stickBottom = true;
  cashCents = cents;
  cashInput.value = (cents / 100).toFixed(2);
  renderTotals();
}

// ---------- Cash box (bank style: digits slide in from the right) ----------

// on-screen keypad (touch friendly): digits slide in from the right, like a bank terminal
['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back'].forEach((k) => {
  const b = el('button', 'pp-key' + (k === 'back' ? ' pp-key-back' : ''));
  b.type = 'button';
  if (k === 'back') b.innerHTML = main_back_icon();
  else b.textContent = k;
  b.addEventListener('click', () => {
    if (k === 'back') setCash(Math.floor(cashCents / 10));
    else setCash(Number(((cashCents > 0 ? String(cashCents) : '') + k).slice(0, 7)));
  });
  digitsBox.appendChild(b);
});
function main_back_icon() {
  return document.getElementById('pay-main').dataset.back || '\u232B';
}

cashInput.addEventListener('input', () => {
  const digits = cashInput.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7);
  setCash(Number(digits || 0));
});

cashBtn.addEventListener('click', () => {
  method = 'cash';
  render();
});
qrBtn.addEventListener('click', () => {
  method = 'duitnow';
  render();
});

// ---------- Confirm the payment ----------

confirmBtn.addEventListener('click', async () => {
  if (busyPrinting) return;
  showMessage('');
  const t = totals();

  if (selected.size === 0) {
    showMessage('Tick at least one order first.', true);
    return;
  }
  if (t.bad) {
    showMessage('The discount is too high for these orders. Change or remove it.', true);
    return;
  }
  if (openOrders.some((o) => selected.has(o.id) && o.paidSub > 0)) {
    showMessage('Part of this bill is already paid. Use Split bill to pay the rest.', true);
    return;
  }
  if (method === 'cash' && cashCents < t.total) {
    showMessage('The cash received is less than the total.', true);
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Saving...';

  const useDisc = discType && t.disc > 0;
  const { data, error } = await supabase.rpc('pay_orders', {
    p_order_ids: Array.from(selected),
    p_method: method,
    p_cash_received: method === 'cash' ? cashCents / 100 : null,
    p_discount_type: useDisc ? discType : null,
    p_discount_value: useDisc ? discValue : 0,
    p_discount_reason: useDisc ? discReason : null,
  });

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Confirm Payment';

  if (error) {
    showMessage('Could not save the payment: ' + error.message, true);
    return;
  }

  if (method === 'cash') drawerAfterCashPayment();
  showDone(data);
});

// ---------- Split bill ----------
const splitBtn = el('button', 'pp-split-btn', 'Split bill');
splitBtn.type = 'button';
splitBtn.hidden = true;
confirmBtn.parentNode.insertBefore(splitBtn, confirmBtn.nextSibling);

// shown only when exactly one order is ticked (and the database part is installed)
async function refreshSplitBtn() {
  const picked = openOrders.filter((o) => selected.has(o.id));
  if (picked.length !== 1) {
    splitBtn.hidden = true;
    return;
  }
  const ok = await splitReady();
  const again = openOrders.filter((o) => selected.has(o.id));
  splitBtn.hidden = !(ok && again.length === 1);
}

splitBtn.addEventListener('click', () => {
  const picked = openOrders.filter((o) => selected.has(o.id));
  if (picked.length !== 1) return;
  openSplitBill({
    orderId: picked[0].id,
    label: picked[0].label,
    roundingOn,
    onDone: () => loadOrders(),
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function paperLine(label, amountText, extra) {
  const row = el('div', 'pay-line' + (extra ? ' ' + extra : ''));
  const v = el('span', '', '');
  setMoney(v, amountText);
  row.append(el('span', '', label), v);
  return row;
}

// the paid receipt that "prints" out of the slot (same layout as the printer)
function buildFinalPaper(result) {
  const picked = openOrders.filter((o) => selected.has(o.id));
  const p = el('div', 'pp-paper pp-final');
  const totalCents = Math.round(Number(result.total) * 100);
  const when = nowText();
  p.appendChild(
    buildReceipt(
      receiptData(picked, {
        paid: true,
        receiptNo: result.receipt_no,
        when,
        paidOn: when,
        staff: staffName,
        subCents: Math.round(Number(result.subtotal) * 100),
        discCents: Math.round(Number(result.discount) * 100),
        adj: Math.round(Number(result.rounding) * 100),
        totalCents,
        cashCents: method === 'cash' ? cashCents : null,
        changeCents: method === 'cash' ? cashCents - totalCents : 0,
      })
    )
  );
  return p;
}

function resetStage() {
  if (finalPaper) { finalPaper.remove(); finalPaper = null; }
  paper.hidden = false;
  paper.classList.remove('out');
  successBox.hidden = true;
  successBox.replaceChildren();
  formBox.hidden = false;
  busyPrinting = false;
}

async function showDone(result) {
  busyPrinting = true;
  finalPaper = buildFinalPaper(result);
  stage.appendChild(finalPaper);

  // 1) the order preview slides up and out of the top
  paper.classList.add('out');
  await wait(650);
  paper.hidden = true;

  // 2) the paid receipt prints up out of the slot at the bottom
  finalPaper.classList.add('print');
  await wait(2300);
  finalPaper.classList.remove('print');
  finalPaper.classList.add('printed');

  // 3) success panel with the buttons
  formBox.hidden = true;
  successBox.replaceChildren();
  successBox.append(
    el('div', 'pp-success-icon', '\u2713'),
    el('h3', '', 'Payment Successful'),
    el('p', 'pay-receipt-no', 'Receipt ' + result.receipt_no)
  );
  const grand = el('div', 'pay-line pay-grand');
  grand.append(el('span', '', 'Total'), el('span', '', money(Number(result.total))));
  successBox.appendChild(grand);
  const sum = el('div', 'pp-success-rows');
  const m = el('div', 'pay-line');
  m.append(el('span', '', 'Paid by'), el('span', '', method === 'cash' ? 'Cash' : 'DuitNow (QR)'));
  sum.appendChild(m);
  if (method === 'cash') {
    sum.appendChild(paperLine('Cash received', fromCents(cashCents)));
    sum.appendChild(paperLine('Change', fromCents(cashCents - Math.round(Number(result.total) * 100)), 'pp-change-row'));
  }
  successBox.appendChild(sum);
  const actions = el('div', 'pp-success-actions');
  actions.append(
    makeButton('Print receipt', () => printReceipt(result.payment_id, (msg) => showMessage(msg, true))),
    makeButton('New payment', () => loadOrders(), 'secondary'),
    makeButton('Back to tables', goBackToOrders, 'secondary')
  );
  successBox.appendChild(actions);
  successBox.hidden = false;
  busyPrinting = false;
}

// ---------- Open and close ----------

function goBackToOrders() {
  paymentScreen.hidden = true;
  ordersBtn.click(); // reopens the table screen and refreshes the "Open" tables
}

openBtn.addEventListener('click', async () => {
  ordersScreen.hidden = true;
  paymentScreen.hidden = false;
  await loadOrders();
});

// "Proceed to Payment" on the order page opens this page with that order ticked
document.addEventListener('kamala:pay-order', async (e) => {
  const orderScreenEl = document.getElementById('order-screen');
  if (orderScreenEl) orderScreenEl.hidden = true;
  ordersScreen.hidden = true;
  paymentScreen.hidden = false;
  await loadOrders(e.detail ? e.detail.orderId : null);
});

backBtn.addEventListener('click', goBackToOrders);
doneBtn.addEventListener('click', goBackToOrders);
