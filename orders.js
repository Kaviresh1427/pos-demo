import { modsReady, loadModifiers, modsPrice, modsList, modsKey } from './mod-core.js';
import { pickModifiers } from './mod-picker.js';
import './move-table.js';
import './menu-admin.js';
function noteButton(text, onClick) {
  const b = makeButton(text, onClick, 'secondary');
  b.style.cssText = 'width:auto;min-width:0;min-height:0;height:auto;flex:0 0 auto;padding:6px 12px;margin:0;font-family:Inter,sans-serif;font-size:0.78rem;font-weight:600;line-height:1.2;border-radius:10px;';
  return b;
}
import { supabase, el, makeButton, money } from './common.js';
import { askText, askConfirm } from './dialogs.js';

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'soldout.css' }));
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'note.css' }));
// the new order-page look is loaded last, so it wins over the older style files
window.addEventListener('load', () => {
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'order-new.css' }));
});

// ---------- Settings ----------

const TABLE_COUNT = 20; // change this number to match the real number of tables
// "Table 5", "Takeaway TA-03"
function labelFor(type, key) {
  if (type === 'table') return 'Table ' + key;
  if (type === 'takeaway') return 'Takeaway ' + key;
  return type + ' #' + key;
}
const CANCEL_REASONS = [
  'Customer changed mind',
  'Wrong item keyed in',
  'Item sold out',
  'Waited too long',
  'Other (type reason)',
];

// ---------- Screen parts ----------

const homeScreen = document.getElementById('home-screen');
const ordersScreen = document.getElementById('orders-screen');
const orderScreen = document.getElementById('order-screen');

const ordersBtn = document.getElementById('orders-btn');
const ordersBackBtn = document.getElementById('orders-back-btn');
const ordersMessage = document.getElementById('orders-message');
const tableGrid = document.getElementById('table-grid');

const orderBackBtn = document.getElementById('order-back-btn');
const orderTitle = document.getElementById('order-title');
const orderMessage = document.getElementById('order-message');
const serveDineBtn = document.getElementById('serve-dinein');
const serveBungkusBtn = document.getElementById('serve-bungkus');
const orderCatsBox = document.getElementById('order-cats');
const orderMenuBox = document.getElementById('order-menu');
const sentSection = document.getElementById('sent-section');
const sentList = document.getElementById('sent-list');
const sentTotal = document.getElementById('sent-total');
const cancelOrderBtn = document.getElementById('cancel-order-btn');
const basketList = document.getElementById('basket-list');
const basketTotal = document.getElementById('basket-total');
const orderSaveBtn = document.getElementById('order-save-btn');

const reasonBox = document.getElementById('reason-box');
const reasonTitle = document.getElementById('reason-title');
const reasonOptions = document.getElementById('reason-options');
const reasonClose = document.getElementById('reason-close');

// Sold-out switch button (made here, placed under the category buttons)
const soldOutBtn = el('button', 'small secondary soldout-switch', 'Sold-out switch: OFF');
soldOutBtn.type = 'button';

// ---------- New look: search box, "In stock only", and the order panel ----------
const toolsBox = el('div', 'tv-tools');
const searchInput = el('input', 'tv-search');
searchInput.type = 'search';
searchInput.placeholder = 'Search';
searchInput.autocomplete = 'off';
const stockBtn = el('button', 'small secondary tv-stock', 'In stock only');
stockBtn.type = 'button';
toolsBox.append(searchInput, stockBtn);
orderCatsBox.insertAdjacentElement('afterend', toolsBox);

const menuSection = orderCatsBox.closest('section');
const menuSectionTitle = menuSection ? menuSection.querySelector('h3') : null;
if (menuSectionTitle) menuSectionTitle.hidden = true;

const basketSection = basketList.closest('section');
const basketTitle = basketSection ? basketSection.querySelector('h3') : null;
const basketTag = el('span', 'tv-order-tag', '');
if (basketTitle) {
  basketTitle.textContent = 'Order Details ';
  basketTitle.appendChild(basketTag);
  const serveBox = serveDineBtn.parentElement;
  if (serveBox) basketTitle.insertAdjacentElement('afterend', serveBox);
}

// Dine-in / Takeaway switch
serveBungkusBtn.textContent = 'Takeaway';

// ---------- Big "Dine-in / Takeaway" buttons above the categories ----------
// Staff must choose one before adding items to a table order, so nothing is mixed up.
const MODE_ICON_DINE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7M6 7h4M17 21V3c-2 1-3.5 4-3.5 8 0 1.2.8 2 2 2h1.5"/></svg>';
const MODE_ICON_BAG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
function makeModeBtn(text, icon, sub) {
  const b = el('button', 'od-mode-btn');
  b.type = 'button';
  const ic = el('span', 'od-mode-ic');
  ic.innerHTML = icon;
  const tx = el('span', 'od-mode-tx');
  tx.append(el('strong', '', text), el('small', '', sub));
  b.append(ic, tx);
  return b;
}
const modeBar = el('div', 'od-mode');
const modeDine = makeModeBtn('Dine-in', MODE_ICON_DINE, 'Eat here');
const modeTake = makeModeBtn('Takeaway', MODE_ICON_BAG, 'Pack to take home');
modeBar.append(modeDine, modeTake);
// row 1: Dine-in / Takeaway on the left, the search box on the right (same height)
const topRow = el('div', 'od-toprow');
orderCatsBox.insertAdjacentElement('beforebegin', topRow);
topRow.append(modeBar, searchInput);
// row 2: category buttons, with the "In stock only" switch at the end
const catRow = el('div', 'od-catrow');
topRow.insertAdjacentElement('afterend', catRow);
catRow.append(orderCatsBox, stockBtn);
// keep both rows fixed at the top while the page scrolls
const stickyBar = el('div', 'od-sticky');
topRow.insertAdjacentElement('beforebegin', stickyBar);
stickyBar.append(topRow, catRow);
toolsBox.remove();
// the old switch inside Order Details is no longer shown (the tag at the top shows the choice)
if (serveDineBtn.parentElement) serveDineBtn.parentElement.style.display = 'none';

