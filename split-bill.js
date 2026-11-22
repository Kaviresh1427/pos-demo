// Split Bill: one table pays in several parts (by items, equal share, or any amount).
// Each part can be paid with Cash, DuitNow, or both together. The database function
// pay_part() (see splitbill-refund.sql) does the saving, so the totals stay correct.
import { supabase, el, makeButton, money } from './common.js';
import { printReceipt } from './receipt.js';
import { drawerAfterCashPayment } from './drawer.js';
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

// 5-sen rounding (same rule as the payment page and the database)
function roundAdjust(cents) {
  const adjust = { 1: -1, 2: -2, 3: 2, 4: 1, 6: -1, 7: -2, 8: 2, 9: 1 };
  return adjust[cents % 10] || 0;
}

// Is the database part installed (splitbill-refund.sql was run)?
let readyCache = null;
export async function splitReady() {
  if (readyCache) return true;
  const r = await supabase.from('orders').select('paid_subtotal').limit(1);
  if (!r.error) readyCache = true;
  return !r.error;
}

function icon(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path;
  return s;
}
const X_ICON = '<path d="M6 6l12 12M18 6L6 18"/>';

function moneyInput(title, hint) {
  const wrap = el('div', 'sb-money');
  wrap.append(el('span', 'sb-rm', 'RM'));
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = '0.00';
  inp.autocomplete = 'off';
  inp.dataset.numpad = 'money';
  inp.dataset.npTitle = title;
  if (hint) inp.dataset.npHint = hint;
  wrap.appendChild(inp);
  return { wrap, inp };
}
const readSen = (inp) => Math.round(parseFloat(inp.value || '0') * 100) || 0;

