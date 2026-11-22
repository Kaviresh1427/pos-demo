// The receipt design (UNPAID bill and PAID receipt).
// The same drawing is used on the screen (Take Payment page) and on the physical printer,
// so both always look the same.
import { supabase, el } from './common.js';

// ===== RECEIPT HEADER: change these when the owner gives the real details =====
export const SHOP = {
  name: 'Demo Restaurant',
  tagline: 'Restaurant',
  lines: ['Address line 1 (to be updated)', 'Address line 2'],
  phone: '00-000 0000',
  email: '', // leave empty to hide the e-mail
  logo: '', // the company logo picture (set on the Settings page); empty = chef hat
  qr: 'duitnow-qr.png', // put the DuitNow QR picture in the project folder with this name
  footer: 'Thank you for dining with us!',
  font: 'classic', // classic | modern | mono | friendly | elegant
};
// ===============================================================================

// shop details saved on the Settings page (table app_settings, key 'shop') replace the defaults above
export function applyShop(v) {
  if (!v || typeof v !== 'object') return;
  ['name', 'tagline', 'phone', 'email', 'qr', 'logo', 'footer', 'font'].forEach((k) => {
    if (typeof v[k] === 'string') SHOP[k] = v[k];
  });
  if (Array.isArray(v.lines)) SHOP.lines = v.lines.filter((x) => typeof x === 'string' && x.trim() !== '');
  document.dispatchEvent(new CustomEvent('kamala:shop-changed'));
}
export async function loadShop() {
  try {
    const sess = await supabase.auth.getSession();
    if (!sess.data || !sess.data.session) return;
    const r = await supabase.from('app_settings').select('value').eq('key', 'shop').maybeSingle();
    if (r.data && r.data.value) applyShop(r.data.value);
  } catch (e) {
    /* the settings table may not exist yet: the defaults above are used */
  }
}
supabase.auth.onAuthStateChange(() => { setTimeout(loadShop, 0); });
loadShop();

const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = 'receipt-view.css';
document.head.appendChild(cssLink);

const svg = (inner, extra) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
  (extra || '') + '>' + inner + '</svg>';

