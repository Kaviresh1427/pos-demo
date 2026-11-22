import './tables.js';
import { supabase } from './common.js';
import { askConfirm } from './dialogs.js';
import { SHOP } from './receipt-view.js';
import { openDrawer } from './drawer.js';
import { shutdownNow } from './pin-login.js';
import { checkShiftOpen } from './shift.js';

// load the style files
['shell.css'].forEach((file) => {
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = file;
  document.head.appendChild(cssLink);
});

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg(inner) {
  return (
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner +
    '</svg>'
  );
}

const ICON_TABLES = '<path d="M3 8h18M5 8v11M19 8v11M8 8V5h8v3"/>';
const ICON_PAYMENT = '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>';
const ICON_PRINTER =
  '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>';
const ICON_REPORTS = '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>';
const ICON_CANCEL = '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';
const ICON_CLOSING = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 15h4"/>';
const ICON_MENU = '<path d="M4 6h16M4 12h16M4 18h10"/>';
const ICON_LOGOUT = '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>';
const ICON_DASH = '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>';
const ICON_SETTINGS = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';
const ICON_MODS = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
const ICON_CAL = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';
const ICON_CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

function hideAllScreens() {
  document.querySelectorAll('main.screen').forEach((s) => {
    s.hidden = true;
  });
}

function clickById(id) {
  const b = document.getElementById(id);
  if (b) b.click();
}

function findHomeButton(text) {
  return Array.from(document.querySelectorAll('#home-screen .stack button')).find(
    (b) => b.textContent.trim() === text
  );
}

// the old "Reprint receipt" button (made by receipt.js) - we hide it and use the menu instead
function findReprintBtn() {
  return Array.from(document.querySelectorAll('.pay-open-wrap button')).find(
    (b) => b.textContent.trim() === 'Reprint receipt'
  );
}
function hideOldReprint() {
  const b = findReprintBtn();
  if (b) b.style.display = 'none';
}

// Asks only when the order screen is open AND the basket has unsaved items
// (orders.js sets data-dirty = "1" on the order screen when the basket is not empty)
async function leaveOk() {
  const order = document.getElementById('order-screen');
  if (order && !order.hidden && order.dataset.dirty === '1') {
    return await askConfirm({
      title: 'Leave this order?',
      message: 'The items in the basket are not saved yet and will be lost.',
      okText: 'Leave',
      cancelText: 'Stay',
      danger: true,
    });
  }
  return true;
}

const ordersScreenEl = document.getElementById('orders-screen');

// ---------- menu items ----------
// zone: 'top' = pill menu across the top, 'rail' = small icon bar on the left
const ITEMS = [
  { group: 'Main Menu', label: 'Dashboard', zone: 'top', icon: ICON_DASH, ownerOnly: true, screens: ['dashboard-screen'], go: () => document.dispatchEvent(new CustomEvent('kamala:open-dashboard')) },
  { group: 'Main Menu', label: 'Tables', zone: 'top', icon: ICON_TABLES, ownerOnly: false, screens: ['orders-screen', 'order-screen'], go: () => clickById('orders-btn') },
  { group: 'Main Menu', label: 'Payment', zone: 'top', icon: ICON_PAYMENT, ownerOnly: false, screens: ['payment-screen'], go: () => clickById('pay-open-btn') },
  {
    group: 'Main Menu',
    label: 'Reprint receipt', zone: 'top', short: 'Receipts',
    icon: ICON_PRINTER,
    ownerOnly: false,
    screens: ['reprint-screen'],
    go: () => document.dispatchEvent(new CustomEvent('kamala:open-reprint')),
  },
  { group: 'Main Menu', label: 'Shift', zone: 'top', icon: ICON_CLOSING, ownerOnly: false, hideFor: ['waiter'], screens: ['shift-screen'], go: () => document.dispatchEvent(new CustomEvent('kamala:open-shift')) },
  { group: 'Reports', label: 'Sales reports', zone: 'top', short: 'Reports', icon: ICON_REPORTS, ownerOnly: true, screens: ['reports-screen'], go: () => { const b = findHomeButton('Sales reports'); if (b) b.click(); } },
  { group: 'Reports', label: 'Cancelled items', zone: 'rail', icon: ICON_CANCEL, ownerOnly: true, screens: ['cancelled-screen'], go: () => { const b = findHomeButton('Cancelled items'); if (b) b.click(); } },
  { group: 'Management', label: 'Menu management', zone: 'top', short: 'Menu', icon: ICON_MENU, ownerOnly: true, screens: ['menu-screen'], go: () => clickById('menu-btn') },
  { group: 'Management', label: 'Modifiers', zone: 'rail', icon: ICON_MODS, ownerOnly: true, screens: ['modifiers-screen'], go: () => document.dispatchEvent(new CustomEvent('kamala:open-modifiers')) },
  { group: 'Management', label: 'Settings', zone: 'rail', icon: ICON_SETTINGS, ownerOnly: true, screens: ['settings-screen'], go: () => document.dispatchEvent(new CustomEvent('kamala:open-settings')) },
];

