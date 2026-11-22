import { supabase, el, makeButton, money } from './common.js';

const DAY = 24 * 60 * 60 * 1000;
let reqId = 0;

// ---------- date helpers (Malaysia dates) ----------
function todayMY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}

function niceTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function orderText(o) {
  if (!o) return 'Order';
  if (o.order_type === 'table') return 'Table ' + o.table_no;
  if (o.order_type === 'takeaway') return 'Takeaway ' + o.platform_order_no;
  return 'Order #' + o.platform_order_no;
}

// ---------- build the screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'cancelled-screen';
screen.hidden = true;

const wrap = el('div', 'rp-wrap');

const backBtn = makeButton('Back', goHome, 'secondary');
const title = el('h2', '', 'Cancelled items');

const toolbar = el('div', 'rp-toolbar');
const fromInput = el('input', '');
fromInput.type = 'date';
const toInput = el('input', '');
toInput.type = 'date';
const showBtn = makeButton('Show', () => load(), '');

const quick = el('div', 'rp-tabs');
quick.append(
  makeButton('Today', () => setRange(todayMY(), todayMY()), 'secondary'),
  makeButton('Last 7 days', () => setRange(addDays(todayMY(), -6), todayMY()), 'secondary'),
  makeButton('This month', () => setRange(todayMY().slice(0, 8) + '01', todayMY()), 'secondary')
);

toolbar.append(el('span', '', 'From'), fromInput, el('span', '', 'To'), toInput, showBtn);

const message = el('p', 'menu-message', '');
message.hidden = true;
const summary = el('p', '', '');
const list = el('div', '');

wrap.append(backBtn, title, quick, toolbar, message, summary, list);
screen.appendChild(wrap);
document.body.appendChild(screen);

// ---------- get the data ----------
async function fetchCancelled(startISO, endISO) {
  let rows = [];
  let from = 0;
  while (true) {
    const res = await supabase
      .from('order_items')
      .select(
        'id, item_name, qty, unit_price, cancel_reason, cancelled_at, cancelled_by, orders(order_type, table_no, platform_order_no)'
      )
      .eq('status', 'cancelled')
      .gte('cancelled_at', startISO)
      .lt('cancelled_at', endISO)
      .order('cancelled_at', { ascending: false })
      .order('id')
      .range(from, from + 999);
    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function fetchNames(ids) {
  const map = {};
  if (ids.length === 0) return map;
  const res = await supabase.from('profiles').select('id, full_name').in('id', ids);
  if (!res.error) res.data.forEach((p) => (map[p.id] = p.full_name));
  return map;
}

// ---------- show the data ----------
function render(rows, names) {
  list.replaceChildren();
  let totalSen = 0;
  let totalQty = 0;

  if (rows.length === 0) {
    summary.textContent = '';
    list.appendChild(el('p', 'menu-empty', 'No cancelled items in this period.'));
    return;
  }

  rows.forEach((r) => {
    const sen = Math.round(Number(r.unit_price) * 100) * r.qty;
    totalSen += sen;
    totalQty += r.qty;

    const row = el('div', 'basket-line');
    const info = el('div', 'menu-info');
    info.appendChild(el('strong', '', r.qty + ' x ' + r.item_name));
    info.appendChild(el('span', 'menu-tag', orderText(r.orders)));
    info.appendChild(el('span', 'item-note', 'Reason: ' + (r.cancel_reason || '-')));
    const who = names[r.cancelled_by] || 'Unknown';
    info.appendChild(el('span', 'item-note', 'By ' + who + ' | ' + niceTime(r.cancelled_at)));

    const right = el('div', 'basket-qty');
    right.appendChild(el('span', 'menu-price', money(sen / 100)));

    row.append(info, right);
    list.appendChild(row);
  });

  summary.textContent = totalQty + ' items cancelled | Value: ' + money(totalSen / 100);
}

function setRange(from, to) {
  fromInput.value = from;
  toInput.value = to;
  load();
}

async function load() {
  const myReq = ++reqId;
  message.hidden = true;

  if (!fromInput.value || !toInput.value || fromInput.value > toInput.value) {
    message.textContent = 'Please choose a valid From and To date.';
    message.className = 'menu-message menu-error';
    message.hidden = false;
    return;
  }

  const startISO = new Date(fromInput.value + 'T00:00:00+08:00').toISOString();
  const endISO = new Date(addDays(toInput.value, 1) + 'T00:00:00+08:00').toISOString();

  try {
    const rows = await fetchCancelled(startISO, endISO);
    const ids = [...new Set(rows.map((r) => r.cancelled_by).filter(Boolean))];
    const names = await fetchNames(ids);
    if (myReq !== reqId) return;
    render(rows, names);
  } catch (err) {
    if (myReq !== reqId) return;
    message.textContent = 'Could not load: ' + err.message;
    message.className = 'menu-message menu-error';
    message.hidden = false;
  }
}

// ---------- screens and the owner-only button ----------
function goHome() {
  screen.hidden = true;
  document.getElementById('home-screen').hidden = false;
}

function openReport() {
  document.querySelectorAll('main.screen').forEach((s) => {
    s.hidden = s !== screen;
  });
  setRange(todayMY(), todayMY());
}

const openBtn = makeButton('Cancelled items', openReport, '');
openBtn.hidden = true;

// wait one moment so this button lands after the "Sales reports" button
setTimeout(() => {
  const stack = document.querySelector('#home-screen .stack');
  const logout = document.getElementById('logout-btn');
  if (stack) stack.insertBefore(openBtn, logout);
}, 0);

async function refreshButton() {
  const s = await supabase.auth.getSession();
  const user = s.data && s.data.session ? s.data.session.user : null;
  if (!user) {
    openBtn.hidden = true;
    return;
  }
  const p = await supabase.from('profiles').select('role').eq('id', user.id).single();
  openBtn.hidden = !(p.data && p.data.role === 'owner');
}

supabase.auth.onAuthStateChange(() => {
  setTimeout(refreshButton, 0);
});
refreshButton();