orderSaveBtn.textContent = 'Save order';
orderSaveBtn.classList.add('secondary');
const clearBtn = el('button', 'secondary tv-clear', 'Clear basket');
clearBtn.type = 'button';
orderSaveBtn.insertAdjacentElement('afterend', clearBtn);

// "Proceed to Payment" bar with the total
const proceedBtn = el('button', 'od-proceed');
proceedBtn.type = 'button';
const proceedText = el('span', 'od-proceed-text', 'Proceed to Payment');
const proceedAmount = el('strong', 'od-proceed-amount', 'RM 0.00');
proceedBtn.append(proceedText, proceedAmount);
orderSaveBtn.insertAdjacentElement('beforebegin', proceedBtn);

// Phone only: a small "View order" bar at the bottom. Tap it to jump to Order Details.
// It hides itself while Order Details is already on the screen.
const viewBar = el('button', 'od-viewbar');
viewBar.type = 'button';
viewBar.hidden = true;
const viewBarLeft = el('span', 'od-vb-left');
const viewBarCount = el('em', 'od-vb-count', '0');
viewBarLeft.append(viewBarCount, el('span', 'od-vb-text', 'View order'));
const viewBarAmount = el('strong', 'od-vb-amount', 'RM 0.00');
viewBar.append(viewBarLeft, viewBarAmount);
document.body.appendChild(viewBar); // on the body, so it stays fixed at the bottom
viewBar.addEventListener('click', () => {
  if (basketSection) basketSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
if (basketSection && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    entries.forEach((en) => viewBar.classList.toggle('od-in-view', en.isIntersecting));
  }, { threshold: 0.15 }).observe(basketSection);
}

// One scrolling list: items already ordered, then the new items in the basket
const newLabel = el('div', 'od-label', 'New items');
newLabel.hidden = true;
if (basketSection) {
  const odScroll = el('div', 'od-scroll');
  odScroll.append(sentSection, newLabel, basketList);
  const serveBoxNow = serveDineBtn.parentElement;
  (serveBoxNow || basketTitle).insertAdjacentElement('afterend', odScroll);
}


// ---------- Order Details tabs: All / Dine-in / Takeaway ----------
// They only change which lines are shown, never the order itself or its total.
const VIEWS = [
  ['all', 'All'],
  ['dine_in', 'Dine-in'],
  ['takeaway', 'Takeaway'],
];
let viewKind = 'all';
const viewTabs = el('div', 'od-tabs');
const viewBtns = {};
VIEWS.forEach(([k, label]) => {
  const b = el('button', 'od-tab');
  b.type = 'button';
  b.append(el('span', '', label), el('em', 'od-tab-n', '0'));
  b.addEventListener('click', () => {
    viewKind = k;
    applyViewFilter();
  });
  viewBtns[k] = b;
  viewTabs.appendChild(b);
});
if (basketTitle) basketTitle.insertAdjacentElement('afterend', viewTabs);
const viewEmpty = el('p', 'menu-empty od-view-empty', '');
viewEmpty.hidden = true;
if (basketList.parentElement) basketList.parentElement.appendChild(viewEmpty);

function kindOf(serve) {
  return serve === 'dine_in' ? 'dine_in' : 'takeaway';
}

function applyViewFilter() {
  const sentRows = Array.from(sentList.querySelectorAll('.sent-row'));
  const newRows = Array.from(basketList.querySelectorAll('.basket-line'));
  const counts = { all: 0, dine_in: 0, takeaway: 0 };
  sentRows.concat(newRows).forEach((r) => {
    const n = Number(r.dataset.qty || 0);
    counts.all += n;
    if (counts[r.dataset.kind] !== undefined) counts[r.dataset.kind] += n;
  });
  Object.keys(viewBtns).forEach((k) => {
    viewBtns[k].classList.toggle('on', k === viewKind);
    viewBtns[k].classList.toggle('zero', counts[k] === 0 && k !== 'all');
    viewBtns[k].querySelector('.od-tab-n').textContent = String(counts[k]);
  });
  const hide = (r) => viewKind !== 'all' && r.dataset.kind !== viewKind;
  sentRows.forEach((r) => r.classList.toggle('vf-hide', hide(r)));
  newRows.forEach((r) => r.classList.toggle('vf-hide', hide(r)));
  sentSection.classList.toggle('vf-hide', sentRows.length > 0 && sentRows.every(hide));
  newLabel.classList.toggle('vf-hide', newRows.length > 0 && newRows.every(hide));
  const anyShown = sentRows.concat(newRows).some((r) => !hide(r));
  const name = (VIEWS.find((v) => v[0] === viewKind) || [])[1];
  viewEmpty.textContent = 'No ' + name + ' items in this order.';
  viewEmpty.hidden = !(viewKind !== 'all' && counts.all > 0 && !anyShown);
}
let viewQueued = false;
const queueView = () => {
  if (viewQueued) return;
  viewQueued = true;
  Promise.resolve().then(() => {
    viewQueued = false;
    applyViewFilter();
  });
};
new MutationObserver(queueView).observe(sentList, { childList: true });
new MutationObserver(queueView).observe(basketList, { childList: true });

// ---------- Current order ----------

let orderType = 'table'; // 'table' or 'takeaway'
let orderTable = null; // the table number, or the takeaway number
let serveType = 'dine_in';
let serveChosen = false; // table orders: staff must pick Dine-in or Takeaway first
let basket = [];
let modData = { groups: [], byItem: new Map() }; // item options: which dish has which choices
let orderCats = [];
let orderItems = [];
let orderCatFilter = null;
let soldOutMode = false;
let orderSearch = '';
let stockOnly = false;
let savedCents = 0; // total of items already saved on this order
let savedQty = 0; // number of items already saved on this order

