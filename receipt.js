import { supabase, el, makeButton, money } from './common.js';
import { modsReady, modsText } from './mod-core.js';
import { SHOP, buildReceipt, imagesReady, getStaffName, orderText, groupItems } from './receipt-view.js';
export { SHOP };


// load the receipt style file
const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = 'receipt.css';
document.head.appendChild(cssLink);

// the hidden box that holds the receipt (only visible when printing)
let box = document.getElementById('receipt');
if (!box) {
  box = document.createElement('div');
  box.id = 'receipt';
  document.body.appendChild(box);
}

// print a receipt design (UNPAID bill or PAID receipt) on the thermal printer
async function printDesign(d) {
  box.replaceChildren(buildReceipt(d));
  await imagesReady(box);
  window.print();
}

// the UNPAID bill (before payment), built on the Take Payment page
export function printBill(d) {
  return printDesign(d);
}

// build the PAID receipt design for one payment (used for printing and for the preview)
export async function loadReceiptDesign(paymentId, onError) {
  const BASE = 'id, method, amount, cash_received, receipt_no, rounding, discount, discount_type, discount_value, created_at';
  // the Split Bill columns exist only after splitbill-refund.sql was run
  let pay = await supabase.from('payments').select(BASE + ', order_id, part_label, tender_seq, group_receipt').eq('id', paymentId).single();
  if (pay.error) pay = await supabase.from('payments').select(BASE).eq('id', paymentId).single();

  if (pay.error) {
    if (onError) onError('Could not load the receipt: ' + pay.error.message);
    return null;
  }

  const p = pay.data;
  const isPart = p.order_id !== null && p.order_id !== undefined;
  const when = new Date(p.created_at).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (isPart) return loadPartDesign(p, when, onError);

  const modCol = (await modsReady()) ? ', modifiers' : '';
  const ord = await supabase
    .from('orders')
    .select('order_type, table_no, platform_order_no, order_items(item_name, unit_price, qty, serve_type, status, note' + modCol + ')')
    .eq('payment_id', paymentId);

  if (ord.error) {
    if (onError) onError('Could not load the receipt: ' + ord.error.message);
    return null;
  }

  const total = Math.round(Number(p.amount) * 100);
  const rounding = Math.round(Number(p.rounding || 0) * 100);
  const discount = Math.round(Number(p.discount || 0) * 100);

  const places = [];
  const raw = [];
  let onlyTables = ord.data.length > 0;
  ord.data.forEach((o) => {
    if (o.order_type !== 'table') onlyTables = false;
    places.push(orderText(o.order_type, o.table_no, o.platform_order_no));
    o.order_items.forEach((i) => {
      if (i.status !== 'active') return;
      raw.push({ name: i.item_name, unit: Math.round(Number(i.unit_price) * 100), qty: i.qty, note: modsText(i.modifiers, i.note), takeaway: i.serve_type === 'bungkus' });
    });
  });

  const cash = p.method === 'cash' && p.cash_received !== null ? Math.round(Number(p.cash_received) * 100) : null;

  return {
    paid: true,
    receiptNo: p.receipt_no,
    when,
    paidOn: when,
    rowLabel: onlyTables ? 'Table' : 'Order',
    where: places.join(', ') || '-',
    staff: await getStaffName(),
    items: groupItems(raw),
    tagTakeaway: raw.some((i) => i.takeaway) && raw.some((i) => !i.takeaway),
    subCents: total - rounding + discount,
    discCents: discount,
    discTag: p.discount_type === 'percent' ? ' (' + Number(p.discount_value) + '%)' : '',
    adj: rounding,
    totalCents: total,
    methodKind: p.method === 'cash' ? 'cash' : 'qr',
    methodText: p.method === 'cash' ? 'Cash' : 'QR Pay (DuitNow)',
    cashCents: cash,
    changeCents: cash !== null ? cash - total : 0,
  };
}

