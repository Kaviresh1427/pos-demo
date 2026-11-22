// Shifts and the cash drawer:
//  - Open shift (the order pages stay locked until a shift is open, like Loyverse)
//  - Cash in / Cash out during the day
//  - Close shift: count the cash, see the difference, print the shift report
import { supabase, el, makeButton, money } from './common.js';
import { askConfirm } from './dialogs.js';
import { SHOP } from './receipt-view.js';
import { openDrawer, drawerAutoOn, setDrawerAuto } from './drawer.js';
import { shutdownNow, setCloseGuard } from './pin-login.js';

const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = 'shift.css';
document.head.appendChild(cssLink);

const TZ = 'Asia/Kuala_Lumpur';
const LOCKED_SCREENS = ['orders-screen', 'order-screen', 'payment-screen'];
const REASONS_OUT = ['Ice', 'Gas', 'Vegetables', 'Supplies', 'Staff', 'Other'];
const REASONS_IN = ['Change money', 'Owner top-up', 'Other'];

// ---------- small helpers ----------
const toSen = (text) => {
  const n = parseFloat(String(text).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
};
const sen = (v) => Math.round(Number(v || 0) * 100);
const rm = (s) => money(s / 100);
const num = (s) => (s / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { timeZone: TZ });
  const time = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return date + ' ' + time;
};
const timeOnly = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).toLowerCase();

function svg(inner, size) {
  const s = size || 26;
  return (
    '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'
  );
}
const I_CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
const I_START = '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>';
const I_SALES = '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>';
const I_SWAP = '<path d="M7 7h13l-3-3M17 17H4l3 3"/>';
const I_TOTAL = '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>';

// ---------- state ----------
let user = null;
let role = '';
let shift = null; // the open shift (row) or null
let shiftReady = false; // true once we know the answer (stays false if shifts.sql was not run yet)
let moves = [];
let totals = emptyTotals();
let lastCounted = null;
let busy = false;
let displayName = '';
let shiftError = '';
let skipLock = false; // owner chose "view reports only"

function emptyTotals() {
  return { count: 0, total: 0, cash: 0, qr: 0, gross: 0, disc: 0, round: 0, cancelQty: 0, cancelSen: 0, refund: 0, refundCash: 0, refundsReady: false };
}
const canManage = () => role === 'owner' || role === 'cashier';

// ---------- loading data ----------
async function getUser() {
  const s = await supabase.auth.getSession();
  return s.data && s.data.session ? s.data.session.user : null;
}

async function myName() {
  if (!user) return '-';
  try {
    const r = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    return (r.data && r.data.full_name) || (user.email || '-').split('@')[0];
  } catch (e) {
    return (user.email || '-').split('@')[0];
  }
}