// Tells shell.js if the basket has unsaved items ("1" = yes, "0" = empty)
function syncDirty() {
  orderScreen.dataset.dirty = basket.length > 0 ? '1' : '0';
}

function orderLabel() {
  return labelFor(orderType, orderTable).replace(/^Table/, 'table');
}

function priceFor(item) {
  return Number(item.price);
}

function showOrdersMessage(text, isError) {
  ordersMessage.textContent = text;
  ordersMessage.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  ordersMessage.hidden = false;
}

function setOrderMessage(text, isError) {
  if (!text) {
    orderMessage.hidden = true;
    return;
  }
  orderMessage.textContent = text;
  orderMessage.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  orderMessage.hidden = false;
}

async function getUserId() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('You are logged out. Please log in again.');
  return data.session.user.id;
}

async function findOpenOrder(key) {
  return await supabase
    .from('orders')
    .select('id')
    .eq('status', 'open')
    .eq('order_type', orderType)
    .eq(orderType === 'table' ? 'table_no' : 'platform_order_no', key)
    .maybeSingle();
}

// ---------- Active orders strip (top of the Tables page) ----------

const stripBox = el('div', 'tv-strip');
const stripHead = el('div', 'tv-strip-head');
const stripTitle = el('h3', '', 'Active orders');
const stripCount = el('span', 'tv-strip-count', '');
stripHead.append(stripTitle, stripCount);
const stripList = el('div', 'tv-strip-list');
stripBox.append(stripHead, stripList);
tableGrid.insertAdjacentElement('beforebegin', stripBox);

function minutesText(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins + ' min';
  return Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
}

function renderStrip(orders) {
  stripList.replaceChildren();
  stripCount.textContent = orders.length === 1 ? '1 open' : orders.length + ' open';
  if (orders.length === 0) {
    stripList.appendChild(el('p', 'menu-empty', 'No active orders right now.'));
    return;
  }
  orders.forEach((o, i) => {
    const items = (o.order_items || []).filter((x) => x.status !== 'cancelled');
    const qty = items.reduce((n, x) => n + x.qty, 0);
    const sen = items.reduce((n, x) => n + Math.round(Number(x.unit_price) * 100) * x.qty, 0);
    const isTable = o.order_type === 'table';
    const label = isTable ? 'Table ' + o.table_no : labelFor(o.order_type, o.platform_order_no);

    const card = el('button', 'secondary tv-strip-card tv-tint-' + (i % 5));
    card.type = 'button';
    const top = el('div', 'tv-strip-top');
    top.append(el('strong', '', label), el('span', '', minutesText(o.created_at)));
    card.append(top, el('div', 'tv-strip-mid', qty + (qty === 1 ? ' item' : ' items')), el('div', 'tv-strip-total', money(sen / 100)));
    card.addEventListener('click', () => openOrder(isTable ? o.table_no : o.platform_order_no, o.order_type));
    stripList.appendChild(card);
  });
}

// ---------- Table picker ----------

async function loadTables() {
  ordersMessage.hidden = true;

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_type, table_no, platform_order_no, created_at, order_items(unit_price, qty, status)')
    .eq('status', 'open')
    .order('created_at');

  if (error) {
    showOrdersMessage('Could not load tables: ' + error.message, true);
    return;
  }

  const openTables = new Set(data.filter((o) => o.order_type === 'table').map((o) => o.table_no));
  const openSince = new Map(); // table number -> when its order started
  data.forEach((o) => {
    if (o.order_type === 'table' && !openSince.has(o.table_no)) openSince.set(o.table_no, o.created_at);
  });
  tableGrid.replaceChildren();

  for (let n = 1; n <= TABLE_COUNT; n++) {
    const label = String(n);
    const isOpen = openTables.has(label);
    const b = el('button', 'secondary table-btn' + (isOpen ? ' table-open' : ''));
    b.type = 'button';
    if (isOpen) b.dataset.since = openSince.get(label) || '';
    b.appendChild(el('strong', '', label));
    if (isOpen) b.appendChild(el('small', '', 'Open'));
    b.addEventListener('click', () => openOrder(label, 'table'));
    tableGrid.appendChild(b);
  }

  renderStrip(data);
}

// the Tables page asks for a takeaway order to be opened
document.addEventListener('kamala:open-order', (e) => {
  if (e.detail && e.detail.key) openOrder(e.detail.key, e.detail.type || 'takeaway');
});

ordersBtn.addEventListener('click', async () => {
  homeScreen.hidden = true;
  ordersScreen.hidden = false;
  await loadTables();
});

ordersBackBtn.addEventListener('click', () => {
  ordersScreen.hidden = true;
  homeScreen.hidden = false;
});

// ---------- Order screen ----------

function updateServeButtons() {
  const isTake = orderType === 'takeaway';
  const isTable = orderType === 'table';
  serveDineBtn.classList.toggle('secondary', !isTable || serveType !== 'dine_in');
  serveBungkusBtn.classList.toggle('secondary', !(isTake || (isTable && serveType === 'bungkus')));
  // the options that do not fit this order are greyed out
  serveDineBtn.classList.toggle('od-locked', !isTable);
  orderScreen.dataset.otype = orderType;

  // the big buttons above the categories
  modeBar.classList.toggle('need', isTable && !serveChosen);
  modeDine.classList.toggle('on', isTable && serveChosen && serveType === 'dine_in');
  modeTake.classList.toggle('on', isTake || (isTable && serveChosen && serveType === 'bungkus'));
  modeDine.classList.toggle('locked', !isTable);
  // the tag in Order Details tells which kind of order this is
  let tag = labelFor(orderType, orderTable);
  if (isTable && serveChosen) tag += ' · ' + (serveType === 'dine_in' ? 'Dine-in' : 'Takeaway');
  basketTag.textContent = tag;
  basketTag.classList.toggle('tag-take', isTake || (isTable && serveChosen && serveType === 'bungkus'));
}

