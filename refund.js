// Refund: give money back after a payment (full or part). Owner and cashier only.
// The database function refund_payment() (see splitbill-refund.sql) saves it, with the reason and who did it.
import { supabase, el, money } from './common.js';
import { openDrawer } from './drawer.js';
import { checkShiftOpen } from './shift.js';
import './numpad.js';

if (!document.getElementById('split-bill-css')) {
  const link = document.createElement('link');
  link.id = 'split-bill-css';
  link.rel = 'stylesheet';
  link.href = 'split-bill.css';
  document.head.appendChild(link);
}

const sen = (v) => Math.round(Number(v || 0) * 100);
const fromSen = (c) => money(c / 100);
const REASONS = ['Wrong item', 'Customer complaint', 'Overcharged', 'Food quality', 'Other'];

let readyCache = null;
export async function refundReady() {
  if (readyCache) return true;
  const r = await supabase.from('refunds').select('id').limit(1);
  if (!r.error) readyCache = true;
  return !r.error;
}

export async function canRefund() {
  try {
    const s = await supabase.auth.getSession();
    const u = s.data && s.data.session ? s.data.session.user : null;
    if (!u) return false;
    const p = await supabase.from('profiles').select('role').eq('id', u.id).maybeSingle();
    return !!p.data && (p.data.role === 'owner' || p.data.role === 'cashier');
  } catch (e) {
    return false;
  }
}

// how much was paid and how much is already refunded for one receipt (a split payment counts as one)
export async function refundInfo(paymentId) {
  const base = 'id, receipt_no, amount, method';
  let pay = await supabase.from('payments').select(base + ', group_receipt').eq('id', paymentId).single();
  if (pay.error) pay = await supabase.from('payments').select(base).eq('id', paymentId).single();
  if (pay.error) return { error: pay.error.message };
  const p = pay.data;
  let rows = [p];
  if (p.group_receipt) {
    const g = await supabase.from('payments').select(base).eq('group_receipt', p.group_receipt).order('id');
    if (!g.error && g.data.length) rows = g.data;
  }
  const primary = rows[0];
  const paid = rows.reduce((n, r) => n + sen(r.amount), 0);
  const ref = await supabase.from('refunds').select('amount, method, reason, refunded_by_name, created_at').eq('payment_id', primary.id).order('created_at');
  const list = ref.error ? [] : ref.data;
  const refunded = list.reduce((n, r) => n + sen(r.amount), 0);
  return { primaryId: primary.id, receiptNo: primary.receipt_no, paid, refunded, left: paid - refunded, list, rows };
}