async function pagedRows(build) {
  let rows = [];
  let from = 0;
  while (true) {
    const res = await build().range(from, from + 999);
    if (res.error) throw res.error;
    rows = rows.concat(res.data);
    if (res.data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function calcTotals(sinceISO, untilISO) {
  const payQuery = (cols) => pagedRows(() => {
    let q = supabase.from('payments').select(cols).gte('created_at', sinceISO);
    if (untilISO) q = q.lte('created_at', untilISO);
    return q.order('id');
  });
  let pays;
  try {
    pays = await payQuery('amount, method, rounding, discount, created_at, tender_seq');
  } catch (e) {
    pays = await payQuery('amount, method, rounding, discount, created_at'); // Split Bill not installed yet
  }
  // refunds in this period (the table exists only after splitbill-refund.sql was run)
  let refunds = [];
  let refundsReady = false;
  try {
    refunds = await pagedRows(() => {
      let q = supabase.from('refunds').select('amount, method, created_at').gte('created_at', sinceISO);
      if (untilISO) q = q.lte('created_at', untilISO);
      return q.order('id');
    });
    refundsReady = true;
  } catch (e) {
    refunds = [];
  }
  const canc = await pagedRows(() => {
    let q = supabase.from('order_items').select('qty, unit_price').eq('status', 'cancelled').gte('cancelled_at', sinceISO);
    if (untilISO) q = q.lte('cancelled_at', untilISO);
    return q.order('id');
  });
  const t = emptyTotals();
  pays.forEach((p) => {
    const amount = sen(p.amount);
    const rounding = sen(p.rounding);
    const disc = sen(p.discount);
    if (p.tender_seq !== 2) t.count += 1; // a cash + QR split is one receipt
    t.total += amount;
    t.round += rounding;
    t.disc += disc;
    t.gross += amount - rounding + disc;
    if (p.method === 'cash') t.cash += amount;
    else t.qr += amount;
  });
  t.refundsReady = refundsReady;
  refunds.forEach((r) => {
    const a = sen(r.amount);
    t.refund += a;
    if (r.method === 'cash') t.refundCash += a;
  });
  canc.forEach((c) => {
    t.cancelQty += c.qty;
    t.cancelSen += sen(c.unit_price) * c.qty;
  });
  return t;
}

const sumMoves = (list, kind) => list.filter((m) => m.kind === kind).reduce((a, m) => a + sen(m.amount), 0);

async function loadShiftState() {
  if (!user) {
    shift = null;
    shiftReady = false;
    return;
  }
  const r = await supabase.from('shifts').select('*').is('closed_at', null).order('id', { ascending: false }).limit(1).maybeSingle();
  if (r.error) {
    // the table does not exist yet (shifts.sql not run): do not lock anything
    shift = null;
    shiftReady = false;
    shiftError = r.error.message || 'unknown error';
    return;
  }
  shiftError = '';
  shift = r.data || null;
  shiftReady = true;
  const last = await supabase.from('shifts').select('counted_cash').not('closed_at', 'is', null).order('id', { ascending: false }).limit(1).maybeSingle();
  lastCounted = last.data && last.data.counted_cash !== null ? sen(last.data.counted_cash) : null;
}

async function loadShiftDetails() {
  if (!shift) {
    moves = [];
    totals = emptyTotals();
    return;
  }
  const m = await supabase.from('cash_movements').select('*').eq('shift_id', shift.id).order('id');
  if (m.error) throw m.error;
  moves = m.data;
  totals = await calcTotals(shift.opened_at, null);
}

// ---------- notice for the owner when shifts are not set up ----------
let noteDismissed = false;
const setupNote = el('div', 'sh-setup-note');
setupNote.hidden = true;
const setupText = el('span', '', '');
const setupX = el('button', 'sh-setup-x', '\u2715');
setupX.type = 'button';
setupX.addEventListener('click', () => {
  noteDismissed = true;
  updateLock();
});
setupNote.append(setupText, setupX);
document.body.appendChild(setupNote);

// ---------- the lock screen ----------
const lock = el('div', 'sh-lock');
lock.id = 'shift-lock';
lock.hidden = true;

function buildOpenForm(extraClass) {
  const root = el('div', 'sh-open ' + (extraClass || ''));
  const input = el('input', 'sh-input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.placeholder = '0.00';
  input.autocomplete = 'off';
  const label = el('label', 'sh-label', 'Starting cash in the drawer (RM)');
  const chipRow = el('div', 'sh-chips');
  const err = el('p', 'sh-error', '');
  err.hidden = true;
  const btn = el('button', 'sh-big', 'Open shift');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    err.hidden = true;
    if (input.value.trim() === '') {
      err.textContent = 'Please type the starting cash. Type 0 if the drawer is empty.';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    const msg = await openShift(toSen(input.value));
    btn.disabled = false;
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
  root.append(label, input, chipRow, err, btn);
  root.refresh = () => {
    chipRow.replaceChildren();
    if (lastCounted !== null && lastCounted > 0) input.dataset.npHint = 'Last shift closed with ' + rm(lastCounted);
    else delete input.dataset.npHint;
    if (lastCounted !== null && lastCounted > 0) {
      const chip = el('button', 'sh-chip', 'Same as last time: ' + rm(lastCounted));
      chip.type = 'button';
      chip.addEventListener('click', () => {
        input.value = (lastCounted / 100).toFixed(2);
      });
      chipRow.appendChild(chip);
    }
  };
  root.focusInput = () => input.focus();
  return root;
}

const lockForm = buildOpenForm();
let lockHello = null;
let lockSkip = null;
{
  const ic = el('div', 'sh-lock-icon');
  ic.innerHTML = svg(I_CLOCK, 56);
  const box = el('div', 'sh-lock-box');
  lockHello = el('p', 'sh-lock-sub', 'Open a shift to start taking orders and payments.');
  const extra = el('div', 'sh-lock-extra');
  const offBtn = el('button', 'sh-ghost', 'Shut down');
  offBtn.type = 'button';
  offBtn.addEventListener('click', () => shutdownNow());
  lockSkip = el('button', 'sh-ghost', 'View reports only');
  lockSkip.type = 'button';
  lockSkip.hidden = true;
  lockSkip.addEventListener('click', () => {
    skipLock = true;
    updateLock();
    document.dispatchEvent(new CustomEvent('kamala:open-dashboard'));
  });
  extra.append(lockSkip, offBtn);
  box.append(ic, el('h2', '', 'Shift is closed'), lockHello, lockForm, extra);
  lock.appendChild(box);
}
document.body.appendChild(lock);

function visibleScreenId() {
  const v = document.querySelector('main.screen:not([hidden])');
  return v ? v.id : '';
}

function updateLock() {
  const noShift = !!user && shiftReady && !shift;
  const onSellingPage = LOCKED_SCREENS.includes(visibleScreenId());
  const want = noShift && (!skipLock || onSellingPage);
  const full = want && !skipLock; // right after login the whole screen is covered
  lock.classList.toggle('area', want && !full);
  if (want) {
    lockForm.refresh();
    lockHello.textContent = (displayName ? 'Hello ' + displayName + '. ' : '') + 'Open a shift to start taking orders and payments.';
    const hideSkip = role !== 'owner';
    if (lockSkip.hidden !== hideSkip) lockSkip.hidden = hideSkip;
  }
  if (lock.hidden === want) lock.hidden = !want;

  // the owner sees why the shift step is missing (for example shifts.sql was not run)
  const showNote = !!user && !shiftReady && role === 'owner' && !noteDismissed;
  if (showNote) {
    const missing = /does not exist|schema cache|relation/i.test(shiftError);
    setupText.textContent = missing
      ? 'Shift is not set up yet. Run shifts.sql in Supabase (SQL Editor), then refresh.'
      : 'Shift could not load: ' + shiftError;
  }
  if (setupNote.hidden === showNote) setupNote.hidden = !showNote;
}

// ---------- open / close ----------
async function openShift(openingSen) {
  if (!user) return 'Please log in again.';
  const name = await myName();
  const r = await supabase
    .from('shifts')
    .insert({ opening_cash: openingSen / 100, opened_by: user.id, opened_by_name: name })
    .select()
    .single();
  if (r.error) {
    await loadShiftState();
    if (shift) {
      await afterChange();
      return '';
    }
    return 'Could not open the shift: ' + r.error.message;
  }
  shift = r.data;
  shiftReady = true;
  await afterChange();
  return '';
}

async function afterChange() {
  try {
    await loadShiftDetails();
  } catch (e) {
    /* shown on the page when it is opened */
  }
  updateLock();
  renderPage();
}

// ---------- the Shift page ----------
const screen = el('main', 'screen');
screen.id = 'shift-screen';
screen.hidden = true;
const wrap = el('div', 'sh-wrap');
screen.appendChild(wrap);
document.body.appendChild(screen);

const message = el('p', 'sh-message', '');
message.hidden = true;
function say(text, isError) {
  message.textContent = text;
  message.className = 'sh-message ' + (isError ? 'sh-bad' : 'sh-good');
  message.hidden = !text;
}

// status bar
const statusBar = el('div', 'sh-status');
const statusText = el('div', 'sh-status-text');
const pastBtn = el('button', 'sh-ghost', 'Past shifts');
pastBtn.type = 'button';
pastBtn.addEventListener('click', openPast);
statusBar.append(statusText, pastBtn);

// closed state: open form card
const closedBox = el('div', 'sh-panel sh-closed-card');
const pageOpenForm = buildOpenForm('sh-open-page');
closedBox.append(el('h3', '', 'Open shift'), el('p', 'sh-muted', 'No shift is open right now. Type the cash in the drawer and press Open shift.'), pageOpenForm);

// open state: tiles + two panels
const liveBox = el('div', 'sh-live');
const tilesRow = el('div', 'sh-tiles');

function tile(iconHtml, labelText) {
  const t = el('div', 'rp-tile sh-tile');
  const ic = el('div', 'rp-ic');
  ic.innerHTML = iconHtml;
  const body = el('div', 'rp-tile-body');
  const lab = el('span', 'rp-tile-label', labelText);
  const val = el('span', 'rp-tile-value', '');
  const sub = el('span', 'rp-tile-sub', '');
  body.append(lab, val, sub);
  t.append(ic, body);
  t.set = (v, s) => {
    val.textContent = v;
    sub.textContent = s || '';
  };
  return t;
}
const tStart = tile(svg(I_START), 'Starting cash');
const tCash = tile(svg(I_SALES), 'Cash sales');
const tMoves = tile(svg(I_SWAP), 'Cash in / out');
const tExpected = tile(svg(I_TOTAL), 'Expected cash');
tExpected.classList.add('rp-tile-main');
tilesRow.append(tStart, tCash, tMoves, tExpected);

const grid = el('div', 'sh-grid');

// panel 1: cash in / cash out
const movePanel = el('div', 'sh-panel sh-moves');
movePanel.append(el('h3', '', 'Cash in / Cash out'));
const moveBtns = el('div', 'sh-move-btns');
const inBtn = el('button', 'sh-kind sh-kind-in', '+ Cash in');
inBtn.type = 'button';
const outBtn = el('button', 'sh-kind sh-kind-out', '− Cash out');
outBtn.type = 'button';
moveBtns.append(inBtn, outBtn);

const moveForm = el('div', 'sh-move-form');
moveForm.hidden = true;
const moveTitle = el('strong', 'sh-move-title', '');
const amtInput = el('input', 'sh-input');
amtInput.type = 'text';
amtInput.inputMode = 'decimal';
amtInput.placeholder = 'Amount (RM)';
amtInput.autocomplete = 'off';
const reasonRow = el('div', 'sh-chips');
const noteInput = el('input', 'sh-input sh-input-small');
noteInput.type = 'text';
noteInput.placeholder = 'Note (optional)';
noteInput.autocomplete = 'off';
const formBtns = el('div', 'sh-form-btns');
const saveMoveBtn = el('button', 'sh-big sh-small', 'Save');
saveMoveBtn.type = 'button';
const cancelMoveBtn = el('button', 'sh-ghost', 'Cancel');
cancelMoveBtn.type = 'button';
formBtns.append(saveMoveBtn, cancelMoveBtn);
moveForm.append(moveTitle, amtInput, reasonRow, noteInput, formBtns);

const moveList = el('div', 'sh-list');
movePanel.append(moveBtns, moveForm, moveList);

let moveKind = 'out';
let moveReason = '';

function openMoveForm(kind) {
  moveKind = kind;
  moveReason = '';
  moveTitle.textContent = kind === 'in' ? 'Cash IN (money added to the drawer)' : 'Cash OUT (money taken from the drawer)';
  moveForm.className = 'sh-move-form sh-form-' + kind;
  amtInput.value = '';
  noteInput.value = '';
  reasonRow.replaceChildren();
  (kind === 'in' ? REASONS_IN : REASONS_OUT).forEach((r) => {
    const c = el('button', 'sh-chip', r);
    c.type = 'button';
    c.addEventListener('click', () => {
      moveReason = r;
      Array.from(reasonRow.children).forEach((x) => x.classList.toggle('on', x === c));
    });
    reasonRow.appendChild(c);
  });
  moveForm.hidden = false;
  amtInput.focus();
}
inBtn.addEventListener('click', () => openMoveForm('in'));
outBtn.addEventListener('click', () => openMoveForm('out'));
cancelMoveBtn.addEventListener('click', () => {
  moveForm.hidden = true;
});
amtInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveMoveBtn.click();
});

saveMoveBtn.addEventListener('click', async () => {
  say('', false);
  const amount = toSen(amtInput.value);
  if (!amount) {
    say('Please type the amount.', true);
    return;
  }
  if (!moveReason) {
    say('Please tap a reason.', true);
    return;
  }
  if (!shift) return;
  saveMoveBtn.disabled = true;
  const name = await myName();
  const r = await supabase.from('cash_movements').insert({
    shift_id: shift.id,
    kind: moveKind,
    amount: amount / 100,
    reason: moveReason,
    note: noteInput.value.trim() || null,
    created_by: user.id,
    created_by_name: name,
  });
  saveMoveBtn.disabled = false;
  if (r.error) {
    say('Could not save: ' + r.error.message, true);
    return;
  }
  moveForm.hidden = true;
  await refreshAll();
  say((moveKind === 'in' ? 'Cash in' : 'Cash out') + ' of ' + rm(amount) + ' saved.', false);
});

// panel 2: close shift
const closePanel = el('div', 'sh-panel sh-close');
closePanel.append(el('h3', '', 'Close shift'));
const countedInput = el('input', 'sh-input');
countedInput.type = 'text';
countedInput.inputMode = 'decimal';
countedInput.placeholder = '0.00';
countedInput.autocomplete = 'off';
const closeNote = el('input', 'sh-input sh-input-small');
closeNote.type = 'text';
closeNote.placeholder = 'Note (optional)';
closeNote.autocomplete = 'off';
const expectedLine = el('p', 'sh-expected', '');
const diffLine = el('p', 'sh-diff', '');
const closeBtn = el('button', 'sh-big sh-danger', 'Close shift and print report');
closeBtn.type = 'button';
closeBtn.addEventListener('click', closeShift);
closePanel.append(
  el('label', 'sh-label', 'Count the cash in the drawer now (RM)'),
  countedInput,
  expectedLine,
  diffLine,
  closeNote,
  closeBtn
);

grid.append(movePanel, closePanel);
liveBox.append(tilesRow, grid);

const readOnlyNote = el('p', 'sh-muted', 'Only the owner or cashier can manage the cash drawer.');
// cash drawer settings (this computer only)
const drawerCard = el('div', 'sh-panel sh-drawer');
const drawerTitle = el('div', 'sh-drawer-text');
drawerTitle.append(el('strong', '', 'Cash drawer'), el('span', 'sh-muted', 'Opens through the receipt printer. Settings here apply to this computer only.'));
const autoLabel = el('label', 'sh-switch');
const autoBox = document.createElement('input');
autoBox.type = 'checkbox';
autoBox.checked = drawerAutoOn();
autoBox.addEventListener('change', () => setDrawerAuto(autoBox.checked));
autoLabel.append(autoBox, el('span', '', 'Open automatically on cash payment'));
const testDrawerBtn = el('button', 'sh-ghost', 'Test drawer');
testDrawerBtn.type = 'button';
testDrawerBtn.addEventListener('click', openDrawer);
drawerCard.append(drawerTitle, autoLabel, testDrawerBtn);

wrap.append(statusBar, message, closedBox, liveBox, readOnlyNote, drawerCard);

function expectedSen() {
  if (!shift) return 0;
  return sen(shift.opening_cash) + totals.cash - totals.refundCash + sumMoves(moves, 'in') - sumMoves(moves, 'out');
}

function recalc() {
  if (!shift) return;
  const exp = expectedSen();
  expectedLine.textContent = 'Expected cash in drawer: ' + rm(exp);
  countedInput.dataset.npHint = 'Expected cash in drawer: ' + rm(exp);
  amtInput.dataset.npHint = 'Expected cash in drawer: ' + rm(exp);
  if (countedInput.value.trim() === '') {
    diffLine.textContent = 'Type the counted cash to see the difference.';
    diffLine.className = 'sh-diff';
    return;
  }
  const diff = toSen(countedInput.value) - exp;
  if (diff === 0) {
    diffLine.textContent = 'Difference: RM 0.00 (cash is correct)';
    diffLine.className = 'sh-diff sh-good';
  } else if (diff > 0) {
    diffLine.textContent = 'Difference: OVER by ' + rm(diff);
    diffLine.className = 'sh-diff sh-bad';
  } else {
    diffLine.textContent = 'Difference: SHORT by ' + rm(-diff);
    diffLine.className = 'sh-diff sh-bad';
  }
}
countedInput.addEventListener('input', recalc);
countedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') closeBtn.click();
});

function renderMoves() {
  moveList.replaceChildren();
  if (!moves.length) {
    moveList.appendChild(el('p', 'sh-muted sh-empty', 'No cash in or out yet in this shift.'));
    return;
  }
  moves
    .slice()
    .reverse()
    .forEach((m) => {
      const row = el('div', 'sh-row');
      row.appendChild(el('span', 'sh-time', timeOnly(m.created_at)));
      const mid = el('span', 'sh-reason', m.reason + (m.note ? ' – ' + m.note : ''));
      const amt = el('span', 'sh-amt ' + (m.kind === 'in' ? 'sh-good' : 'sh-bad'), (m.kind === 'in' ? '+ ' : '− ') + num(sen(m.amount)));
      row.append(mid, amt);
      if (role === 'owner') {
        const del = el('button', 'sh-x', '✕');
        del.type = 'button';
        del.title = 'Remove this entry';
        del.addEventListener('click', async () => {
          const ok = await askConfirm({ title: 'Remove this entry?', message: m.reason + ' ' + rm(sen(m.amount)), okText: 'Remove', cancelText: 'Keep', danger: true });
          if (!ok) return;
          const r = await supabase.from('cash_movements').delete().eq('id', m.id);
          if (r.error) {
            say('Could not remove: ' + r.error.message, true);
            return;
          }
          await refreshAll();
        });
        row.appendChild(del);
      }
      moveList.appendChild(row);
    });
}

function renderPage() {
  const unavailable = !shiftReady;
  const hasShift = shiftReady && !!shift;
  closedBox.hidden = !(shiftReady && !shift);
  liveBox.hidden = !hasShift;
  readOnlyNote.hidden = canManage() || !hasShift;
  pastBtn.hidden = !canManage();

  statusText.replaceChildren();
  const dot = el('span', 'sh-dot' + (hasShift ? ' on' : ''));
  statusText.appendChild(dot);
  if (unavailable) {
    statusText.appendChild(el('span', '', 'Shift is not set up yet. Run shifts.sql in Supabase first.'));
  } else if (hasShift) {
    statusText.appendChild(el('strong', '', 'Shift #' + shift.id + ' is open'));
    statusText.appendChild(el('span', 'sh-muted', ' since ' + when(shift.opened_at) + ' by ' + (shift.opened_by_name || '-')));
  } else {
    statusText.appendChild(el('strong', '', 'No shift is open'));
  }

  pageOpenForm.refresh();

  if (hasShift) {
    const inSen = sumMoves(moves, 'in');
    const outSen = sumMoves(moves, 'out');
    tStart.set(rm(sen(shift.opening_cash)), 'At opening');
    tCash.set(rm(totals.cash), totals.count + ' payments' + (totals.refundCash > 0 ? ' \u00b7 Refunds -' + num(totals.refundCash) : ''));
    tMoves.set(rm(inSen - outSen), 'In ' + num(inSen) + ' \u00b7 Out ' + num(outSen));
    tExpected.set(rm(expectedSen()), 'Should be in the drawer');
    const manage = canManage();
    moveBtns.hidden = !manage;
    closePanel.hidden = !manage;
    if (!manage) moveForm.hidden = true;
    renderMoves();
    recalc();
  }
}

async function refreshAll() {
  try {
    await loadShiftState();
    await loadShiftDetails();
  } catch (e) {
    say('Could not load: ' + e.message, true);
  }
  updateLock();
  renderPage();
}

// ---------- closing ----------
async function closeShift() {
  say('', false);
  if (!shift || busy) return;
  if (countedInput.value.trim() === '') {
    say('Please count the cash and type it in first.', true);
    return;
  }
  const open = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'open');
  if (!open.error && open.count > 0) {
    const ok = await askConfirm({
      title: 'Orders are still open',
      message: open.count + ' order(s) are not paid yet. Close the shift anyway?',
      okText: 'Close shift',
      cancelText: 'Go back',
      danger: true,
    });
    if (!ok) return;
  }
  busy = true;
  closeBtn.disabled = true;
  try {
    const closedAt = new Date().toISOString();
    const t = await calcTotals(shift.opened_at, closedAt);
    const mv = await supabase.from('cash_movements').select('*').eq('shift_id', shift.id).order('id');
    if (mv.error) throw mv.error;
    const inSen = sumMoves(mv.data, 'in');
    const outSen = sumMoves(mv.data, 'out');
    const expected = sen(shift.opening_cash) + t.cash - t.refundCash + inSen - outSen;
    const counted = toSen(countedInput.value);
    const name = await myName();
    const upd = await supabase
      .from('shifts')
      .update({
        closed_at: closedAt,
        closed_by: user.id,
        closed_by_name: name,
        counted_cash: counted / 100,
        expected_cash: expected / 100,
        difference: (counted - expected) / 100,
        cash_sales: t.cash / 100,
        qr_sales: t.qr / 100,
        total_sales: (t.total - t.refund) / 100,
        ...(t.refundsReady ? { refunds: t.refund / 100, refunds_cash: t.refundCash / 100 } : {}),
        gross_sales: t.gross / 100,
        discounts: t.disc / 100,
        rounding: t.round / 100,
        cash_in: inSen / 100,
        cash_out: outSen / 100,
        cancelled_qty: t.cancelQty,
        cancelled_amount: t.cancelSen / 100,
        payments_count: t.count,
        note: closeNote.value.trim() || null,
      })
      .eq('id', shift.id)
      .is('closed_at', null)
      .select()
      .single();
    if (upd.error) throw upd.error;
    const closedRow = upd.data;
    const closedMoves = mv.data;
    countedInput.value = '';
    closeNote.value = '';
    shift = null;
    skipLock = false;
    moves = [];
    totals = emptyTotals();
    lastCounted = counted;
    updateLock();
    renderPage();
    showClosedDialog(closedRow, closedMoves);
  } catch (e) {
    say('Could not close the shift: ' + e.message, true);
  }
  busy = false;
  closeBtn.disabled = false;
}