function chooseMode(kind) {
  if (orderType !== 'table') return;
  serveType = kind;
  serveChosen = true;
  setOrderMessage('');
  updateServeButtons();
  renderOrderMenu();
}
modeDine.addEventListener('click', () => chooseMode('dine_in'));
modeTake.addEventListener('click', () => chooseMode('bungkus'));

serveDineBtn.addEventListener('click', () => {
  if (orderType !== 'table') return;
  serveType = 'dine_in';
  updateServeButtons();
  renderOrderMenu();
});
serveBungkusBtn.addEventListener('click', () => {
  if (orderType !== 'table') return;
  serveType = 'bungkus';
  updateServeButtons();
  renderOrderMenu();
});
function updateSoldOutButton() {
  soldOutBtn.classList.toggle('secondary', !soldOutMode);
  soldOutBtn.textContent = soldOutMode
    ? 'Sold-out switch: ON (tap an item to change it)'
    : 'Sold-out switch: OFF';
}

soldOutBtn.addEventListener('click', () => {
  soldOutMode = !soldOutMode;
  updateSoldOutButton();
  setOrderMessage('');
  renderOrderMenu();
});

async function toggleSoldOut(item) {
  setOrderMessage('');
  const newValue = !item.sold_out;

  const { error } = await supabase.rpc('set_sold_out', {
    p_item_id: String(item.id),
    p_sold_out: newValue,
  });

  if (error) {
    setOrderMessage('Could not change sold-out: ' + error.message, true);
    return;
  }

  item.sold_out = newValue;
  const keepScroll = orderMenuBox.scrollTop;
  renderOrderMenu();
  orderMenuBox.scrollTop = keepScroll;
  setOrderMessage(
    newValue ? '"' + item.name + '" is now SOLD OUT.' : '"' + item.name + '" is available again.',
    false
  );
}

async function openOrder(key, type) {
  orderTable = key;
  orderType = type;
  basket = [];
  syncDirty();
  savedCents = 0;
  savedQty = 0;
  serveType = type === 'table' ? 'dine_in' : 'bungkus';
  serveChosen = type !== 'table';
  viewKind = 'all';
  applyViewFilter();
  orderCatFilter = null;
  soldOutMode = false;
  orderSearch = '';
  searchInput.value = '';
  stockOnly = false;
  stockBtn.classList.add('secondary');
  stockBtn.classList.remove('tv-on');
  basketTag.textContent = labelFor(type, key);
  updateSoldOutButton();
  orderTitle.textContent = labelFor(type, key);
  setOrderMessage('');
  updateServeButtons();
  ordersScreen.hidden = true;
  orderScreen.hidden = false;

  const catRes = await supabase
    .from('categories')
    .select('id, name')
    .eq('active', true)
    .order('sort_order')
    .order('name');
  // try the newest column list first; if a column is not created yet, use the older list
  const itemCols = [
    'id, category_id, name, price, delivery_price, sold_out, image_url, available_for',
    'id, category_id, name, price, delivery_price, sold_out, image_url',
    'id, category_id, name, price, delivery_price, sold_out',
  ];
  let itemRes = null;
  for (const cols of itemCols) {
    itemRes = await supabase.from('menu_items').select(cols).eq('active', true).order('name');
    if (!itemRes.error || !/available_for|image_url/i.test(itemRes.error.message)) break;
  }

  if (catRes.error || itemRes.error) {
    const err = catRes.error || itemRes.error;
    setOrderMessage('Could not load the menu: ' + err.message, true);
    return;
  }

  orderCats = catRes.data;
  orderItems = itemRes.data.filter((i) => orderCats.some((c) => c.id === i.category_id));
  modData = await loadModifiers(); // item options (empty until modifiers.sql was run)
  renderOrderCats();
  renderOrderMenu();
  renderBasket();
  await loadSentItems();
}

function renderOrderCats() {
  orderCatsBox.replaceChildren();
  const all = [{ id: null, name: 'All' }, ...orderCats];
  all.forEach((c) => {
    const b = el('button', 'small' + (orderCatFilter === c.id ? '' : ' secondary'), c.name);
    b.type = 'button';
    b.addEventListener('click', () => {
      orderCatFilter = c.id;
      renderOrderCats();
      renderOrderMenu();
    });
    orderCatsBox.appendChild(b);
  });
}