const ICON = {
  hat:
    '<svg viewBox="0 0 64 52" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 38c-7 0-12-5-12-11s5-10 11-10c1-6 6-10 13-10s12 4 13 10c6 0 11 4 11 10s-5 11-12 11"/>' +
    '<path d="M18 38v8h28v-8"/><path d="M26 28v14M26 28c-2 0-3 2-3 4M30 24v6M37 24c-2 2-2 6 0 8s0 6 0 10"/></svg>',
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  clock: svg('<circle cx="12" cy="12" r="9.5" stroke-width="2.2"/><path d="M12 6.5V12l3.5 2.2" stroke-width="2.2"/>'),
  check: svg('<circle cx="12" cy="12" r="9.5" stroke-width="2.2"/><path d="M7.5 12.5l3 3 6-6.5" stroke-width="2.4"/>'),
  card: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke-width="2"/><path d="M2.5 10h19" stroke-width="2"/><path d="M6 15h3" stroke-width="2"/>'),
  cash: svg('<rect x="2.5" y="6" width="19" height="12" rx="2" stroke-width="2"/><circle cx="12" cy="12" r="2.8" stroke-width="2"/><path d="M6 12h.01M18 12h.01" stroke-width="2.6"/>'),
  qr: svg('<rect x="3" y="3" width="7" height="7" rx="1" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke-width="2"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" stroke-width="2"/>'),
  dine: svg('<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7M6 7h4M17 21V3c-2 1-3.5 4-3.5 8 0 1.2.8 2 2 2h1.5"/>'),
  bag: svg('<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  phoneNow: svg('<rect x="7" y="2.5" width="10" height="19" rx="2" stroke-width="2"/><path d="M11 18.5h2" stroke-width="2"/>'),
};

function icon(html, cls) {
  const s = el('span', cls || 'rv-ic');
  s.innerHTML = html;
  return s;
}

const cents2 = (c) => (c / 100).toFixed(2);
const rm = (c) => 'RM ' + cents2(c);

export function nowText() {
  return new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
}

// the name of the person who is logged in (shown as "Staff")
let staffCache = null;
export async function getStaffName() {
  if (staffCache) return staffCache;
  try {
    const sess = await supabase.auth.getSession();
    const user = sess.data && sess.data.session ? sess.data.session.user : null;
    if (!user) return '-';
    const r = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    staffCache = (r.data && r.data.full_name) || (user.email || '-').split('@')[0];
  } catch (e) {
    staffCache = '-';
  }
  return staffCache;
}

// "T03", "Takeaway TA-01", "Foodpanda #123"
export function orderText(type, tableNo, platformNo, platformNames) {
  if (type === 'table') return 'T' + String(tableNo).padStart(2, '0');
  if (type === 'takeaway') return 'Takeaway ' + platformNo;
  return ((platformNames && platformNames[type]) || type) + ' #' + platformNo;
}

// same item + same price + same note + same serve type are added together
export function groupItems(rawItems) {
  const map = new Map();
  rawItems.forEach((i) => {
    const key = i.name + '|' + i.unit + '|' + (i.note || '') + '|' + (i.takeaway ? 1 : 0);
    if (!map.has(key)) map.set(key, { name: i.name, unit: i.unit, qty: 0, note: i.note || '', takeaway: !!i.takeaway });
    map.get(key).qty += i.qty;
  });
  return Array.from(map.values());
}

function row(cls, ...cells) {
  const r = el('div', cls);
  cells.forEach((c) => r.appendChild(typeof c === 'string' ? el('span', '', c) : c));
  return r;
}
const dash = () => el('div', 'rv-dash', '');

/*
 d = {
   paid: true/false, receiptNo, when, rowLabel ('Table'/'Order'), where ('T03'), staff,
   items: [{ name, qty, unit (sen), note, takeaway }], tagTakeaway: true/false,
   subCents, discCents, discTag, adj (sen), totalCents,
   methodText, methodKind ('cash'|'qr'), paidOn, cashCents (or null), changeCents
 }
*/
export function buildReceipt(d) {
  const S = d.shop || SHOP; // d.shop is used by the Settings preview
  const r = el('div', 'rcpt ' + (d.paid ? 'rcpt-paid' : 'rcpt-unpaid') + (S.font && S.font !== 'classic' ? ' rv-font-' + S.font : ''));

  // ----- header -----
  const head = el('div', 'rv-header');
  const logo = icon(ICON.hat, 'rv-logo');
  if (S.logo) {
    const im = document.createElement('img');
    im.className = 'rv-logo-img';
    im.alt = '';
    im.addEventListener('error', () => im.replaceWith(icon(ICON.hat, 'rv-logo')));
    im.src = S.logo;
    head.appendChild(im);
  } else {
    head.appendChild(logo);
  }
  head.appendChild(el('div', 'rv-shop', S.name));
  if (S.tagline) head.appendChild(el('div', 'rv-tagline', S.tagline));
  const addr = el('div', 'rv-addr');
  S.lines.forEach((t) => addr.appendChild(el('div', '', t)));
  head.appendChild(addr);
  const contact = el('div', 'rv-contact');
  if (S.phone) {
    const p = el('span', 'rv-contact-item');
    p.append(icon(ICON.phone), document.createTextNode(S.phone));
    contact.appendChild(p);
  }
  if (S.email) {
    const m = el('span', 'rv-contact-item');
    m.append(icon(ICON.mail), document.createTextNode(S.email));
    contact.appendChild(m);
  }
  if (contact.childNodes.length) head.appendChild(contact);
  r.appendChild(head);
  r.appendChild(el('div', 'rv-solid', ''));

  // ----- RECEIPT + PAID / UNPAID badge -----
  const title = el('div', 'rv-title');
  const left = el('div', 'rv-title-left');
  left.append(el('div', 'rv-h1', 'RECEIPT'), el('div', 'rv-no', 'Receipt No : ' + (d.receiptNo || 'Pending')));
  const badge = el('div', 'rv-badge');
  const bt = el('div', 'rv-badge-text');
  bt.append(el('strong', '', d.paid ? 'PAID' : 'UNPAID'), el('small', '', d.paid ? 'Payment Completed' : 'Pending Payment'));
  badge.append(icon(d.paid ? ICON.check : ICON.clock, 'rv-badge-ic'), bt);
  title.append(left, badge);
  r.appendChild(title);

  // ----- date / table / staff -----
  const info = el('div', 'rv-info');
  [['Date', d.when], [d.rowLabel || 'Table', d.where || '-'], ['Staff', d.staff || '-']].forEach(([k, v]) => {
    info.appendChild(row('rv-irow', k, ':', v));
  });
  r.appendChild(info);
  r.appendChild(dash());

  // ----- items -----
  const table = el('div', 'rv-table');
  const hc = (a) => { const c = el('span', ''); c.append(document.createTextNode(a), document.createElement('br'), document.createTextNode('(RM)')); return c; };
  table.appendChild(row('rv-trow rv-thead', '#', 'Item', 'Qty', hc('Unit Price'), hc('Amount')));
  if (d.items.length === 0) {
    table.appendChild(el('div', 'rv-empty', 'No items'));
  }
  const addLines = (list) => {
    list.forEach((it, idx) => {
      table.appendChild(row('rv-trow', String(idx + 1), it.name, String(it.qty), cents2(it.unit), cents2(it.unit * it.qty)));
      if (it.note) table.appendChild(el('div', 'rv-sub', '* ' + it.note));
    });
  };
  if (d.tagTakeaway) {
    // dine-in and take away together: two parts, each with its own total
    [['DINE-IN', 'Dine-in Total', d.items.filter((i) => !i.takeaway)], ['TAKE AWAY', 'Take Away Total', d.items.filter((i) => i.takeaway)]].forEach(([title, label, list]) => {
      if (list.length === 0) return;
      const head = el('div', 'rv-section');
      head.append(icon(title === 'DINE-IN' ? ICON.dine : ICON.bag, 'rv-ic'), el('b', '', title), el('em', '', list.reduce((n, i) => n + i.qty, 0) + (list.reduce((n, i) => n + i.qty, 0) === 1 ? ' item' : ' items')));
      table.appendChild(head);
      addLines(list);
      table.appendChild(row('rv-sectotal', label, cents2(list.reduce((n, i) => n + i.unit * i.qty, 0))));
    });
  } else {
    addLines(d.items);
  }
  r.appendChild(table);
  r.appendChild(dash());

  // ----- totals -----
  const tot = el('div', 'rv-totals');
  if (d.discCents > 0) {
    tot.appendChild(row('rv-sline', 'Subtotal', cents2(d.subCents)));
    tot.appendChild(row('rv-sline', 'Discount' + (d.discTag || ''), '-' + cents2(d.discCents)));
  }
  if (d.adj !== 0) tot.appendChild(row('rv-sline', 'Rounding', (d.adj > 0 ? '+' : '-') + cents2(Math.abs(d.adj))));
  if (tot.childNodes.length) r.appendChild(tot);
  r.appendChild(row('rv-grand', 'TOTAL AMOUNT', rm(d.totalCents)));

  // ----- bottom block -----
  if (d.paid) {
    const block = el('div', 'rv-pay');
    block.appendChild(icon(d.methodKind === 'cash' ? ICON.cash : d.methodKind === 'qr' ? ICON.qr : ICON.card, 'rv-pay-ic'));
    block.appendChild(el('div', 'rv-vline', ''));
    const rows = el('div', 'rv-pay-rows');
    rows.appendChild(row('rv-irow', 'Payment Method', ':', d.methodText));
    rows.appendChild(row('rv-irow', 'Paid On', ':', d.paidOn || d.when));
    if (d.methodKind === 'cash' && d.cashCents !== null && d.cashCents !== undefined) {
      rows.appendChild(row('rv-irow', 'Cash Received', ':', cents2(d.cashCents)));
      rows.appendChild(row('rv-irow', 'Change', ':', cents2(d.changeCents || 0)));
    }
    block.appendChild(rows);
    r.appendChild(block);
  } else if (S.qr) {
    // the DuitNow QR picture is shown only if the file exists
    const block = el('div', 'rv-pay rv-pay-qr');
    const img = document.createElement('img');
    img.className = 'rv-qr';
    img.alt = 'DuitNow QR';
    img.addEventListener('error', () => { block.remove(); });
    img.src = S.qr;
    block.appendChild(img);
    block.appendChild(el('div', 'rv-vline', ''));
    const t = el('div', 'rv-pay-text');
    const h = el('div', 'rv-paynow');
    h.append(icon(ICON.phoneNow, 'rv-ic'), el('strong', '', 'Pay Now'));
    t.append(h, el('div', 'rv-scan', 'Scan the QR code to make payment'));
    block.appendChild(t);
    r.appendChild(block);
  }

  r.appendChild(dash());
  r.appendChild(el('div', 'rv-thanks', S.footer));
  return r;
}

// wait until the pictures (QR) are loaded, so the printed receipt is complete
export function imagesReady(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  return Promise.race([
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((res) => { i.addEventListener('load', res); i.addEventListener('error', res); })))),
    new Promise((res) => setTimeout(res, 2000)),
  ]);
}
