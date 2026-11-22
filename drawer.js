// Cash drawer: the drawer is plugged into the receipt printer.
// Opening it = sending a tiny blank slip to the receipt printer. The printer driver
// (Windows "Printing Preferences > Open cash drawer") turns that into the drawer "kick".
import { el } from './common.js';

const KEY = 'kamala_drawer_auto';

export function drawerAutoOn() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function setDrawerAuto(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch (e) {
    /* ignore */
  }
}

export function openDrawer() {
  let box = document.getElementById('receipt');
  if (!box) {
    box = document.createElement('div');
    box.id = 'receipt';
    document.body.appendChild(box);
  }
  const slip = el('div', 'drawer-slip', ' ');
  box.replaceChildren(slip);
  window.print();
}

// called after a CASH payment is saved
export function drawerAfterCashPayment() {
  if (drawerAutoOn()) setTimeout(openDrawer, 300);
}