function renderOrderMenu() {
  orderMenuBox.replaceChildren();
  const q = orderSearch.trim().toLowerCase();
  // Takeaway mode shows the takeaway items; Dine-in mode shows the dine-in items.
  // Items marked "both" (or not marked) show in both modes.
  const mode = serveType === 'bungkus' ? 'takeaway' : 'dinein';
  const list = orderItems.filter(
    (i) =>
      (!i.available_for || i.available_for === 'both' || i.available_for === mode) &&
      (orderCatFilter === null || i.category_id === orderCatFilter) &&
      (q === '' || i.name.toLowerCase().includes(q)) &&
      (!stockOnly || !i.sold_out)
  );

  if (list.length === 0) {
    orderMenuBox.appendChild(el('p', 'menu-empty', 'No available items here.'));
    return;
  }

  list.forEach((item) => {
    const cat = orderCats.find((c) => c.id === item.category_id);
    const b = el('button', 'secondary order-item' + (item.sold_out ? ' is-soldout' : ''));
    b.type = 'button';
    b.title = item.name;
    b.appendChild(el('span', 'tv-cat', cat ? cat.name : ''));
    if (item.image_url) {
      const photo = el('img', 'tv-photo');
      photo.src = item.image_url;
      photo.alt = item.name;
      photo.loading = 'lazy';
      b.appendChild(photo);
    } else {
      const ph = el('span', 'tv-ph');
      ph.innerHTML =
        '<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="32" cy="34" r="15"></circle><circle cx="32" cy="34" r="9.5"></circle>' +
        '<path d="M9 14v11a4 4 0 0 0 4 4v21M13 14v9M17 14v11a4 4 0 0 1-4 4"></path>' +
        '<path d="M55 14c-4 3-6 9-6 15v3h6v18"></path></svg>';
      b.appendChild(ph);
    }
    b.appendChild(el('strong', '', item.name));
    if (item.sold_out) {
      b.appendChild(el('span', 'soldout-tag', 'SOLD OUT'));
    } else {
      b.appendChild(el('span', 'menu-price', money(priceFor(item))));
    }
    // small sold-out icon (left of the + icon): tap it to switch this dish sold out / available
    const soBtn = el('span', 'oi-soldout' + (item.sold_out ? ' is-on' : ''));
    soBtn.setAttribute('role', 'button');
    soBtn.title = item.sold_out ? 'Sold out - tap to make available again' : 'Mark as sold out';
    soBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path></svg>';
    soBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSoldOut(item);
    });
    b.appendChild(soBtn);

    b.addEventListener('click', () => {
      if (soldOutMode) {
        toggleSoldOut(item);
      } else if (item.sold_out) {
        setOrderMessage('"' + item.name + '" is sold out.', true);
      } else {
        addToBasket(item);
      }
    });
    orderMenuBox.appendChild(b);
  });
}

searchInput.addEventListener('input', () => {
  orderSearch = searchInput.value;
  renderOrderMenu();
});

stockBtn.addEventListener('click', () => {
  stockOnly = !stockOnly;
  stockBtn.classList.toggle('secondary', !stockOnly);
  stockBtn.classList.toggle('tv-on', stockOnly);
  renderOrderMenu();
});

clearBtn.addEventListener('click', async () => {
  if (basket.length === 0) return;
  const ok = await askConfirm({
    title: 'Clear the basket?',
    message: 'All items that are not saved yet will be removed.',
    okText: 'Clear',
    cancelText: 'Keep',
    danger: true,
  });
  if (!ok) return;
  basket = [];
  renderBasket();
});

async function addToBasket(item) {
  if (orderType === 'table' && !serveChosen) {
    setOrderMessage('Please choose Dine-in or Takeaway first.', true);
    modeBar.classList.remove('shake');
    void modeBar.offsetWidth;
    modeBar.classList.add('shake');
    return;
  }
  // a dish with options (Spice level, Hot / Iced ...) asks first
  let mods = [];
  const groups = modData.byItem.get(String(item.id));
  if (groups && groups.length) {
    const chosen = await pickModifiers({ name: item.name, basePrice: priceFor(item), groups });
    if (chosen === null) return; // closed without choosing
    mods = chosen;
  }
  // Lines that already have a note are not merged, so the note stays on its own line.
  // Lines with different options are not merged either.
  const key = modsKey(mods);
  const existing = basket.find(
    (l) => l.menu_item_id === item.id && l.serve_type === serveType && !l.note && modsKey(l.mods) === key
  );
  if (existing) {
    existing.qty += 1;
  } else {
    basket.push({
      menu_item_id: item.id,
      name: item.name,
      price: priceFor(item) + modsPrice(mods), // the options that cost extra are part of the price
      serve_type: serveType,
      qty: 1,
      note: '',
      mods,
    });
  }
  renderBasket();
}

function changeQty(index, delta) {
  basket[index].qty += delta;
  if (basket[index].qty <= 0) basket.splice(index, 1);
  renderBasket();
}

async function editBasketNote(index) {
  const line = basket[index];
  const typed = await askText({
    title: 'Note for ' + line.name,
    message: line.note
      ? 'Current note: ' + line.note + '. Type a new note (or leave empty to remove it).'
      : 'Example: no sugar, less spicy.',
    placeholder: 'Note',
    okText: 'Save note',
  });
  if (typed === null) return;
  line.note = typed.trim();
  renderBasket();
}

const ICON_PENCIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

// small button with an icon and a text
function iconButton(icon, label, onClick, cls) {
  const b = el('button', cls || '');
  b.type = 'button';
  b.innerHTML = icon;
  if (label) b.appendChild(el('span', '', label));
  b.addEventListener('click', onClick);
  return b;
}

// price shown as two parts, so "RM" is in the same column on every row and the numbers line up
function priceCell(value) {
  const c = el('span', 'menu-price price-cell');
  c.append(el('span', 'pc-rm', 'RM'), el('span', 'pc-num', Number(value).toFixed(2)));
  return c;
}

function sumRow(label, value, cls) {
  const r = el('div', 'tv-sum-row' + (cls ? ' ' + cls : ''));
  r.append(el('span', '', label), el('strong', '', value));
  return r;
}

// Subtotal / Total box and the "Proceed to Payment" bar (saved items + new items in the basket)
function updateSummary() {
  const newCents = basket.reduce((n, l) => n + Math.round(l.price * 100) * l.qty, 0);
  const total = savedCents + newCents;
  const count = savedQty + basket.reduce((n, l) => n + l.qty, 0);

  basketTotal.replaceChildren();
  if (count > 0) {
    basketTotal.append(
      sumRow('Subtotal (' + count + (count === 1 ? ' item)' : ' items)'), money(total / 100)),
      sumRow('Total', money(total / 100), 'tv-sum-total')
    );
  }
  proceedAmount.textContent = money(total / 100);
  viewBarCount.textContent = String(count);
  viewBarAmount.textContent = money(total / 100);
  viewBar.hidden = count === 0;
  proceedBtn.disabled = total <= 0;
  clearBtn.hidden = basket.length === 0;
  newLabel.hidden = basket.length === 0;
}