// ---------- pop-ups ----------
function modal(contentBuilder) {
  const back = el('div', 'sh-modal');
  const box = el('div', 'sh-modal-box');
  back.appendChild(box);
  const close = () => back.remove();
  contentBuilder(box, close);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  document.body.appendChild(back);
  return close;
}

function showClosedDialog(row, mv) {
  modal((box, close) => {
    const diff = sen(row.difference);
    box.append(
      el('h3', '', 'Shift #' + row.id + ' closed'),
      el('p', 'sh-muted', 'Expected ' + rm(sen(row.expected_cash)) + ', counted ' + rm(sen(row.counted_cash))),
      el('p', 'sh-diff ' + (diff === 0 ? 'sh-good' : 'sh-bad'), diff === 0 ? 'Difference: RM 0.00 (cash is correct)' : diff > 0 ? 'OVER by ' + rm(diff) : 'SHORT by ' + rm(-diff))
    );
    const btns = el('div', 'sh-form-btns');
    const pr = el('button', 'sh-big sh-small', 'Print report');
    pr.type = 'button';
    pr.addEventListener('click', () => printReport(row, mv));
    const done = el('button', 'sh-ghost', 'Done');
    done.type = 'button';
    done.addEventListener('click', close);
    btns.append(pr, done);
    box.appendChild(btns);
  });
}