// a receipt for one share of a split bill (cash, DuitNow, or both together)
async function loadPartDesign(p, when, onError) {
  const sib = await supabase
    .from('payments')
    .select('id, method, amount, cash_received, receipt_no, rounding, tender_seq, group_receipt')
    .eq('group_receipt', p.group_receipt || p.receipt_no)
    .order('id');
  const rows = !sib.error && sib.data && sib.data.length ? sib.data : [p];
  const primary = rows[0];
  const sen = (v) => Math.round(Number(v || 0) * 100);
  const total = rows.reduce((n, r) => n + sen(r.amount), 0);
  const rounding = rows.reduce((n, r) => n + sen(r.rounding), 0);

  const ord = await supabase
    .from('orders')
    .select('order_type, table_no, platform_order_no')
    .eq('id', p.order_id)
    .maybeSingle();
  const o = ord.data;
  const where = o ? orderText(o.order_type, o.table_no, o.platform_order_no) : '-';

  const its = await supabase
    .from('order_items')
    .select('item_name, unit_price, qty, serve_type, note' + ((await modsReady()) ? ', modifiers' : ''))
    .eq('paid_part_id', primary.id);
  const raw = [];
  (its.data || []).forEach((i) => raw.push({ name: i.item_name, unit: sen(i.unit_price), qty: i.qty, note: modsText(i.modifiers, i.note), takeaway: i.serve_type === 'bungkus' }));
  // equal split / amount: no items, so one summary line
  if (raw.length === 0) raw.push({ name: 'Split bill' + (p.part_label ? ' - ' + p.part_label : ''), unit: total - rounding, qty: 1, note: '', takeaway: false });

  const cashRow = rows.find((r) => r.method === 'cash');
  const qrRow = rows.find((r) => r.method !== 'cash');
  let methodText = 'Cash';
  let kind = 'cash';
  if (cashRow && qrRow) methodText = 'Cash ' + money(sen(cashRow.amount) / 100) + ' + DuitNow ' + money(sen(qrRow.amount) / 100);
  else if (!cashRow) {
    methodText = 'QR Pay (DuitNow)';
    kind = 'qr';
  }
  const cashCents = cashRow ? sen(cashRow.cash_received !== null ? cashRow.cash_received : cashRow.amount) : null;

  return {
    paid: true,
    receiptNo: primary.receipt_no,
    when,
    paidOn: when,
    rowLabel: o && o.order_type !== 'table' ? 'Order' : 'Table',
    where: where + (p.part_label ? ' (' + p.part_label + ')' : ''),
    staff: await getStaffName(),
    items: groupItems(raw),
    tagTakeaway: raw.some((i) => i.takeaway) && raw.some((i) => !i.takeaway),
    subCents: total - rounding,
    discCents: 0,
    discTag: '',
    adj: rounding,
    totalCents: total,
    methodKind: kind,
    methodText,
    cashCents,
    changeCents: cashRow ? cashCents - sen(cashRow.amount) : 0,
  };
}

export async function printReceipt(paymentId, onError) {
  const d = await loadReceiptDesign(paymentId, onError);
  if (d) await printDesign(d);
}

// ---------- Reprint: list of today's receipts ----------

const reprintBox = document.createElement('div');
reprintBox.className = 'reason-overlay';
reprintBox.hidden = true;
document.body.appendChild(reprintBox);

function closeReprint() {
  reprintBox.hidden = true;
  reprintBox.replaceChildren();
}

async function openReprint() {
  reprintBox.replaceChildren();
  const card = el('div', 'card');
  card.appendChild(el('h3', '', "Today's receipts"));
  const list = el('div', 'reprint-list');
  list.appendChild(el('p', 'menu-empty', 'Loading...'));
  card.appendChild(list);
  card.appendChild(makeButton('Back', closeReprint, 'secondary small'));
  reprintBox.appendChild(card);
  reprintBox.hidden = false;

  // start of today, Malaysia time
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const start = new Date(today + 'T00:00:00+08:00').toISOString();

  const res = await supabase
    .from('payments')
    .select('id, receipt_no, amount, method, created_at')
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(20);

  list.replaceChildren();

  if (res.error) {
    list.appendChild(el('p', 'menu-empty', 'Could not load: ' + res.error.message));
    return;
  }
  if (res.data.length === 0) {
    list.appendChild(el('p', 'menu-empty', 'No receipts yet today.'));
    return;
  }

  res.data.forEach((p) => {
    const time = new Date(p.created_at).toLocaleTimeString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
    });
    const text =
      p.receipt_no + '  |  ' + time + '  |  ' + money(Number(p.amount)) + '  |  ' + (p.method === 'cash' ? 'Cash' : 'DuitNow');
    list.appendChild(
      makeButton(
        text,
        () => {
          closeReprint();
          printReceipt(p.id, (msg) => alert(msg));
        },
        'secondary reprint-row'
      )
    );
  });
}

// put the "Reprint receipt" button next to "Take payment"
const payWrap = document.querySelector('.pay-open-wrap');
if (payWrap) {
  payWrap.appendChild(makeButton('Reprint receipt', openReprint, 'secondary'));
}