function renderBasket() {
  syncDirty();
  basketList.replaceChildren();

  if (basket.length === 0) {
    if (savedQty === 0) basketList.appendChild(el('p', 'menu-empty', 'No items yet. Tap a dish on the left.'));
    updateSummary();
    return;
  }

  basket.forEach((line, index) => {
    const row = el('div', 'basket-line');
    row.dataset.kind = kindOf(line.serve_type);
    row.dataset.qty = line.qty;
    const info = el('div', 'menu-info');
    info.appendChild(el('strong', '', line.name));
    info.appendChild(el('span', 'menu-tag', line.serve_type === 'dine_in' ? 'Dine-in' : 'Takeaway'));
    if (line.mods && line.mods.length) info.appendChild(el('span', 'item-mods', modsList(line.mods).join(', ')));
    if (line.note) info.appendChild(el('span', 'item-note', 'Note: ' + line.note));

    const qty = el('div', 'basket-qty');
    qty.appendChild(makeButton('-', () => changeQty(index, -1)));
    qty.appendChild(el('strong', '', String(line.qty)));
    qty.appendChild(makeButton('+', () => changeQty(index, 1)));
    const noteIcon = iconButton(ICON_PENCIL, '', () => editBasketNote(index), 'bk-note' + (line.note ? ' has-note' : ''));
    noteIcon.title = line.note ? 'Edit note' : 'Add note';
    qty.appendChild(noteIcon);
    qty.appendChild(priceCell(line.price * line.qty));

    row.append(info, qty);
    basketList.appendChild(row);
  });

  updateSummary();
}

orderBackBtn.addEventListener('click', async () => {
  if (basket.length > 0) {
    const leave = await askConfirm({
      title: 'Leave this order?',
      message: 'The items in the basket are not saved yet and will be lost.',
      okText: 'Leave',
      cancelText: 'Stay',
      danger: true,
    });
    if (!leave) return;
  }
  basket = [];
  syncDirty();
  orderScreen.hidden = true;
  ordersScreen.hidden = false;
  await loadTables();
});

// ---------- Save the order ----------

// Saves the basket onto the open order (creates the order if needed). Returns the order id.
// If the basket is empty it just returns the open order id (or null).
async function persistBasket() {
  if (basket.length === 0) {
    const f = await findOpenOrder(orderTable);
    if (f.error) throw f.error;
    return f.data ? f.data.id : null;
  }
  const userId = await getUserId();

  // Use the open order if there is one, otherwise create it
  let found = await findOpenOrder(orderTable);
  if (found.error) throw found.error;
  let orderId = found.data ? found.data.id : null;

  if (orderId === null) {
    const created = await supabase
      .from('orders')
      .insert({
        order_type: orderType,
        table_no: orderType === 'table' ? orderTable : null,
        platform_order_no: orderType === 'table' ? null : orderTable,
        status: 'open',
        created_by: userId,
      })
      .select('id')
      .single();

    if (created.error) {
      // 23505 = someone just opened this table at the same moment
      if (created.error.code === '23505') {
        found = await findOpenOrder(orderTable);
        if (found.error || !found.data) throw created.error;
        orderId = found.data.id;
      } else {
        throw created.error;
      }
    } else {
      orderId = created.data.id;
    }
  }

  const withMods = await modsReady();
  const rows = basket.map((line) => ({
    order_id: orderId,
    menu_item_id: line.menu_item_id,
    item_name: line.name,
    unit_price: line.price,
    qty: line.qty,
    serve_type: line.serve_type,
    note: line.note ? line.note : null,
    ...(withMods ? { modifiers: line.mods || [] } : {}),
    status: 'active',
    created_by: userId,
  }));

  const { error } = await supabase.from('order_items').insert(rows);
  if (error) throw error;
  // the items are saved now: empty the basket and reload the saved list
  basket = [];
  renderBasket();
  await loadSentItems();
  return orderId;
}

async function saveOrder() {
  setOrderMessage('');

  if (basket.length === 0) {
    setOrderMessage('Add at least one item first.', true);
    return;
  }

  orderSaveBtn.disabled = true;
  orderSaveBtn.textContent = 'Saving...';

  try {
    await persistBasket();

    const label = orderLabel();
    basket = [];
    syncDirty();
    orderScreen.hidden = true;
    ordersScreen.hidden = false;
    await loadTables();
    showOrdersMessage('Order saved for ' + label + '.', false);
  } catch (err) {
    setOrderMessage('Could not save the order: ' + err.message, true);
  }

  orderSaveBtn.disabled = false;
  orderSaveBtn.textContent = 'Save order';
}

orderSaveBtn.addEventListener('click', saveOrder);

// ---------- Items already saved ----------

async function editSavedNote(item) {
  setOrderMessage('');
  const typed = await askText({
    title: 'Note for ' + item.item_name,
    message: item.note
      ? 'Current note: ' + item.note + '. Type a new note (or leave empty to remove it).'
      : 'Example: no sugar, less spicy.',
    placeholder: 'Note',
    okText: 'Save note',
  });
  if (typed === null) return;

  const newNote = typed.trim();
  const { data, error } = await supabase
    .from('order_items')
    .update({ note: newNote === '' ? null : newNote })
    .eq('id', item.id)
    .select();

  if (error) {
    setOrderMessage('Could not save the note: ' + error.message, true);
    return;
  }
  if (!data || data.length === 0) {
    setOrderMessage('The database blocked this change.', true);
    return;
  }

  await loadSentItems();
  setOrderMessage('Note saved.', false);
}

async function loadSentItems() {
  savedCents = 0;
  savedQty = 0;
  await loadSentItemsInner();
  updateSummary();
  if (basket.length === 0) renderBasket();
}

