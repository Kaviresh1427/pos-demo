import { supabase, el, makeButton, money } from './common.js';

let reqId = 0;
let paymentTotals = { total: 0, cash: 0, qr: 0, count: 0 };
let cancelledInfo = { qty: 0, sen: 0 };
let loadedDate = '';

// ---------- date helpers (Malaysia dates) ----------
function todayMY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toSen(text) {
  const n = parseFloat(String(text).replace(/,/g, ''));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function rm(sen) {
  return money(sen / 100);
}

// ---------- build the screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'closing-screen';
screen.hidden = true;

const wrap = el('div', 'rp-wrap');
const backBtn = makeButton('Back', goHome, 'secondary');
const title = el('h2', '', 'Day-end closing');

const toolbar = el('div', 'rp-toolbar');
const dateInput = el('input', '');
dateInput.type = 'date';
const showBtn = makeButton('Show', () => load(), '');
toolbar.append(el('span', '', 'Date'), dateInput, showBtn);

const message = el('p', 'menu-message', '');
message.hidden = true;

const salesBox = el('div', '');

const cashTitle = el('h3', '', 'Cash drawer');
const openingInput = el('input', '');
openingInput.type = 'text';
openingInput.inputMode = 'decimal';
openingInput.placeholder = '0.00';
const countedInput = el('input', '');
countedInput.type = 'text';
countedInput.inputMode = 'decimal';
countedInput.placeholder = '0.00';
const noteInput = el('input', '');
noteInput.type = 'text';
noteInput.placeholder = 'Note (optional)';

function field(label, input) {
  const row = el('div', 'basket-line');
  const info = el('div', 'menu-info');
  info.appendChild(el('strong', '', label));
  const right = el('div', 'basket-qty');
  right.appendChild(input);
  row.append(info, right);
  return row;
}

const expectedLine = el('p', '', '');
const diffLine = el('p', '', '');
const savedLine = el('p', 'item-note', '');
const saveBtn = makeButton('Save closing', save, '');

wrap.append(
  backBtn,
  title,
  toolbar,
  message,
  salesBox,
  cashTitle,
  field('Opening cash (RM)', openingInput),
  field('Counted cash now (RM)', countedInput),
  field('Note', noteInput),
  expectedLine,
  diffLine,
  saveBtn,
  savedLine
);
screen.appendChild(wrap);
document.body.appendChild(screen);

// ---------- get the data ----------
async function fetchPayments(dateStr) {
  const startISO = new Date(dateStr + 'T00:00:00+08:00').toISOString();
  const endISO = new Date(addDays(dateStr, 1) + 'T00:00:00+08:00').toISOString();
  let rows = [];
  let from = 0;
  while (true) {
    const res = await supabase
      .from('payments')
      .select('amount, method, created_at')
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .order('id')
      .range(from, from + 999);
    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function fetchCancelled(dateStr) {
  const startISO = new Date(dateStr + 'T00:00:00+08:00').toISOString();
  const endISO = new Date(addDays(dateStr, 1) + 'T00:00:00+08:00').toISOString();
  let rows = [];
  let from = 0;
  while (true) {
    const res = await supabase
      .from('order_items')
      .select('qty, unit_price')
      .eq('status', 'cancelled')
      .gte('cancelled_at', startISO)
      .lt('cancelled_at', endISO)
      .order('id')
      .range(from, from + 999);
    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

// ---------- show the numbers ----------
function line(label, value) {
  const row = el('div', 'basket-line');
  const info = el('div', 'menu-info');
  info.appendChild(el('strong', '', label));
  const right = el('div', 'basket-qty');
  right.appendChild(el('span', 'menu-price', value));
  row.append(info, right);
  return row;
}

function renderSales() {
  salesBox.replaceChildren(
    el('h3', '', 'Sales'),
    line('Total sales (' + paymentTotals.count + ' payments)', rm(paymentTotals.total)),
    line('Cash sales', rm(paymentTotals.cash)),
    line('DuitNow (QR) sales', rm(paymentTotals.qr)),
    line('Cancelled items (' + cancelledInfo.qty + ')', rm(cancelledInfo.sen))
  );
}

function recalc() {
  const opening = toSen(openingInput.value);
  const counted = toSen(countedInput.value);
  const expected = opening + paymentTotals.cash;
  const diff = counted - expected;
  expectedLine.textContent = 'Expected cash in drawer: ' + rm(expected) + '  (opening + cash sales)';
  if (countedInput.value.trim() === '') {
    diffLine.textContent = 'Enter the counted cash to see the difference.';
    diffLine.className = '';
  } else if (diff === 0) {
    diffLine.textContent = 'Difference: RM 0.00 - cash is correct';
    diffLine.className = 'menu-ok';
  } else if (diff > 0) {
    diffLine.textContent = 'Difference: OVER by ' + rm(diff);
    diffLine.className = 'menu-error';
  } else {
    diffLine.textContent = 'Difference: SHORT by ' + rm(-diff);
    diffLine.className = 'menu-error';
  }
}

openingInput.addEventListener('input', recalc);
countedInput.addEventListener('input', recalc);

function say(text, isError) {
  message.textContent = text;
  message.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  message.hidden = false;
}

async function load() {
  const myReq = ++reqId;
  message.hidden = true;
  const dateStr = dateInput.value;
  if (!dateStr) {
    say('Please choose a date.', true);
    return;
  }
  try {
    const pays = await fetchPayments(dateStr);
    const cancelled = await fetchCancelled(dateStr);
    const saved = await supabase
      .from('day_closings')
      .select('opening_cash, counted_cash, note, closed_at')
      .eq('closing_date', dateStr)
      .maybeSingle();
    if (saved.error) throw saved.error;
    if (myReq !== reqId) return;

    paymentTotals = { total: 0, cash: 0, qr: 0, count: pays.length };
    pays.forEach((p) => {
      const sen = Math.round(Number(p.amount) * 100);
      paymentTotals.total += sen;
      if (p.method === 'cash') paymentTotals.cash += sen;
      else paymentTotals.qr += sen;
    });
    cancelledInfo = { qty: 0, sen: 0 };
    cancelled.forEach((c) => {
      cancelledInfo.qty += c.qty;
      cancelledInfo.sen += Math.round(Number(c.unit_price) * 100) * c.qty;
    });

    loadedDate = dateStr;
    if (saved.data) {
      openingInput.value = Number(saved.data.opening_cash).toFixed(2);
      countedInput.value = Number(saved.data.counted_cash).toFixed(2);
      noteInput.value = saved.data.note || '';
      savedLine.textContent =
        'Already saved on ' +
        new Date(saved.data.closed_at).toLocaleString('en-GB', {
          timeZone: 'Asia/Kuala_Lumpur',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }) +
        '. Saving again will update it.';
      saveBtn.textContent = 'Update closing';
    } else {
      openingInput.value = '';
      countedInput.value = '';
      noteInput.value = '';
      savedLine.textContent = 'Not closed yet for this date.';
      saveBtn.textContent = 'Save closing';
    }
    renderSales();
    recalc();
  } catch (err) {
    if (myReq !== reqId) return;
    say('Could not load: ' + err.message, true);
  }
}

async function save() {
  message.hidden = true;
  if (loadedDate !== dateInput.value) {
    say('Press Show first so the numbers match the date.', true);
    return;
  }
  if (countedInput.value.trim() === '') {
    say('Please enter the counted cash first.', true);
    return;
  }
  const s = await supabase.auth.getSession();
  const user = s.data && s.data.session ? s.data.session.user : null;
  if (!user) {
    say('Please log in again.', true);
    return;
  }
  const opening = toSen(openingInput.value);
  const counted = toSen(countedInput.value);
  const expected = opening + paymentTotals.cash;

  saveBtn.disabled = true;
  const res = await supabase.from('day_closings').upsert(
    {
      closing_date: loadedDate,
      opening_cash: opening / 100,
      expected_cash: expected / 100,
      counted_cash: counted / 100,
      difference: (counted - expected) / 100,
      total_sales: paymentTotals.total / 100,
      cash_sales: paymentTotals.cash / 100,
      qr_sales: paymentTotals.qr / 100,
      note: noteInput.value.trim() || null,
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    },
    { onConflict: 'closing_date' }
  );
  saveBtn.disabled = false;
  if (res.error) {
    say('Could not save: ' + res.error.message, true);
    return;
  }
  say('Closing saved.', false);
  load2();
}

async function load2() {
  const keep = message.textContent;
  await load();
  say(keep, false);
}

// ---------- screens and the owner-only button ----------
function goHome() {
  screen.hidden = true;
  document.getElementById('home-screen').hidden = false;
}

function openClosing() {
  document.querySelectorAll('main.screen').forEach((s) => {
    s.hidden = s !== screen;
  });
  dateInput.value = todayMY();
  load();
}

const openBtn = makeButton('Day-end closing', openClosing, '');
openBtn.hidden = true;

// wait one moment so this button lands inside the home screen list
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