async function navigate(item) {
  if (item.popup) {
    item.go();
    return;
  }
  if (!(await leaveOk())) return;
  hideAllScreens();
  item.go();
}

// ---------- brand (top left) ----------
const brand = mk('div', 'side-brand');
const brandLogo = mk('div', 'side-logo', 'K');
brand.appendChild(brandLogo);
const brandText = mk('div', 'side-brand-text');
const brandName = mk('strong', '', 'Demo Restaurant');
brandText.appendChild(brandName);
brandText.appendChild(mk('span', '', 'RESTAURANT POS'));
brand.appendChild(brandText);

// the company logo and name from Settings
function applyBrand() {
  brandName.textContent = SHOP.name || 'Demo Restaurant';
  brandLogo.classList.toggle('has-img', !!SHOP.logo);
  if (SHOP.logo) {
    const im = document.createElement('img');
    im.alt = '';
    im.addEventListener('error', () => { brandLogo.classList.remove('has-img'); brandLogo.textContent = 'K'; });
    im.src = SHOP.logo;
    brandLogo.replaceChildren(im);
  } else {
    brandLogo.textContent = (SHOP.name || 'K').trim().charAt(0).toUpperCase();
  }
}
document.addEventListener('kamala:shop-changed', applyBrand);
applyBrand();

// ---------- pill menu (top) and icon bar (left) ----------
const nav = mk('nav', 'side-nav vb-nav');
const railNav = mk('div', 'vb-rail-nav');
const groupLabels = [];
ITEMS.forEach((item) => {
  const b = mk('button', 'side-item');
  b.type = 'button';
  b.title = item.label;
  b.innerHTML = svg(item.icon);
  b.appendChild(mk('span', '', item.short || item.label));
  b.hidden = item.ownerOnly; // owner items appear once we know the role
  b.addEventListener('click', () => navigate(item));
  item.btn = b;
  (item.zone === 'rail' ? railNav : nav).appendChild(b);
});

// the left icon bar (a slim floating pill)
const sidebar = mk('aside', 'app-sidebar vb-rail');

const logoutBtn = mk('button', 'side-item side-logout');
logoutBtn.type = 'button';
logoutBtn.title = 'Shut down';
logoutBtn.innerHTML = svg(ICON_LOGOUT);
logoutBtn.appendChild(mk('span', '', 'Shutdown'));
// Shutdown only works after the shift is closed
logoutBtn.addEventListener('click', async () => {
  if (!(await leaveOk())) return;
  let open = false;
  try {
    open = await checkShiftOpen();
  } catch (e) {
    open = false;
  }
  if (open) {
    const goShift = await askConfirm({
      title: 'Close the shift first',
      message: 'The shift is still open. Close the shift, then you can shut down.',
      okText: 'Go to Shift page',
      cancelText: 'Cancel',
    });
    if (goShift) {
      const it = ITEMS.find((i) => i.label === 'Shift');
      if (it && !it.btn.hidden) navigate(it);
    }
    return;
  }
  const yes = await askConfirm({ title: 'Shut down?', message: 'The system will lock and ask for a PIN next time.', okText: 'Shut down', cancelText: 'Cancel', danger: true });
  if (!yes) return;
  hideAllScreens();
  await shutdownNow();
});

logoutBtn.classList.add('vb-rail-end');
sidebar.append(railNav, logoutBtn);

// Alt+F4 / Ctrl+W are turned into the F15 key by the small AutoHotkey script on the counter computer.
// F15 does exactly what the Shutdown button does (so the same "Close the shift first" message shows).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'F15') return;
  e.preventDefault();
  if (!document.body.classList.contains('has-shell') || document.body.classList.contains('pin-open')) return;
  logoutBtn.click();
});

// ---------- top bar ----------
const topbar = mk('header', 'app-topbar');

const titleBox = mk('div', 'top-title');
const titleEl = mk('h1', '', '');
const subEl = mk('p', 'top-sub', '');
titleBox.append(titleEl, subEl);

const right = mk('div', 'top-right');

const dateChip = mk('div', 'top-chip chip-date');
dateChip.innerHTML = svg(ICON_CAL).replace('width="22" height="22"', 'width="18" height="18"');
const dateText = mk('span', '', '');
dateChip.appendChild(dateText);

const timeChip = mk('div', 'top-chip');
timeChip.innerHTML = svg(ICON_CLOCK).replace('width="22" height="22"', 'width="18" height="18"');
const timeText = mk('span', '', '');
timeChip.appendChild(timeText);

const userBox = mk('div', 'top-user');
const avatar = mk('div', 'top-avatar', '?');
const userText = mk('div', 'top-user-text');
const userName = mk('strong', '', '');
const userRole = mk('span', '', '');
userText.append(userName, userRole);
userBox.append(avatar, userText);