async function loadSentItemsInner() {
  sentSection.hidden = true;
  sentList.replaceChildren();
  sentTotal.textContent = '';

  const found = await findOpenOrder(orderTable);
  if (found.error || !found.data) return;

  const ITEM_COLS = 'id, menu_item_id, item_name, unit_price, qty, serve_type, note';
  // paid_part_id exists only after splitbill-refund.sql was run
  const modCol = (await modsReady()) ? ', modifiers' : '';
  let res = await supabase.from('order_items').select(ITEM_COLS + modCol + ', paid_part_id').eq('order_id', found.data.id).eq('status', 'active').order('created_at');
  if (res.error) res = await supabase.from('order_items').select(ITEM_COLS + modCol).eq('order_id', found.data.id).eq('status', 'active').order('created_at');
  const { data, error } = res;

  if (error) {
    setOrderMessage('Could not load the saved items: ' + error.message, true);
    return;
  }
  if (data.length === 0) return;

  let total = 0;
  let paidItemsCents = 0;
  data.forEach((item) => {
    // already paid in a split bill: show it, but it cannot be changed and is not part of the amount left
    if (item.paid_part_id !== null && item.paid_part_id !== undefined) {
      const done = el('div', 'basket-line sent-row sent-paid');
      done.dataset.kind = kindOf(item.serve_type);
      const info = el('div', 'menu-info');
      info.appendChild(el('strong', '', item.qty + ' x ' + item.item_name));
      info.appendChild(el('span', 'menu-tag sent-paid-tag', 'Paid'));
      if (item.modifiers && item.modifiers.length) info.appendChild(el('span', 'item-mods', modsList(item.modifiers).join(', ')));
      done.append(info, priceCell(Number(item.unit_price) * item.qty));
      sentList.appendChild(done);
      paidItemsCents += Math.round(Number(item.unit_price) * 100) * item.qty;
      return;
    }
    total += Number(item.unit_price) * item.qty;
    savedCents += Math.round(Number(item.unit_price) * 100) * item.qty;
    savedQty += item.qty;

    const row = el('div', 'basket-line sent-row');
    row.dataset.kind = kindOf(item.serve_type);
    row.dataset.qty = item.qty;
    const top = el('div', 'sent-top');
    top.setAttribute('role', 'button');
    top.tabIndex = 0;
    top.setAttribute('aria-expanded', 'false');

    const info = el('div', 'menu-info');
    info.appendChild(el('strong', '', item.qty + ' x ' + item.item_name));
    info.appendChild(el('span', 'menu-tag', item.serve_type === 'dine_in' ? 'Dine-in' : 'Takeaway'));
    if (item.modifiers && item.modifiers.length) info.appendChild(el('span', 'item-mods', modsList(item.modifiers).join(', ')));
    if (item.note) info.appendChild(el('span', 'item-note', 'Note: ' + item.note));

    const chev = el('span', 'sent-chev');
    chev.innerHTML = ICON_CHEVRON;
    top.append(info, priceCell(Number(item.unit_price) * item.qty), chev);

    // the Note / Cancel buttons stay hidden until the row is tapped
    const actions = el('div', 'sent-actions');
    actions.hidden = true;
    // more than one on this line: the number shows how many are on the order now.
    // Press - to lower it (the difference is cancelled when you press the red button).
    let remain = item.qty;
    const cancelBtn = iconButton(ICON_TRASH, 'Cancel item', () => cancelItem(item, item.qty - remain), 'sent-act sent-cancel');
    const cancelLabel = cancelBtn.querySelector('span:last-child') || cancelBtn;
    let qtyNum = null;
    let qtyLabel = null;
    let minusBtn = null;
    let plusBtn = null;
    const setCancelText = () => {
      if (item.qty <= 1) return;
      const cut = item.qty - remain;
      qtyNum.textContent = String(remain);
      qtyLabel.textContent = cut > 0 ? 'Quantity (was ' + item.qty + ')' : 'Quantity';
      minusBtn.disabled = remain <= 0;
      plusBtn.disabled = remain >= item.qty;
      cancelBtn.disabled = cut <= 0;
      cancelLabel.textContent = cut <= 0 ? 'Cancel item' : remain === 0 ? 'Cancel all ' + item.qty : 'Cancel ' + cut;
    };
    if (item.qty > 1) {
      const qtyRow = el('div', 'sent-qty');
      qtyLabel = el('span', 'sent-qty-label', 'Quantity');
      qtyRow.appendChild(qtyLabel);
      const stepper = el('div', 'sent-qty-step');
      minusBtn = el('button', 'sq-btn', '\u2212');
      minusBtn.type = 'button';
      minusBtn.setAttribute('aria-label', 'One less');
      qtyNum = el('span', 'sq-num', String(item.qty));
      plusBtn = el('button', 'sq-btn', '+');
      plusBtn.type = 'button';
      plusBtn.setAttribute('aria-label', 'One more (back up to the original)');
      minusBtn.addEventListener('click', () => { if (remain > 0) { remain -= 1; setCancelText(); } });
      plusBtn.addEventListener('click', () => { if (remain < item.qty) { remain += 1; setCancelText(); } });
      stepper.append(minusBtn, qtyNum, plusBtn);
      qtyRow.appendChild(stepper);
      actions.appendChild(qtyRow);
    }
    actions.append(
      iconButton(ICON_PENCIL, item.note ? 'Edit note' : 'Add note', () => editSavedNote(item), 'sent-act'),
      cancelBtn
    );
    setCancelText();

    const toggle = () => {
      const willOpen = actions.hidden;
      sentList.querySelectorAll('.sent-row.open').forEach((r) => {
        r.classList.remove('open');
        r.querySelector('.sent-actions').hidden = true;
        r.querySelector('.sent-top').setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        actions.hidden = false;
        row.classList.add('open');
        top.setAttribute('aria-expanded', 'true');
      }
    };
    top.addEventListener('click', toggle);
    top.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    row.append(top, actions);
    sentList.appendChild(row);
  });

  // part of the bill paid by an equal share / amount: take it off what is left
  const ps = await supabase.from('orders').select('paid_subtotal').eq('id', found.data.id).maybeSingle();
  let partPaid = 0;
  if (!ps.error && ps.data && Number(ps.data.paid_subtotal) > 0) {
    partPaid = Math.round(Number(ps.data.paid_subtotal) * 100);
    const byAmount = Math.max(0, partPaid - paidItemsCents);
    savedCents = Math.max(0, savedCents - byAmount);
    total -= byAmount / 100;
  }
  sentTotal.textContent = 'Ordered so far: ' + money(total) + (partPaid > 0 ? '  |  Part paid: ' + money(partPaid / 100) : '');
  sentSection.hidden = false;
}

// ---------- Cancel an item or the whole order ----------

function pickReason(what) {
  return new Promise((resolve) => {
    reasonTitle.textContent = 'Why cancel ' + what + '?';
    reasonOptions.replaceChildren();

    function finish(value) {
      reasonBox.hidden = true;
      resolve(value);
    }

    CANCEL_REASONS.forEach((text, index) => {
      const isOther = index === CANCEL_REASONS.length - 1;
      const b = el('button', 'secondary', text);
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (!isOther) {
          finish(text);
          return;
        }
        const typed = await askText({
          title: 'Other reason',
          message: 'Type the reason for cancelling.',
          placeholder: 'Reason',
          okText: 'Save reason',
        });
        if (typed === null) return;
        finish(typed);
      });
      reasonOptions.appendChild(b);
    });

    reasonClose.onclick = () => finish(null);
    reasonBox.hidden = false;
  });
}