export async function openSplitBill({ orderId, label, roundingOn = true, onDone }) {
  let order = null; // fresh copy from the database
  let tab = 'items'; // items | equal | amount
  let picks = new Map(); // order_items.id -> qty chosen
  let people = 2;
  let method = 'cash'; // cash | duitnow | mixed
  let busy = false;
  let paidSomething = false;
  let lastResult = null;
  let sepCash = true; // mixed: the "cash received" box follows the cash amount until the cashier changes it

  const back = el('div', 'sb-back');
  const modal = el('div', 'sb-modal');
  modal.setAttribute('role', 'dialog');
  back.appendChild(modal);
  document.body.appendChild(back);

  function close() {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (paidSomething && onDone) onDone();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.np-back:not([hidden])')) return; // the number pad handles Esc itself
    e.preventDefault();
    close();
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back && !busy) close();
  });

  // ---------- loading ----------
  async function load() {
    const r = await supabase
      .from('orders')
      .select('id, order_type, table_no, platform_order_no, status, paid_subtotal, order_items(id, item_name, unit_price, qty, status, serve_type, note, paid_part_id)')
      .eq('id', orderId)
      .single();
    if (r.error) return r.error.message;
    const o = r.data;
    const items = o.order_items
      .filter((i) => i.status === 'active')
      .map((i) => ({ id: i.id, name: i.item_name, unit: sen(i.unit_price), qty: i.qty, serve: i.serve_type, note: i.note || '', paid: i.paid_part_id !== null && i.paid_part_id !== undefined }));
    const total = items.reduce((n, i) => n + i.unit * i.qty, 0);
    order = { status: o.status, items, total, paid: sen(o.paid_subtotal) };
    order.remaining = Math.max(0, total - order.paid);
    // drop picks that are no longer possible
    picks.forEach((q, id) => {
      const it = items.find((i) => i.id === id && !i.paid);
      if (!it) picks.delete(id);
      else if (q > it.qty) picks.set(id, it.qty);
    });
    if (people > 1 && order.remaining === 0) people = 1;
    return null;
  }

  // ---------- the share ----------
  let amountInp = null; // the custom amount box (kept between redraws)
  function shareSen() {
    if (!order) return 0;
    if (tab === 'items') {
      let n = 0;
      picks.forEach((q, id) => {
        const it = order.items.find((i) => i.id === id);
        if (it) n += it.unit * q;
      });
      return n;
    }
    if (tab === 'equal') return people <= 1 ? order.remaining : Math.round(order.remaining / people);
    return amountInp ? Math.min(readSen(amountInp), order.remaining + 1) : 0;
  }
  function shareLabel() {
    if (tab === 'equal') return 'Equal share (' + people + ')';
    if (tab === 'amount') return 'Custom amount';
    return 'By items';
  }

  // ---------- drawing ----------
  let els = {};

  function draw() {
    modal.replaceChildren();
    els = {};

    // head
    const head = el('div', 'sb-head');
    const titles = el('div', 'sb-titles');
    titles.append(el('h3', '', 'Split bill'), el('p', '', label || ''));
    const x = el('button', 'sb-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.appendChild(icon(X_ICON));
    x.addEventListener('click', () => !busy && close());
    head.append(titles, x);
    modal.appendChild(head);

    if (!order) {
      modal.appendChild(el('p', 'sb-empty', 'Loading...'));
      return;
    }

    // summary strip
    const strip = el('div', 'sb-strip');
    [['Bill total', fromSen(order.total), ''], ['Paid so far', fromSen(order.paid), 'sb-paid'], ['Left to pay', fromSen(order.remaining), 'sb-left']].forEach(([k, v, c]) => {
      const t = el('div', 'sb-tile ' + c);
      t.append(el('span', '', k), el('strong', '', v));
      strip.appendChild(t);
    });
    modal.appendChild(strip);

    if (lastResult) {
      drawSuccess();
      return;
    }
    if (order.status !== 'open' || order.remaining <= 0) {
      const p = el('p', 'sb-empty', order.status !== 'open' ? 'This bill is already closed.' : 'Nothing is left to pay on this bill.');
      modal.appendChild(p);
      const f = el('div', 'sb-foot');
      f.appendChild(makeButton('Close', close, 'sb-btn'));
      modal.appendChild(f);
      return;
    }

    const cols = el('div', 'sb-cols');
    const leftCol = el('div', 'sb-left-col');
    const rightCol = el('div', 'sb-right-col');
    cols.append(leftCol, rightCol);
    modal.appendChild(cols);

    // tabs
    const tabs = el('div', 'sb-tabs');
    [['items', 'By items'], ['equal', 'Equal split'], ['amount', 'Custom amount']].forEach(([k, t]) => {
      const b = el('button', 'sb-tab' + (tab === k ? ' on' : ''), t);
      b.type = 'button';
      b.addEventListener('click', () => {
        tab = k;
        draw();
      });
      tabs.appendChild(b);
    });
    leftCol.appendChild(tabs);

    const body = el('div', 'sb-body');
    leftCol.appendChild(body);
    if (tab === 'items') drawItems(body);
    else if (tab === 'equal') drawEqual(body);
    else drawAmount(body);

    drawPay(rightCol);
    refresh();
  }

  function drawItems(body) {
    const unpaid = order.items.filter((i) => !i.paid);
    const bar = el('div', 'sb-itembar');
    bar.appendChild(el('span', '', 'Tap + for the items this person pays for'));
    const allBtn = el('button', 'sb-link', 'Select all');
    allBtn.type = 'button';
    allBtn.addEventListener('click', () => {
      const every = unpaid.every((i) => picks.get(i.id) === i.qty);
      picks = new Map();
      if (!every) unpaid.forEach((i) => picks.set(i.id, i.qty));
      draw();
    });
    bar.appendChild(allBtn);
    body.appendChild(bar);

    const list = el('div', 'sb-items');
    unpaid.forEach((i) => {
      const q = picks.get(i.id) || 0;
      const row = el('div', 'sb-item' + (q > 0 ? ' on' : ''));
      const name = el('div', 'sb-iname');
      name.append(el('strong', '', i.name));
      const sub = el('small', '', fromSen(i.unit) + ' x ' + i.qty + (i.serve === 'bungkus' ? '  |  Takeaway' : '') + (i.note ? '  |  ' + i.note : ''));
      name.appendChild(sub);
      const step = el('div', 'sb-step');
      const minus = el('button', '', '-');
      minus.type = 'button';
      const num = el('span', '', String(q));
      const plus = el('button', '', '+');
      plus.type = 'button';
      minus.disabled = q <= 0;
      plus.disabled = q >= i.qty;
      minus.addEventListener('click', () => setPick(i, q - 1));
      plus.addEventListener('click', () => setPick(i, q + 1));
      step.append(minus, num, plus);
      const amt = el('span', 'sb-iamt', q > 0 ? fromSen(i.unit * q) : '');
      row.append(name, step, amt);
      list.appendChild(row);
    });
    if (unpaid.length === 0) list.appendChild(el('p', 'sb-empty', 'All items are paid. Use "Custom amount" for the rest.'));
    body.appendChild(list);

    const paidItems = order.items.filter((i) => i.paid);
    if (paidItems.length) {
      const sum = paidItems.reduce((n, i) => n + i.unit * i.qty, 0);
      body.appendChild(el('p', 'sb-note', paidItems.length + (paidItems.length === 1 ? ' item' : ' items') + ' already paid (' + fromSen(sum) + ')'));
    }
  }
  function setPick(item, q) {
    if (q <= 0) picks.delete(item.id);
    else picks.set(item.id, Math.min(q, item.qty));
    draw();
  }

  function drawEqual(body) {
    const card = el('div', 'sb-equal');
    card.appendChild(el('p', 'sb-eq-help', 'Left to pay ' + fromSen(order.remaining) + '. How many people are still paying?'));
    const step = el('div', 'sb-step sb-step-big');
    const minus = el('button', '', '-');
    minus.type = 'button';
    const num = el('span', '', String(people));
    const plus = el('button', '', '+');
    plus.type = 'button';
    minus.disabled = people <= 1;
    plus.disabled = people >= 20;
    minus.addEventListener('click', () => {
      people--;
      draw();
    });
    plus.addEventListener('click', () => {
      people++;
      draw();
    });
    step.append(minus, num, plus);
    card.appendChild(step);
    const each = el('div', 'sb-each');
    each.append(el('span', '', people <= 1 ? 'This person pays the rest' : 'Each person pays'), el('strong', '', fromSen(shareSen())));
    card.appendChild(each);
    if (people > 1) card.appendChild(el('p', 'sb-note', 'After this payment, change the number of people for the next one. The last person pays the exact rest.'));
    body.appendChild(card);
  }

  function drawAmount(body) {
    const card = el('div', 'sb-equal');
    card.appendChild(el('p', 'sb-eq-help', 'Type any amount this person wants to pay. Left to pay ' + fromSen(order.remaining) + '.'));
    const prev = amountInp ? amountInp.value : '0.00';
    const m = moneyInput('Amount to pay now', 'Left to pay: ' + fromSen(order.remaining));
    amountInp = m.inp;
    amountInp.value = prev;
    amountInp.addEventListener('input', refresh);
    amountInp.addEventListener('change', refresh);
    card.appendChild(m.wrap);
    const all = el('button', 'sb-link', 'Pay all that is left');
    all.type = 'button';
    all.addEventListener('click', () => {
      amountInp.value = (order.remaining / 100).toFixed(2);
      refresh();
    });
    card.appendChild(all);
    body.appendChild(card);
  }

  // right column: how this share is paid
  let cashInp = null; // received (single cash) or cash portion (mixed)
  let recvInp = null; // mixed: cash received
  function drawPay(col) {
    const box = el('div', 'sb-pay');
    els.shareRow = el('div', 'sb-line');
    els.roundRow = el('div', 'sb-line sb-sub');
    els.totalRow = el('div', 'sb-line sb-grand');
    box.append(els.shareRow, els.roundRow, els.totalRow);

    const methods = el('div', 'sb-methods');
    [['cash', 'Cash'], ['duitnow', 'DuitNow QR'], ['mixed', 'Cash + QR']].forEach(([k, t]) => {
      const b = el('button', 'sb-method' + (method === k ? ' on' : ''), t);
      b.type = 'button';
      b.addEventListener('click', () => {
        method = k;
        sepCash = true;
        draw();
      });
      methods.appendChild(b);
    });
    box.appendChild(methods);

    els.cashBox = el('div', 'sb-cashbox');
    box.appendChild(els.cashBox);
    if (method === 'cash') {
      const m = moneyInput('Cash received', '');
      cashInp = m.inp;
      cashInp.addEventListener('input', refresh);
      cashInp.addEventListener('change', refresh);
      els.cashBox.append(el('label', 'sb-lab', 'Cash received'), m.wrap);
      const quick = el('div', 'sb-quick');
      els.quick = quick;
      els.cashBox.appendChild(quick);
      els.change = el('div', 'sb-line sb-change');
      els.cashBox.appendChild(els.change);
    } else if (method === 'mixed') {
      const a = moneyInput('Paid in cash', '');
      cashInp = a.inp;
      cashInp.addEventListener('input', () => {
        sepCash = true;
        refresh();
      });
      cashInp.addEventListener('change', refresh);
      els.cashBox.append(el('label', 'sb-lab', 'Part paid in cash'), a.wrap);
      els.qrPart = el('div', 'sb-line');
      els.cashBox.appendChild(els.qrPart);
      const b = moneyInput('Cash received from the customer', '');
      recvInp = b.inp;
      recvInp.addEventListener('input', () => {
        sepCash = false;
        refresh();
      });
      recvInp.addEventListener('change', refresh);
      els.cashBox.append(el('label', 'sb-lab', 'Cash received'), b.wrap);
      els.change = el('div', 'sb-line sb-change');
      els.cashBox.appendChild(els.change);
    } else {
      els.cashBox.appendChild(el('p', 'sb-note', 'The customer scans the DuitNow QR. Press Pay after the money is received.'));
    }

    els.msg = el('p', 'sb-msg');
    els.msg.hidden = true;
    box.appendChild(els.msg);
    els.pay = el('button', 'sb-paybtn', 'Pay');
    els.pay.type = 'button';
    els.pay.addEventListener('click', pay);
    box.appendChild(els.pay);
    col.appendChild(box);
  }

  function setLine(row, label, text) {
    row.replaceChildren(el('span', '', label), el('span', '', text));
  }

  // numbers that change as you tap (no redraw, so the number pad keeps working)
  function plan() {
    const share = shareSen();
    const adj = roundingOn ? roundAdjust(share) : 0;
    const final = share + adj;
    let cash = 0;
    let qr = 0;
    let recv = 0;
    if (method === 'cash') {
      cash = final;
      recv = cashInp ? readSen(cashInp) : 0;
    } else if (method === 'duitnow') {
      qr = final;
    } else {
      cash = cashInp ? Math.min(readSen(cashInp), final) : 0;
      qr = final - cash;
      recv = sepCash || !recvInp ? cash : readSen(recvInp);
    }
    return { share, adj, final, cash, qr, recv };
  }

  function refresh() {
    if (!els.shareRow) return;
    const p = plan();
    setLine(els.shareRow, 'This share', fromSen(p.share));
    els.roundRow.hidden = p.adj === 0;
    if (p.adj !== 0) setLine(els.roundRow, 'Rounding', (p.adj > 0 ? '+' : '-') + fromSen(Math.abs(p.adj)));
    setLine(els.totalRow, 'To pay', fromSen(p.final));

    if (method === 'mixed') {
      setLine(els.qrPart, 'Part paid by DuitNow QR', fromSen(p.qr));
      if (sepCash && recvInp) recvInp.value = (p.cash / 100).toFixed(2);
    }
    if (els.change) {
      const need = method === 'cash' ? p.final : p.cash;
      const short = p.recv < need;
      setLine(els.change, short ? 'Still needed' : 'Change', fromSen(Math.abs(p.recv - need)));
      els.change.classList.toggle('sb-short', short);
    }
    if (els.quick) {
      els.quick.replaceChildren();
      const opts = [['Exact', p.final]];
      [10, 20, 50, 100].forEach((n) => {
        if (n * 100 > p.final) opts.push([String(n), n * 100]);
      });
      opts.slice(0, 4).forEach(([t, v]) => {
        const b = el('button', 'sb-q', t === 'Exact' ? t : 'RM ' + t);
        b.type = 'button';
        b.addEventListener('click', () => {
          cashInp.value = (v / 100).toFixed(2);
          refresh();
        });
        els.quick.appendChild(b);
      });
    }
    els.pay.textContent = p.final > 0 ? 'Pay ' + fromSen(p.final) : 'Pay';
    els.pay.disabled = busy || p.share <= 0;
  }

  function showMsg(text) {
    els.msg.textContent = text;
    els.msg.hidden = !text;
  }

  // ---------- pay ----------
  async function pay() {
    if (busy) return;
    const p = plan();
    showMsg('');
    if (p.share <= 0) return showMsg(tab === 'items' ? 'Pick at least one item first.' : 'The amount is empty.');
    if (p.share > order.remaining) return showMsg('That is more than the amount left to pay.');
    if (method === 'cash' && p.recv < p.final) return showMsg('The cash received is less than the total.');
    if (method === 'mixed') {
      if (p.cash <= 0 || p.qr <= 0) return showMsg('Mixed payment needs some cash and some DuitNow. Change the cash part.');
      if (p.recv < p.cash) return showMsg('The cash received is less than the cash part.');
    }

    const tenders = [];
    if (p.cash > 0) tenders.push({ method: 'cash', amount: p.cash / 100, received: p.recv / 100 });
    if (p.qr > 0) tenders.push({ method: 'duitnow', amount: p.qr / 100 });

    const items = [];
    if (tab === 'items') picks.forEach((q, id) => items.push({ id, qty: q }));

    busy = true;
    els.pay.disabled = true;
    els.pay.textContent = 'Saving...';
    const r = await supabase.rpc('pay_part', {
      p_order_id: orderId,
      p_items: tab === 'items' ? items : [],
      p_amount: tab === 'items' ? null : p.share / 100,
      p_tenders: tenders,
      p_label: shareLabel(),
    });
    busy = false;
    if (r.error) {
      els.pay.disabled = false;
      refresh();
      return showMsg('Could not save: ' + r.error.message);
    }
    paidSomething = true;
    if (p.cash > 0) drawerAfterCashPayment();
    lastResult = { data: r.data, cash: p.cash, qr: p.qr, recv: p.recv };
    picks = new Map();
    await load();
    draw();
  }

  function drawSuccess() {
    const d = lastResult.data;
    const box = el('div', 'sb-success');
    box.append(el('div', 'sb-tick', '✓'), el('h4', '', 'Part paid'), el('p', 'sb-rcpt', 'Receipt ' + d.receipt_no));
    const rows = el('div', 'sb-rows');
    const add = (k, v, c) => {
      const r = el('div', 'sb-line' + (c ? ' ' + c : ''));
      r.append(el('span', '', k), el('span', '', v));
      rows.appendChild(r);
    };
    add('Paid now', fromSen(sen(d.final)), 'sb-grand');
    if (lastResult.cash > 0) add('Cash', fromSen(lastResult.cash));
    if (lastResult.qr > 0) add('DuitNow QR', fromSen(lastResult.qr));
    if (lastResult.cash > 0 && lastResult.recv > lastResult.cash) add('Change', fromSen(lastResult.recv - lastResult.cash), 'sb-change');
    add('Left to pay', fromSen(order.remaining), order.remaining > 0 ? 'sb-leftrow' : '');
    box.appendChild(rows);
    const foot = el('div', 'sb-foot');
    const printMsg = el('p', 'sb-msg');
    printMsg.hidden = true;
    foot.appendChild(makeButton('Print receipt', () => printReceipt(d.payment_id, (m) => { printMsg.textContent = m; printMsg.hidden = false; }), 'sb-btn'));
    if (order.remaining > 0 && order.status === 'open') {
      const next = makeButton('Pay next share', () => {
        lastResult = null;
        draw();
      }, 'sb-btn sb-primary');
      foot.appendChild(next);
    } else {
      foot.appendChild(makeButton('Done', close, 'sb-btn sb-primary'));
    }
    box.append(printMsg, foot);
    modal.appendChild(box);
  }

  draw();
  const err = await load();
  if (err) {
    modal.replaceChildren(el('p', 'sb-empty sb-bad', 'Could not load the bill: ' + err));
    const f = el('div', 'sb-foot');
    f.appendChild(makeButton('Close', close, 'sb-btn'));
    modal.appendChild(f);
    return;
  }
  draw();
}