async function openPast() {
  const r = await supabase.from('shifts').select('*').not('closed_at', 'is', null).order('id', { ascending: false }).limit(20);
  modal((box, close) => {
    box.classList.add('sh-modal-wide');
    box.appendChild(el('h3', '', 'Past shifts'));
    const list = el('div', 'sh-list sh-past');
    if (r.error) {
      list.appendChild(el('p', 'sh-bad', 'Could not load: ' + r.error.message));
    } else if (!r.data.length) {
      list.appendChild(el('p', 'sh-muted', 'No closed shifts yet.'));
    } else {
      r.data.forEach((s) => {
        const row = el('div', 'sh-row sh-past-row');
        const left = el('div', 'sh-past-info');
        left.append(
          el('strong', '', '#' + s.id + '  ' + when(s.opened_at) + ' – ' + timeOnly(s.closed_at)),
          el('span', 'sh-muted', 'Sales ' + rm(sen(s.total_sales)) + '  •  Cash difference ' + rm(sen(s.difference)))
        );
        const b = el('button', 'sh-ghost', 'Print');
        b.type = 'button';
        b.addEventListener('click', async () => {
          const m = await supabase.from('cash_movements').select('*').eq('shift_id', s.id).order('id');
          printReport(s, m.data || []);
        });
        row.append(left, b);
        list.appendChild(row);
      });
    }
    const x = el('button', 'sh-ghost', 'Close');
    x.type = 'button';
    x.addEventListener('click', close);
    box.append(list, x);
  });
}