async function cancelOrderRow(orderId, reason, userId) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancel_reason: reason,
      cancelled_by: userId,
      closed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('The database blocked this cancel.');
}

async function cancelItem(item, howMany) {
  setOrderMessage('');
  const n = Math.max(1, Math.min(howMany || item.qty, item.qty));
  const part = n < item.qty; // cancel only some of the quantity
  const reason = await pickReason((n > 1 ? n + ' x ' : '') + '"' + item.item_name + '"');
  if (reason === null) return;

  try {
    const userId = await getUserId();
    const stamp = new Date().toISOString();
    let message = n > 1 ? n + ' x ' + item.item_name + ' cancelled.' : 'Item cancelled.';

    if (part) {
      // 1) the line keeps the rest of the quantity
      const keep = await supabase.from('order_items').update({ qty: item.qty - n }).eq('id', item.id).select();
      if (keep.error) throw keep.error;
      if (!keep.data || keep.data.length === 0) throw new Error('The database blocked this cancel.');

      // 2) the cancelled quantity is saved as its own cancelled line (so the Cancelled report shows it)
      const orderRow = await findOpenOrder(orderTable);
      const ins = await supabase.from('order_items').insert({
        order_id: orderRow.data.id,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        unit_price: item.unit_price,
        qty: n,
        serve_type: item.serve_type,
        note: item.note ? item.note : null,
        ...(item.modifiers ? { modifiers: item.modifiers } : {}),
        status: 'cancelled',
        cancel_reason: reason,
        cancelled_by: userId,
        cancelled_at: stamp,
        created_by: userId,
      });
      if (ins.error) {
        // put the quantity back, so nothing is lost
        await supabase.from('order_items').update({ qty: item.qty }).eq('id', item.id);
        throw ins.error;
      }
    } else {
      const { data, error } = await supabase
        .from('order_items')
        .update({ status: 'cancelled', cancel_reason: reason, cancelled_by: userId, cancelled_at: stamp })
        .eq('id', item.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('The database blocked this cancel.');

      // If nothing is left on the order, close the order too
      const found = await findOpenOrder(orderTable);
      if (found.data) {
        const left = await supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', found.data.id)
          .eq('status', 'active');
        if (left.error) throw left.error;
        if (left.count === 0) {
          await cancelOrderRow(found.data.id, reason, userId);
          message += ' The order was empty, so it was cancelled.';
        }
      }
    }

    await loadSentItems();
    setOrderMessage(message, false);
  } catch (err) {
    setOrderMessage('Could not cancel: ' + err.message, true);
  }
}

cancelOrderBtn.addEventListener('click', async () => {
  setOrderMessage('');
  const reason = await pickReason('the whole order for ' + orderLabel());
  if (reason === null) return;

  try {
    const userId = await getUserId();
    const found = await findOpenOrder(orderTable);
    if (found.error) throw found.error;
    if (!found.data) throw new Error('There is no open order here.');

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'cancelled', cancel_reason: reason, cancelled_by: userId, cancelled_at: new Date().toISOString() })
      .eq('order_id', found.data.id)
      .eq('status', 'active');
    if (error) throw error;

    await cancelOrderRow(found.data.id, reason, userId);

    const label = orderLabel();
    basket = [];
    syncDirty();
    orderScreen.hidden = true;
    ordersScreen.hidden = false;
    await loadTables();
    showOrdersMessage('Order for ' + label + ' was cancelled.', false);
  } catch (err) {
    setOrderMessage('Could not cancel: ' + err.message, true);
  }
});
// ---------- Proceed to Payment ----------
// Saves any new items, then opens the Take Payment page with this order already ticked.

async function proceedToPayment() {
  setOrderMessage('');
  const newCents = basket.reduce((n, l) => n + Math.round(l.price * 100) * l.qty, 0);
  if (savedCents + newCents <= 0) {
    setOrderMessage('Add at least one item before taking payment.', true);
    return;
  }

  proceedBtn.disabled = true;
  try {
    const orderId = await persistBasket();
    if (!orderId) throw new Error('There is no open order to pay.');
    basket = [];
    syncDirty();
    orderScreen.hidden = true;
    document.dispatchEvent(new CustomEvent('kamala:pay-order', { detail: { orderId } }));
  } catch (err) {
    setOrderMessage('Could not open the payment page: ' + err.message, true);
  }
  proceedBtn.disabled = false;
}

proceedBtn.addEventListener('click', proceedToPayment);
