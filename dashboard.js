// Dashboard: today's numbers at a glance (owner only).
import { supabase, el, makeButton } from './common.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'dashboard.css';
document.head.appendChild(link);

const MY_OFFSET = 8 * 60 * 60 * 1000;
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayMY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
}
const startISO = (dateStr) => new Date(dateStr + 'T00:00:00+08:00').toISOString();
const myDay = (iso) => new Date(new Date(iso).getTime() + MY_OFFSET).toISOString().slice(0, 10);
const rm = (n) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function icon(inner) {
  return (
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'
  );
}
const IC = {
  sales: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  bills: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  avg: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  open: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

// ---------- build the screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'dashboard-screen';
screen.hidden = true;
const wrap = el('div', 'db-wrap');

const bar = el('div', 'db-bar');
const barTitle = el('div', 'db-bar-title', 'Today');
const stamp = el('span', 'db-stamp', '');
const refreshBtn = makeButton('Refresh', () => load(), '');
bar.append(barTitle, stamp, refreshBtn);

const msg = el('p', 'menu-message menu-error', '');
msg.hidden = true;

const stats = el('div', 'rp-stats');
const grid2 = el('div', 'db-grid2');
const grid3 = el('div', 'db-grid3');
const trendPanel = el('section', 'rp-panel');
const payPanel = el('section', 'rp-panel');
const topPanel = el('section', 'rp-panel');
const typePanel = el('section', 'rp-panel');
const flagPanel = el('section', 'rp-panel');
grid2.append(trendPanel, payPanel);
grid3.append(topPanel, typePanel, flagPanel);
wrap.append(bar, msg, stats, grid2, grid3);
screen.appendChild(wrap);
document.body.appendChild(screen);

function tile(ic, label, value, sub, main) {
  const t = el('div', 'rp-tile' + (main ? ' rp-tile-main' : ''));
  const i = el('div', 'rp-ic');
  i.innerHTML = icon(ic);
  const body = el('div', 'rp-tile-body');
  body.append(el('div', 'rp-tile-label', label), el('div', 'rp-tile-value', value));
  const s = el('div', 'rp-tile-sub', '');
  if (sub) {
    if (sub.cls) s.append(el('span', sub.cls, sub.text), document.createTextNode(' ' + (sub.tail || '')));
    else s.textContent = sub.text;
  }
  body.appendChild(s);
  t.append(i, body);
  return t;
}

function panel(p, title, ...kids) {
  p.replaceChildren(el('h3', '', title), ...kids);
}

function barRow(label, valueText, pct, cls) {
  const r = el('div', 'db-row');
  const top = el('div', 'db-row-top');
  top.append(el('span', '', label), el('strong', '', valueText));
  const track = el('div', 'db-track');
  const fill = el('div', 'db-fill' + (cls ? ' ' + cls : ''));
  fill.style.width = Math.max(pct, pct > 0 ? 3 : 0) + '%';
  track.appendChild(fill);
  r.append(top, track);
  return r;
}

// ---------- fetch ----------
async function fetchPayments(fromDate, toDate) {
  let rows = [];
  let from = 0;
  while (true) {
    let res = await supabase
      .from('payments')
      .select('id, amount, method, created_at, tender_seq')
      .gte('created_at', startISO(fromDate))
      .lt('created_at', startISO(toDate))
      .order('id')
      .range(from, from + 999);
    if (res.error) {
      res = await supabase.from('payments').select('id, amount, method, created_at').gte('created_at', startISO(fromDate)).lt('created_at', startISO(toDate)).order('id').range(from, from + 999);
    }
    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }
  // refunds count as negative sales (the table exists only after splitbill-refund.sql was run)
  from = 0;
  while (true) {
    const rr = await supabase.from('refunds').select('amount, method, created_at').gte('created_at', startISO(fromDate)).lt('created_at', startISO(toDate)).order('id').range(from, from + 999);
    if (rr.error) break;
    rows = rows.concat(rr.data.map((x) => ({ amount: -Number(x.amount), method: x.method, created_at: x.created_at, refund: true })));
    if (rr.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function fetchPaidOrders(paymentIds) {
  let out = [];
  for (let i = 0; i < paymentIds.length; i += 80) {
    const chunk = paymentIds.slice(i, i + 80);
    const res = await supabase
      .from('orders')
      .select('id, order_type, order_items(item_name, qty, unit_price, status)')
      .in('payment_id', chunk);
    if (res.error) throw res.error;
    out = out.concat(res.data);
  }
  return out;
}

let reqId = 0;
async function load() {
  const my = ++reqId;
  const today = todayMY();
  const tomorrow = addDays(today, 1);
  wrap.classList.add('rp-loading');
  try {
    const [pays, openRes, canRes] = await Promise.all([
      fetchPayments(addDays(today, -6), tomorrow),
      supabase.from('orders').select('id, order_type').eq('status', 'open'),
      supabase
        .from('order_items')
        .select('qty, unit_price')
        .eq('status', 'cancelled')
        .gte('cancelled_at', startISO(today))
        .lt('cancelled_at', startISO(tomorrow)),
    ]);
    if (openRes.error) throw openRes.error;
    if (canRes.error) throw canRes.error;

    const todays = pays.filter((p) => myDay(p.created_at) === today);
    const orders = await fetchPaidOrders(todays.filter((p) => !p.refund).map((p) => p.id));
    if (my !== reqId) return;
    render(pays, todays, orders, openRes.data, canRes.data, today);
    msg.hidden = true;
    stamp.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit' });
  } catch (err) {
    if (my !== reqId) return;
    msg.textContent = 'Could not load the dashboard: ' + err.message;
    msg.hidden = false;
  }
  if (my === reqId) wrap.classList.remove('rp-loading');
}

// ---------- show ----------
function render(pays, todays, orders, openOrders, cancelled, today) {
  const sum = (list) => list.reduce((n, p) => n + Number(p.amount), 0);
  const total = sum(todays);
  const bills = todays.filter((p) => !p.refund && p.tender_seq !== 2).length; // refunds are not bills; a cash + QR split is one bill
  const yesterday = sum(pays.filter((p) => myDay(p.created_at) === addDays(today, -1)));

  let change = null;
  if (yesterday > 0) {
    const pct = Math.round(((total - yesterday) / yesterday) * 100);
    change = { cls: pct >= 0 ? 'rp-up' : 'rp-down', text: (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '%', tail: 'vs yesterday' };
  } else {
    change = { text: 'No sales yesterday' };
  }

  stats.replaceChildren(
    tile(IC.sales, 'Sales today', rm(total), change, true),
    tile(IC.bills, 'Bills paid', String(bills), { text: bills === 1 ? '1 receipt today' : bills + ' receipts today' }),
    tile(IC.avg, 'Average per bill', rm(bills ? total / bills : 0), { text: 'Total ÷ bills' }),
    tile(IC.open, 'Open orders now', String(openOrders.length), { text: 'Not paid yet' })
  );

  // last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
  const perDay = days.map((d) => sum(pays.filter((p) => myDay(p.created_at) === d)));
  const max = Math.max(...perDay, 1);
  const chart = el('div', 'db-bars');
  days.forEach((d, i) => {
    const col = el('div', 'db-col' + (d === today ? ' is-today' : ''));
    const v = el('div', 'db-val', perDay[i] > 0 ? Math.round(perDay[i]).toLocaleString('en-MY') : '');
    const track = el('div', 'db-bar-track');
    const b = el('div', 'db-barfill');
    b.style.height = Math.max((perDay[i] / max) * 100, perDay[i] > 0 ? 3 : 0) + '%';
    track.appendChild(b);
    const wd = DAYNAMES[new Date(d + 'T00:00:00Z').getUTCDay()];
    col.append(v, track, el('div', 'db-day', d === today ? 'Today' : wd));
    chart.appendChild(col);
  });
  panel(trendPanel, 'Last 7 days (RM)', chart);

  // payment methods
  const cash = sum(todays.filter((p) => p.method === 'cash'));
  const qr = total - cash;
  const pctOf = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  panel(
    payPanel,
    'Payment methods today',
    barRow('Cash', rm(cash) + '  ·  ' + pctOf(cash) + '%', pctOf(cash), ''),
    barRow('DuitNow (QR)', rm(qr) + '  ·  ' + pctOf(qr) + '%', pctOf(qr), 'db-fill-alt')
  );

  // best sellers + order types
  const dish = new Map();
  const types = { Dine_in: { n: 0, amt: 0 }, Takeaway: { n: 0, amt: 0 } };
  orders.forEach((o) => {
    const k = o.order_type === 'table' ? 'Dine_in' : o.order_type === 'takeaway' ? 'Takeaway' : 'Dine_in';
    types[k].n += 1;
    (o.order_items || []).forEach((i) => {
      if (i.status !== 'active') return;
      dish.set(i.item_name, (dish.get(i.item_name) || 0) + i.qty);
      types[k].amt += i.qty * Number(i.unit_price);
    });
  });
  const top = Array.from(dish.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;
  const topBody = el('div', 'db-list');
  if (top.length === 0) topBody.appendChild(el('p', 'db-empty', 'No sales yet today.'));
  top.forEach(([name, qty], i) => {
    const r = el('div', 'db-rank');
    r.append(el('span', 'db-rank-n', String(i + 1)), el('span', 'db-rank-name', name), el('strong', '', '× ' + qty));
    const t = el('div', 'db-track db-track-thin');
    const f = el('div', 'db-fill');
    f.style.width = (qty / topMax) * 100 + '%';
    t.appendChild(f);
    const cell = el('div', 'db-rank-cell');
    cell.append(r, t);
    topBody.appendChild(cell);
  });
  panel(topPanel, 'Best sellers today', topBody);

  const typeBody = el('div', 'db-list');
  const typeTotal = types.Dine_in.amt + types.Takeaway.amt;
  [['Dine-in', types.Dine_in], ['Takeaway', types.Takeaway]].forEach(([label, t]) => {
    typeBody.appendChild(
      barRow(label, t.n + (t.n === 1 ? ' bill' : ' bills') + '  ·  ' + rm(t.amt), typeTotal > 0 ? Math.round((t.amt / typeTotal) * 100) : 0, label === 'Takeaway' ? 'db-fill-alt' : '')
    );
  });
  panel(typePanel, 'Dine-in / Takeaway', typeBody);

  // open orders + cancelled
  const nTable = openOrders.filter((o) => o.order_type === 'table').length;
  const nTake = openOrders.filter((o) => o.order_type === 'takeaway').length;
  const canQty = cancelled.reduce((n, i) => n + i.qty, 0);
  const canAmt = cancelled.reduce((n, i) => n + i.qty * Number(i.unit_price), 0);
  const flags = el('div', 'db-flags');
  const f1 = el('div', 'db-flag');
  f1.append(el('span', '', 'Open now'), el('strong', '', nTable + (nTable === 1 ? ' table · ' : ' tables · ') + nTake + ' takeaway'));
  const f2 = el('div', 'db-flag db-flag-bad');
  f2.append(el('span', '', 'Cancelled items today'), el('strong', '', canQty + (canQty === 1 ? ' item' : ' items') + ' · ' + rm(canAmt)));
  flags.append(f1, f2);
  panel(flagPanel, 'Watch list', flags);
}

// ---------- open / auto refresh ----------
let timer = null;
document.addEventListener('kamala:open-dashboard', () => {
  screen.hidden = false;
  load();
});
new MutationObserver(() => {
  clearInterval(timer);
  if (!screen.hidden) timer = setInterval(load, 60000);
}).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