const drawerBtn = mk('button', 'top-drawer');
drawerBtn.type = 'button';
drawerBtn.title = 'Open the cash drawer';
drawerBtn.innerHTML =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="9" width="20" height="11" rx="2"/><path d="M5 9V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4M10 14h4"/></svg>';
drawerBtn.appendChild(mk('span', '', 'Open drawer'));
drawerBtn.addEventListener('click', openDrawer);

// "More" button (phone only): opens the small icon bar as a drop-down list
const ICON_MORE = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
const moreBtn = mk('button', 'top-more');
moreBtn.type = 'button';
moreBtn.title = 'More';
moreBtn.setAttribute('aria-label', 'More');
moreBtn.innerHTML = svg(ICON_MORE).replace('width="22" height="22"', 'width="20" height="20"');
function setMore(open) {
  document.body.classList.toggle('vb-more-open', open);
  moreBtn.classList.toggle('active', open);
}
moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMore(!document.body.classList.contains('vb-more-open'));
});
// close the list when you tap anywhere else, press a list item, or press Esc
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('vb-more-open')) return;
  if (sidebar.contains(e.target) && !e.target.closest('button')) return;
  setMore(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMore(false);
});

right.append(drawerBtn, dateChip, timeChip, userBox, moreBtn);
titleBox.classList.add('vb-title');
topbar.append(brand, nav, right);
document.body.append(sidebar, topbar, titleBox);

// ---------- date and time ----------
function tick() {
  const now = new Date();
  dateText.textContent = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  timeText.textContent = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
  });
}
tick();
setInterval(tick, 20000);

// ---------- page title and highlighted menu item ----------
const PAGES = {
  'orders-screen': ['Table Management', 'Manage restaurant tables and orders'],
  'order-screen': [null, 'Add items and save the order'],
  'payment-screen': ['Payment', 'Tick the orders being paid'],
  'reprint-screen': ['Reprint receipt', 'Find any past receipt and print it again'],
  'dashboard-screen': ['Dashboard', "Today's sales at a glance"],
  'modifiers-screen': ['Modifiers', 'Options for dishes: spice, sugar, extras'],
  'settings-screen': ['Settings', 'Shop details, receipt and payment QR'],
  'menu-screen': ['Menu Management', 'Manage your food and beverage items'],
  'reports-screen': ['Sales reports', 'Day, week, month and year'],
  'cancelled-screen': ['Cancelled items', 'Items cancelled by staff'],
  'shift-screen': ['Shift', 'Open, cash in/out and close the shift'],
  'home-screen': ['Home', ''],
};

function refreshPage() {
  const visible = document.querySelector('main.screen:not([hidden])');
  const id = visible ? visible.id : '';
  const info = PAGES[id];
  if (info) {
    const orderTitle = document.getElementById('order-title');
    titleEl.textContent = info[0] || (orderTitle ? orderTitle.textContent : 'Order');
    subEl.textContent = info[1];
  }
  ITEMS.forEach((item) => item.btn.classList.toggle('active', item.screens.includes(id)));
  // big page title under the top bar (not on the order and payment pages, which need the space)
  const titled = !!info && id !== 'order-screen' && id !== 'payment-screen' && id !== 'home-screen';
  document.body.classList.toggle('vb-titled', titled);
  document.body.dataset.vbPage = id;
}

// ---------- show the menu only when logged in ----------
let shellOn = false;
const themeToggle = document.getElementById('theme-toggle');

function maybeGoTables() {
  const home = document.getElementById('home-screen');
  if (shellOn && home && !home.hidden) {
    hideAllScreens();
    clickById('orders-btn');
  }
}

function setShell(on) {
  shellOn = on;
  document.body.classList.toggle('has-shell', on);
  if (themeToggle) {
    if (on && themeToggle.parentNode !== right) {
      right.insertBefore(themeToggle, userBox);
      themeToggle.classList.add('in-topbar');
    } else if (!on && themeToggle.parentNode !== document.body) {
      document.body.appendChild(themeToggle);
      themeToggle.classList.remove('in-topbar');
    }
  }
  if (on) {
    hideOldReprint();
    refreshPage();
    maybeGoTables();
  }
}

async function refreshSession() {
  const s = await supabase.auth.getSession();
  const user = s.data && s.data.session ? s.data.session.user : null;
  setShell(!!user);
  if (!user) return;

  const p = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
  const role = p.data && p.data.role ? p.data.role : '';
  const name = (p.data && p.data.full_name) || user.email || 'Staff';
  userName.textContent = name;
  userRole.textContent = role.toUpperCase();
  avatar.textContent = name.trim().charAt(0).toUpperCase();
  ITEMS.forEach((item) => {
    item.btn.hidden = (item.ownerOnly && role !== 'owner') || (item.hideFor && item.hideFor.includes(role));
  });
  groupLabels.forEach((lab) => {
    lab.hidden = !ITEMS.some((i) => i.group === lab.dataset.group && !i.btn.hidden);
  });
}

new MutationObserver(() => {
  hideOldReprint();
  refreshPage();
  maybeGoTables();
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

supabase.auth.onAuthStateChange(() => {
  setTimeout(refreshSession, 0);
});
refreshSession();