// ---------- the printed shift report (80 mm) ----------
function printReport(row, mv) {
  const rep = el('div', 'shiftrpt');
  const line = (a, b, cls) => {
    const r = el('div', 'sr-line' + (cls ? ' ' + cls : ''));
    r.append(el('span', '', a), el('span', '', b));
    return r;
  };
  const head = (t) => el('div', 'sr-head', t);

  rep.append(el('div', 'sr-shop', SHOP.name || 'Demo Restaurant'), el('div', 'sr-title', 'Shift report'));
  rep.append(line('Shift number', String(row.id)), line('Store', SHOP.name || 'Demo Restaurant'));
  rep.append(head('Shift opened'), line(row.opened_by_name || '-', when(row.opened_at)));
  rep.append(head('Shift closed'), line(row.closed_by_name || '-', when(row.closed_at)));

  rep.append(head('Cash drawer (RM)'));
  rep.append(
    line('Starting cash', num(sen(row.opening_cash))),
    line('Cash payments', num(sen(row.cash_sales))),
    ...(sen(row.refunds_cash) > 0 ? [line('Cash refunds', '-' + num(sen(row.refunds_cash)))] : []),
    line('Paid in', num(sen(row.cash_in))),
    line('Paid out', num(sen(row.cash_out))),
    line('Expected cash amount', num(sen(row.expected_cash)), 'sr-bold'),
    line('Actual cash amount', num(sen(row.counted_cash)), 'sr-bold'),
    line('Difference', num(sen(row.difference)), 'sr-bold')
  );

  rep.append(head('Sales summary (RM)'));
  rep.append(
    line('Gross sales', num(sen(row.gross_sales))),
    line('Discounts', num(sen(row.discounts))),
    line('Rounding', num(sen(row.rounding))),
    ...(sen(row.refunds) > 0 ? [line('Refunds', '-' + num(sen(row.refunds)))] : []),
    line('Net sales', num(sen(row.total_sales)), 'sr-bold'),
    line('Cash', num(sen(row.cash_sales) - sen(row.refunds_cash))),
    line('DuitNow (QR)', num(sen(row.qr_sales) - (sen(row.refunds) - sen(row.refunds_cash)))),
    line('Payments', String(row.payments_count || 0)),
    line('Cancelled items (' + (row.cancelled_qty || 0) + ')', num(sen(row.cancelled_amount)))
  );

  if (mv && mv.length) {
    rep.append(head('Cash in / out'));
    mv.forEach((m) => {
      rep.append(line(timeOnly(m.created_at) + ' ' + m.reason, (m.kind === 'in' ? '+' : '-') + num(sen(m.amount))));
    });
  }
  if (row.note) rep.append(head('Note'), el('div', 'sr-note', row.note));
  rep.append(el('div', 'sr-foot', 'Printed ' + when(new Date().toISOString())));

  let box = document.getElementById('receipt');
  if (!box) {
    box = document.createElement('div');
    box.id = 'receipt';
    document.body.appendChild(box);
  }
  box.replaceChildren(rep);
  window.print();
}

