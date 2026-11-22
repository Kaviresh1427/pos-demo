// Pay-now panel for the order page (order + food selection + payment on ONE page).
// orders.js calls initOrderPay(...) once. This file does not import orders.js.
import { supabase, el, makeButton, money } from './common.js';
import { printReceipt } from './receipt.js';
import { drawerAfterCashPayment } from './drawer.js';

document.head.appendChild(
  Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'order-pay.css' })
);

function fromCents(c) {
  return money(c / 100);
}

// 5-sen rounding (BNM rule): last digit 1,2,6,7 go down; 3,4,8,9 go up
function roundAdjust(cents) {
  const adjust = { 1: -1, 2: -2, 3: 2, 4: 1, 6: -1, 7: -2, 8: 2, 9: 1 };
  return adjust[cents % 10] || 0;
}

export function initOrderPay(api) {
  // api.host           the box where the pay panel is added
  // api.getTotals()    { savedCents, basketCents }
  // api.persistBasket() saves the basket, returns the open order id (or null)
  // api.afterPaid()    go back to the Tables page
  // api.setMessage(text, isError)

  let open = false;
  let busy = false;
  let method = 'cash';
  let cashCents = 0;
  let roundingOn = true;
  let discType = null; // 'percent', 'amount' or null
  let discValue = 0;
  let discReason = '';
  let pendType = 'percent';

  // ---------- Build the panel ----------
  const wrap = el('div', 'op-wrap');
  const payBtn = el('button', 'op-open-btn', 'Pay now');
  payBtn.type = 'button';

  // the payment section is a pop-up on top of the page
  const overlay = el('div', 'op-overlay');
  overlay.hidden = true;
  const panel = el('div', 'op-panel');
  const popTitle = el('h3', 'op-title', 'Payment');
  const popMsg = el('p', 'op-msg', '');
  popMsg.hidden = true;

  // shows a message inside the pop-up (or on the page when the pop-up is closed)
  function say(text, isError) {
    if (overlay.hidden) {
      api.setMessage(text, isError);
      return;
    }
    if (!text) {
      popMsg.hidden = true;
      return;
    }
    popMsg.textContent = text;
    popMsg.className = 'op-msg ' + (isError ? 'op-msg-error' : 'op-msg-ok');
    popMsg.hidden = false;
  }

  // discount
  const discToggle = makeButton('Add discount', () => {
    discBox.hidden = !discBox.hidden;
  }, 'secondary small op-disc-toggle');
  const discBox = el('div', 'op-disc-box');
  discBox.hidden = true;
  const typeRow = el('div', 'op-row');
  const typePct = makeButton('% Percent', () => { pendType = 'percent'; refreshDiscPanel(); }, 'small');
  const typeAmt = makeButton('RM Amount', () => { pendType = 'amount'; refreshDiscPanel(); }, 'small');
  typeRow.append(typePct, typeAmt);
  const discValueInput = document.createElement('input');
  discValueInput.type = 'text';
  discValueInput.inputMode = 'decimal';
  const discReasonInput = document.createElement('input');
  discReasonInput.type = 'text';
  discReasonInput.placeholder = 'Reason (required)';
  discReasonInput.maxLength = 80;
  const discBtns = el('div', 'op-row');
  const applyBtn = makeButton('Apply', applyDiscount, 'small');
  const removeBtn = makeButton('Remove', removeDiscount, 'secondary small');
  discBtns.append(applyBtn, removeBtn);
  discBox.append(typeRow, discValueInput, discReasonInput, discBtns);

  // totals
  const lineSub = el('div', 'op-line');
  const subText = el('span', '', '');
  lineSub.append(el('span', '', 'Subtotal'), subText);
  const lineDisc = el('div', 'op-line');
  const discLabel = el('span', '', 'Discount');
  const discText = el('span', '', '');
  lineDisc.append(discLabel, discText);
  const lineRound = el('div', 'op-line');
  const roundText = el('span', '', '');
  lineRound.append(el('span', '', 'Rounding'), roundText);
  const lineTotal = el('div', 'op-line op-grand');
  const totalText = el('span', '', '');
  lineTotal.append(el('span', '', 'Total'), totalText);

  // method
  const methods = el('div', 'op-methods');
  const cashBtn = makeButton('Cash', () => { method = 'cash'; render(); }, '');
  const qrBtn = makeButton('DuitNow (QR)', () => { method = 'duitnow'; render(); }, '');
  methods.append(cashBtn, qrBtn);

  // cash
  const cashBox = el('div', 'op-cash');
  const cashLabel = el('label', '', 'Cash received');
  const cashField = el('div', 'money-field');
  cashField.append(el('span', '', 'RM'));
  const cashInput = document.createElement('input');
  cashInput.type = 'text';
  cashInput.inputMode = 'numeric';
  cashInput.autocomplete = 'off';
  cashInput.value = '0.00';
  cashField.append(cashInput);
  const quickBox = el('div', 'op-quick');
  const changeText = el('p', 'op-change', '');
  cashBox.append(cashLabel, cashField, quickBox, changeText);

  const confirmBtn = el('button', 'op-confirm-btn', 'Confirm payment');
  confirmBtn.type = 'button';
  const closeBtn = makeButton('Close', () => closePanel(), 'secondary small op-close');

  const mainBox = el('div', 'op-main');
  mainBox.append(discToggle, discBox, lineSub, lineDisc, lineRound, lineTotal, methods, cashBox, confirmBtn, closeBtn);
  const doneBox = el('div', 'op-done');
  doneBox.hidden = true;
  panel.append(popTitle, popMsg, mainBox, doneBox);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  wrap.append(payBtn);
  api.host.appendChild(wrap);

  // ---------- Money ----------
  function discountCents(sub) {
    if (!discType) return 0;
    if (discType === 'percent') {
      const pct100 = Math.round(discValue * 100);
      return Math.floor((sub * pct100 * 2 + 10000) / 20000);
    }
    return Math.round(discValue * 100);
  }

  function totals() {
    const t = api.getTotals();
    const sub = t.savedCents + t.basketCents;
    let disc = discountCents(sub);
    let bad = false;
    if (disc > 0 && disc >= sub) {
      bad = true;
      disc = 0;
    }
    const after = sub - disc;
    const adj = roundingOn ? roundAdjust(after) : 0;
    return { sub, disc, bad, adj, total: after + adj };
  }

  // ---------- Discount ----------
  function refreshDiscPanel() {
    const npMode = pendType === 'percent' ? 'int' : 'money';
    if (discValueInput.dataset.numpad !== npMode) {
      discValueInput.dataset.numpad = npMode;
      discValueInput.value = ''; // percent and RM amounts must not mix
    }
    typePct.classList.toggle('secondary', pendType !== 'percent');
    typeAmt.classList.toggle('secondary', pendType !== 'amount');
    discValueInput.placeholder = pendType === 'percent' ? 'Percent, e.g. 10' : 'Amount in RM, e.g. 5.00';
  }

  function applyDiscount() {
    say('');
    const value = Number(discValueInput.value.replace(',', '.'));
    const reason = discReasonInput.value.trim();
    if (!(value > 0)) return say('Type a discount value bigger than 0.', true);
    if (pendType === 'percent' && value > 100) return say('A percent discount cannot be over 100.', true);
    if (!reason) return say('Please type the reason for the discount.', true);

    const old = [discType, discValue, discReason];
    discType = pendType;
    discValue = Math.round(value * 100) / 100;
    discReason = reason;
    if (totals().bad) {
      [discType, discValue, discReason] = old;
      return say('The discount must be less than the subtotal.', true);
    }
    discBox.hidden = true;
    render();
  }

  function removeDiscount() {
    discType = null;
    discValue = 0;
    discReason = '';
    discValueInput.value = '';
    discReasonInput.value = '';
    discBox.hidden = true;
    say('');
    render();
  }

  // ---------- Draw ----------
  function render() {
    if (!open || !doneBox.hidden) return;
    const t = totals();
    subText.textContent = fromCents(t.sub);
    totalText.textContent = fromCents(t.total);

    discToggle.textContent = discType ? 'Edit discount' : 'Add discount';
    if (t.bad) {
      lineDisc.hidden = false;
      discLabel.textContent = 'Discount';
      discText.textContent = 'Too high - change it';
    } else if (t.disc > 0) {
      lineDisc.hidden = false;
      discLabel.textContent = 'Discount' + (discType === 'percent' ? ' (' + discValue + '%)' : '');
      discText.textContent = '-' + fromCents(t.disc);
    } else {
      lineDisc.hidden = true;
    }

    lineRound.hidden = !(roundingOn && t.adj !== 0);
    roundText.textContent = (t.adj > 0 ? '+' : '-') + fromCents(Math.abs(t.adj));

    cashBtn.classList.toggle('secondary', method !== 'cash');
    qrBtn.classList.toggle('secondary', method !== 'duitnow');
    cashBox.hidden = method !== 'cash';

    quickBox.replaceChildren();
    quickBox.appendChild(makeButton('Exact', () => setCash(t.total), 'secondary small'));
    [10, 20, 50, 100].forEach((n) => {
      quickBox.appendChild(makeButton('RM ' + n, () => setCash(n * 100), 'secondary small'));
    });

    if (method === 'cash' && t.total > 0) {
      if (cashCents >= t.total) {
        changeText.textContent = 'Change: ' + fromCents(cashCents - t.total);
        changeText.className = 'op-change ok';
      } else {
        changeText.textContent = 'Short by: ' + fromCents(t.total - cashCents);
        changeText.className = 'op-change short';
      }
    } else {
      changeText.textContent = '';
    }
  }

  function setCash(cents) {
    cashCents = cents;
    cashInput.value = (cents / 100).toFixed(2);
    render();
  }

  cashInput.addEventListener('input', () => {
    const digits = cashInput.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7);
    setCash(Number(digits || 0));
  });

  // ---------- Open / close / reset ----------
  async function openPanel() {
    say('');
    const t = api.getTotals();
    if (t.savedCents + t.basketCents <= 0) {
      say('Add at least one item before taking payment.', true);
      return;
    }
    open = true;
    popMsg.hidden = true;
    overlay.hidden = false;
    mainBox.hidden = false;
    doneBox.hidden = true;
    render();
    const setting = await supabase.from('settings').select('value').eq('key', 'rounding_5sen').maybeSingle();
    roundingOn = setting.error || !setting.data ? true : setting.data.value === 'on';
    render();
  }

  function closePanel() {
    open = false;
    overlay.hidden = true;
  }

  function reset() {
    open = false;
    busy = false;
    method = 'cash';
    cashCents = 0;
    cashInput.value = '0.00';
    discType = null;
    discValue = 0;
    discReason = '';
    pendType = 'percent';
    discValueInput.value = '';
    discReasonInput.value = '';
    discBox.hidden = true;
    refreshDiscPanel();
    overlay.hidden = true;
    popMsg.hidden = true;
    mainBox.hidden = false;
    doneBox.hidden = true;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm payment';
  }

  payBtn.addEventListener('click', openPanel);

  // tapping the dark area closes the pop-up (but not after the payment is done)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && doneBox.hidden && !busy) closePanel();
  });

  // ---------- Confirm ----------
  confirmBtn.addEventListener('click', async () => {
    if (busy) return;
    say('');
    const t = totals();
    if (t.sub <= 0) return say('There is nothing to pay.', true);
    if (t.bad) return say('The discount is too high. Change or remove it.', true);
    if (method === 'cash' && cashCents < t.total) {
      return say('The cash received is less than the total.', true);
    }

    busy = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    try {
      // save any new items first, so they are part of the payment
      const orderId = await api.persistBasket();
      if (!orderId) throw new Error('There is no open order to pay.');

      const useDisc = discType && t.disc > 0;
      const { data, error } = await supabase.rpc('pay_orders', {
        p_order_ids: [orderId],
        p_method: method,
        p_cash_received: method === 'cash' ? cashCents / 100 : null,
        p_discount_type: useDisc ? discType : null,
        p_discount_value: useDisc ? discValue : 0,
        p_discount_reason: useDisc ? discReason : null,
      });
      if (error) throw error;
      if (method === 'cash') drawerAfterCashPayment();
      showDone(data);
    } catch (err) {
      say('Could not save the payment: ' + err.message, true);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm payment';
    }
    busy = false;
  });

  function showDone(result) {
    doneBox.replaceChildren();
    doneBox.appendChild(el('p', 'op-receipt-no', 'Payment complete'));
    doneBox.appendChild(el('p', 'op-receipt-sub', 'Receipt ' + result.receipt_no));

    const line = (label, value, cls) => {
      const r = el('div', 'op-line' + (cls ? ' ' + cls : ''));
      r.append(el('span', '', label), el('span', '', value));
      doneBox.appendChild(r);
    };
    line('Subtotal', money(Number(result.subtotal)));
    if (Number(result.discount) > 0) line('Discount', '-' + money(Number(result.discount)));
    if (Number(result.rounding) !== 0) {
      const r = Number(result.rounding);
      line('Rounding', (r > 0 ? '+' : '-') + money(Math.abs(r)));
    }
    line('Total', money(Number(result.total)), 'op-grand');
    line('Paid by', method === 'cash' ? 'Cash' : 'DuitNow (QR)');
    if (method === 'cash') {
      line('Cash received', fromCents(cashCents));
      line('Change', fromCents(cashCents - Math.round(Number(result.total) * 100)));
    }

    const printBtn = el('button', 'op-confirm-btn', 'Print receipt');
    printBtn.type = 'button';
    printBtn.addEventListener('click', () => printReceipt(result.payment_id, (msg) => say(msg, true)));
    const doneBtn = makeButton('Done', () => {
      reset();
      api.afterPaid();
    }, 'secondary op-close');
    doneBox.append(printBtn, doneBtn);

    mainBox.hidden = true;
    doneBox.hidden = false;
  }

  refreshDiscPanel();
  return { refresh: render, reset };
}
