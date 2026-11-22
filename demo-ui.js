// =====================================================================
// DEMO EXTRAS
// - "DEMO" tab on the right edge: what this is, Reset demo, WhatsApp us
// - PIN shortcuts on the login screen (Owner / Cashier / Waiter)
// - Printing shows an on-screen receipt preview instead of a real printer
// - The cash drawer button shows a message instead of opening a drawer
// =====================================================================
import { resetDemo } from './demo-db.js';

const WHATSAPP = '601163975503';
const WA_TEXT = 'Hi Sarvesh Computer Enterprise, I tried the Restaurant POS demo and I am interested. Please contact me.';
const COMPANY_SITE = 'https://www.sarveshcomputer.com.my';

window.__IDLE_MS = 30 * 60 * 1000; // auto-lock after 30 minutes in the demo

const PINS = [
  { pin: '1111', role: 'Owner', note: 'Sees everything: reports, menu, settings' },
  { pin: '2222', role: 'Cashier', note: 'Orders, payment, shift' },
  { pin: '3333', role: 'Waiter', note: 'Takes orders only' },
];

// ---------- styles ----------
const css = `
html body .dm-tab{width:auto;height:auto;min-height:0;margin:0;left:auto;line-height:1;text-transform:none;position:fixed;right:0;top:50%;z-index:3500;transform:translateY(-50%);writing-mode:vertical-rl;
  padding:14px 8px;border:0;border-radius:14px 0 0 14px;font:700 .78rem/1 'Outfit',system-ui,sans-serif;letter-spacing:.18em;
  color:#1b1405;background:linear-gradient(180deg,#f3dc9a,#c9952e);box-shadow:-6px 10px 26px -10px rgba(0,0,0,.6);cursor:pointer}
html body .dm-tab:hover{padding-right:12px}
html body .dm-back{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px;
  background:rgba(2,12,9,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:dm-fade .2s both}
html body .dm-card{width:min(440px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:24px;border-radius:24px;
  color:#e9f3ee;background:linear-gradient(160deg,#0f3a2d,#071d16);border:1px solid rgba(217,181,90,.35);
  box-shadow:0 30px 70px -20px rgba(0,0,0,.8);font-family:'Outfit',system-ui,sans-serif;animation:dm-up .28s cubic-bezier(.2,.8,.2,1) both}
html body .dm-card h2{margin:0 0 6px;font-size:1.35rem;color:#f3dc9a}
html body .dm-card p{margin:0 0 14px;color:#b9cfc5;line-height:1.5;font-size:.95rem}
html body .dm-card ul{margin:0 0 16px;padding-left:18px;color:#d6e6de;line-height:1.7;font-size:.92rem}
html body .dm-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:8px 0 0;padding:13px 16px;border-radius:14px;
  border:1px solid rgba(255,255,255,.14);font:600 .98rem 'Outfit',system-ui,sans-serif;color:#e9f3ee;background:rgba(255,255,255,.06);
  cursor:pointer;text-decoration:none;box-sizing:border-box}
html body .dm-btn:hover{background:rgba(255,255,255,.12)}
html body .dm-wa{color:#fff;background:#1fa855;border-color:#1fa855}
html body .dm-wa:hover{background:#178f47}
html body .dm-x{min-height:0;float:right;margin:-6px -6px 0 0;width:34px;height:34px;padding:0;border-radius:50%;border:0;color:#b9cfc5;background:rgba(255,255,255,.08);font-size:1.1rem;cursor:pointer}
html body .dm-pins{width:100%;margin:14px 0 0;padding:12px;border-radius:16px;background:rgba(217,181,90,.12);border:1px dashed rgba(217,181,90,.55);box-sizing:border-box}
html body .dm-pins-title{margin:0 0 8px;font:600 .8rem 'Outfit',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#c9952e;text-align:center}
html body .dm-pin-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
html body .dm-pin{width:auto;min-height:0;margin:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px;border-radius:12px;border:1px solid rgba(217,181,90,.5);
  background:rgba(255,255,255,.08);color:inherit;font:600 .9rem 'Outfit',system-ui,sans-serif;cursor:pointer;box-shadow:none}
html body .dm-pin small{font-weight:500;opacity:.75;letter-spacing:.12em}
html body .dm-pin:hover{background:rgba(217,181,90,.22)}
html body .dm-pin-note{margin:8px 0 0;font-size:.78rem;opacity:.75;text-align:center}
html body .dm-paper-wrap{display:flex;flex-direction:column;align-items:center;gap:12px;width:min(380px,100%);max-height:calc(100vh - 36px);animation:dm-up .28s both}
html body .dm-paper-head{display:flex;align-items:center;justify-content:space-between;width:100%;color:#f3dc9a;font:600 1rem 'Outfit',system-ui,sans-serif}
html body .dm-paper{width:100%;overflow:auto;padding:14px;border-radius:6px;background:#fff;color:#000;box-shadow:0 30px 60px -20px rgba(0,0,0,.8);box-sizing:border-box}
html body .dm-paper .rcpt{margin:0 auto}
html body .dm-toast{position:fixed;left:50%;bottom:110px;z-index:4500;transform:translateX(-50%);padding:12px 18px;border-radius:14px;
  font:600 .95rem 'Outfit',system-ui,sans-serif;color:#1b1405;background:linear-gradient(135deg,#f3dc9a,#c9952e);
  box-shadow:0 18px 40px -14px rgba(0,0,0,.7);animation:dm-up .25s both;max-width:calc(100vw - 32px);text-align:center}
@keyframes dm-fade{from{opacity:0}to{opacity:1}}
@keyframes dm-up{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
html body .dm-toast{animation-name:dm-toast}
@keyframes dm-toast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@media print{.dm-tab,.dm-back,.dm-toast{display:none!important}}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(text) {
  const t = mk('div', 'dm-toast', text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function waLink() {
  return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(WA_TEXT);
}

// ---------- the "About this demo" panel ----------
function openPanel() {
  const back = mk('div', 'dm-back');
  const card = mk('div', 'dm-card');
  const x = mk('button', 'dm-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  card.append(x, mk('h2', '', 'Restaurant POS – Live Demo'));
  card.appendChild(mk('p', '', 'This is a working demo with sample data for "Demo Restaurant". Press anything you like: nothing you do here is sent anywhere, and it starts fresh every day.'));
  const ul = mk('ul');
  [
    'Tap a table, add dishes and save the order',
    'Take payment by cash or DuitNow QR, split a bill',
    'Open and close a shift, cash in / cash out',
    'See the Dashboard and Sales reports (owner)',
    'Edit the menu, prices, photos and options (owner)',
  ].forEach((t) => ul.appendChild(mk('li', '', t)));
  card.appendChild(ul);
  card.appendChild(mk('p', '', 'Demo PINs: Owner 1111 · Cashier 2222 · Waiter 3333'));

  const wa = mk('a', 'dm-btn dm-wa', 'WhatsApp us: get this POS for your restaurant');
  wa.href = waLink();
  wa.target = '_blank';
  wa.rel = 'noopener';
  const site = mk('a', 'dm-btn', 'Visit sarveshcomputer.com.my');
  site.href = COMPANY_SITE;
  site.target = '_blank';
  site.rel = 'noopener';
  const reset = mk('button', 'dm-btn', '↺  Reset demo (start fresh)');
  reset.type = 'button';
  reset.addEventListener('click', resetDemo);
  card.append(wa, site, reset);
  card.appendChild(mk('p', '', ''));
  const by = mk('p', '', 'Built by Sarvesh Computer Enterprise · +60 11-6397 5503');
  by.style.cssText = 'margin:14px 0 0;font-size:.8rem;text-align:center;opacity:.7';
  card.appendChild(by);

  back.appendChild(card);
  const close = () => back.remove();
  x.addEventListener('click', close);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  document.body.appendChild(back);
}

const tab = mk('button', 'dm-tab', 'DEMO');
tab.type = 'button';
tab.title = 'About this demo';
tab.addEventListener('click', openPanel);
document.body.appendChild(tab);

// ---------- PIN shortcuts on the login screen ----------
function typePin(pin) {
  // clear first, then "type" the 4 digits (the PIN pad listens to the keyboard)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  pin.split('').forEach((d, i) => {
    setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: d, bubbles: true })), 90 * (i + 1));
  });
}
function addPinHints() {
  const pad = document.querySelector('#pin-screen .pin-pad');
  if (!pad || pad.querySelector('.dm-pins')) return !!pad;
  const box = mk('div', 'dm-pins');
  box.appendChild(mk('p', 'dm-pins-title', 'Demo · tap a role to log in'));
  const row = mk('div', 'dm-pin-row');
  PINS.forEach((p) => {
    const b = mk('button', 'dm-pin');
    b.type = 'button';
    b.title = p.note;
    b.append(document.createTextNode(p.role), mk('small', '', p.pin));
    b.addEventListener('click', () => typePin(p.pin));
    row.appendChild(b);
  });
  box.append(row, mk('p', 'dm-pin-note', 'Owner sees everything. Waiter can only take orders.'));
  pad.appendChild(box);
  return true;
}
if (!addPinHints()) {
  const mo = new MutationObserver(() => {
    if (addPinHints()) mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ---------- printing: show the receipt on screen ----------
window.print = function demoPrint() {
  const box = document.getElementById('receipt');
  if (!box || !box.children.length || box.querySelector('.drawer-slip')) {
    toast('Cash drawer opened (demo). In the shop, the drawer opens through the receipt printer.');
    return;
  }
  const back = mk('div', 'dm-back');
  const wrap = mk('div', 'dm-paper-wrap');
  const head = mk('div', 'dm-paper-head');
  head.appendChild(mk('span', '', '🖨  Printer preview (demo)'));
  const x = mk('button', 'dm-x', '✕');
  x.type = 'button';
  x.style.margin = '0';
  head.appendChild(x);
  const paper = mk('div', 'dm-paper');
  paper.innerHTML = box.innerHTML;
  const note = mk('p', '', 'In the shop this prints on the 80mm thermal receipt printer.');
  note.style.cssText = 'margin:0;color:#b9cfc5;font:400 .85rem Outfit,system-ui,sans-serif;text-align:center';
  wrap.append(head, paper, note);
  back.appendChild(wrap);
  const close = () => back.remove();
  x.addEventListener('click', close);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  document.body.appendChild(back);
};