export async function openRefund(paymentId, opts) {
  const onDone = opts && opts.onDone;
  const back = el('div', 'sb-back');
  const modal = el('div', 'sb-modal sb-narrow');
  modal.setAttribute('role', 'dialog');
  back.appendChild(modal);
  document.body.appendChild(back);

  let changed = false;
  let busy = false;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (changed && onDone) onDone();
  };
  function onKey(e) {
    if (e.key !== 'Escape' || busy) return;
    if (document.querySelector('.np-back:not([hidden])')) return;
    e.preventDefault();
    close();
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back && !busy) close();
  });

  function shell(titleText, subText) {
    modal.replaceChildren();
    const head = el('div', 'sb-head');
    const t = el('div', 'sb-titles');
    t.append(el('h3', '', titleText), el('p', '', subText || ''));
    const x = el('button', 'sb-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', () => !busy && close());
    head.append(t, x);
    modal.appendChild(head);
  }

  function notice(text, isBad) {
    shell('Refund', '');
    modal.appendChild(el('p', 'sb-empty' + (isBad ? ' sb-bad' : ''), text));
    const f = el('div', 'sb-foot');
    const b = el('button', 'sb-btn', 'Close');
    b.type = 'button';
    b.addEventListener('click', close);
    f.appendChild(b);
    modal.appendChild(f);
  }

  shell('Refund', 'Loading...');
  if (!(await refundReady())) return notice('Refund is not installed yet. Run splitbill-refund.sql in Supabase first.', true);
  if (!(await canRefund())) return notice('Only the owner or a cashier can give a refund.', true);
  const info = await refundInfo(paymentId);
  if (info.error) return notice('Could not load the receipt: ' + info.error, true);
  if (info.left <= 0) return notice('This receipt is already fully refunded.');

  let method = 'cash';
  let reason = '';
  let armed = false;

  shell('Refund', 'Receipt ' + info.receiptNo);
  const stats = el('div', 'sb-strip rf-stats');
  [['Paid', fromSen(info.paid), ''], ['Refunded', fromSen(info.refunded), 'sb-paid'], ['Can refund', fromSen(info.left), 'sb-left']].forEach(([k, v, c]) => {
    const t = el('div', 'sb-tile ' + c);
    t.append(el('span', '', k), el('strong', '', v));
    stats.appendChild(t);
  });
  modal.appendChild(stats);

  const form = el('div', 'rf-form');
  form.appendChild(el('label', 'sb-lab', 'Refund amount'));
  const mw = el('div', 'sb-money');
  mw.appendChild(el('span', 'sb-rm', 'RM'));
  const amt = document.createElement('input');
  amt.type = 'text';
  amt.value = (info.left / 100).toFixed(2);
  amt.autocomplete = 'off';
  amt.dataset.numpad = 'money';
  amt.dataset.npTitle = 'Refund amount';
  amt.dataset.npFresh = '1';
  amt.dataset.npHint = 'Most you can refund: ' + fromSen(info.left);
  mw.appendChild(amt);
  form.appendChild(mw);

  form.appendChild(el('label', 'sb-lab', 'Give the money back by'));
  const methods = el('div', 'rf-methods');
  const mBtns = {};
  [['cash', 'Cash from drawer'], ['duitnow', 'DuitNow transfer']].forEach(([k, t]) => {
    const b = el('button', 'sb-method' + (method === k ? ' on' : ''), t);
    b.type = 'button';
    b.addEventListener('click', () => {
      method = k;
      Object.keys(mBtns).forEach((n) => mBtns[n].classList.toggle('on', n === k));
    });
    mBtns[k] = b;
    methods.appendChild(b);
  });
  form.appendChild(methods);

  form.appendChild(el('label', 'sb-lab', 'Reason (required)'));
  const chips = el('div', 'rf-reasons');
  const reasonInp = document.createElement('input');
  reasonInp.type = 'text';
  reasonInp.className = 'rf-text';
  reasonInp.placeholder = 'Type the reason';
  reasonInp.dataset.kbd = 'off';
  reasonInp.maxLength = 120;
  const chipBtns = [];
  REASONS.forEach((r) => {
    const c = el('button', 'rf-chip', r);
    c.type = 'button';
    c.addEventListener('click', () => {
      reason = r === 'Other' ? '' : r;
      reasonInp.value = reason;
      chipBtns.forEach((b) => b.classList.toggle('on', b === c));
      if (r === 'Other') reasonInp.focus();
      disarm();
    });
    chipBtns.push(c);
    chips.appendChild(c);
  });
  form.append(chips, reasonInp);

  const msg = el('p', 'sb-msg');
  msg.hidden = true;
  const go = el('button', 'sb-paybtn rf-danger', 'Refund');
  go.type = 'button';
  form.append(msg, go);
  modal.appendChild(form);

  function say(t) {
    msg.textContent = t;
    msg.hidden = !t;
  }
  function disarm() {
    armed = false;
    go.textContent = 'Refund ' + fromSen(Math.round(parseFloat(amt.value || '0') * 100) || 0);
  }
  amt.addEventListener('input', disarm);
  amt.addEventListener('change', disarm);
  reasonInp.addEventListener('input', () => {
    reason = reasonInp.value;
    chipBtns.forEach((b) => b.classList.remove('on'));
    disarm();
  });
  disarm();

  go.addEventListener('click', async () => {
    if (busy) return;
    say('');
    const cents = Math.round(parseFloat(amt.value || '0') * 100) || 0;
    const why = reasonInp.value.trim();
    if (cents <= 0) return say('Type the refund amount.');
    if (cents > info.left) return say('The most you can refund is ' + fromSen(info.left) + '.');
    if (!why) return say('Please give a reason.');
    if (method === 'cash' && !(await checkShiftOpen())) return say('Open a shift first. A cash refund comes out of the drawer.');
    if (!armed) {
      armed = true;
      go.textContent = 'Tap again to confirm ' + fromSen(cents);
      return;
    }
    busy = true;
    go.disabled = true;
    go.textContent = 'Saving...';
    const r = await supabase.rpc('refund_payment', { p_payment_id: info.primaryId, p_amount: cents / 100, p_method: method, p_reason: why });
    busy = false;
    go.disabled = false;
    if (r.error) {
      armed = false;
      disarm();
      return say('Could not refund: ' + r.error.message);
    }
    changed = true;
    if (method === 'cash') setTimeout(openDrawer, 300);
    shell('Refund done', 'Receipt ' + info.receiptNo);
    const ok = el('div', 'sb-success');
    ok.append(el('div', 'sb-tick', '✓'), el('h4', '', fromSen(cents) + ' refunded'), el('p', 'sb-rcpt', (method === 'cash' ? 'Cash from the drawer' : 'DuitNow transfer') + '  |  ' + why));
    const f = el('div', 'sb-foot');
    const done = el('button', 'sb-btn sb-primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', close);
    f.appendChild(done);
    ok.appendChild(f);
    modal.appendChild(ok);
  });
}