// ---------- start-up, menu and events ----------
function openPage() {
  document.querySelectorAll('main.screen').forEach((s) => {
    s.hidden = s !== screen;
  });
  say('', false);
  refreshAll();
}
document.addEventListener('kamala:open-shift', openPage);

async function onAuth() {
  const before = user ? user.id : null;
  user = await getUser();
  if (!user) {
    role = '';
    displayName = '';
    skipLock = false;
    shift = null;
    shiftReady = false;
    updateLock();
    return;
  }
  if (before !== user.id) skipLock = false;
  const p = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
  role = p.data && p.data.role ? p.data.role : '';
  displayName = (p.data && p.data.full_name) || '';
  await refreshAll();
  document.dispatchEvent(new CustomEvent('kamala:shift-checked'));
}

// used by the Shutdown button: is a shift still open? (asks the database fresh)
export async function checkShiftOpen() {
  if (!user) return false;
  await loadShiftState();
  return shiftReady && !!shift;
}
setCloseGuard(() => !!shift);

supabase.auth.onAuthStateChange(() => {
  setTimeout(onAuth, 0);
});
onAuth();

// lock / unlock when the page changes
new MutationObserver(updateLock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

// another device may open or close the shift: check again now and then
setInterval(async () => {
  if (!user) return;
  const before = shift ? shift.id : null;
  await loadShiftState();
  const after = shift ? shift.id : null;
  if (before !== after) await refreshAll();
  else updateLock();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && user) refreshAll();
});
