// PIN login: a small pop-up with the restaurant logo on the left and a 4-digit PIN pad on the right.
// - Without the PIN nobody can use the system.
// - The PIN belongs to one staff account (see pins.sql).
// - If pins.sql was NOT run yet, the old email/password login is used instead (so nobody gets locked out).
import { supabase, el } from './common.js';
import { DEMO_LOGO } from './demo-seed.js';

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'pin-login.css' }));

const PIN_SUFFIX = '-demo'; // DEMO: any password works in the demo database
const OK_KEY = 'kamala_pin_user';
const WHATSAPP_TEXT = '+60 11-6397 5503';
const WHATSAPP_LINK = 'https://wa.me/601163975503';

let fallback = false; // true when pins.sql has not been run
let unlocked = false;
let waitingShift = false;
let currentRole = '';
let digits = '';
let busy = false;
let lastActivity = Date.now();
const IDLE_MS = window.__IDLE_MS || 5 * 60 * 1000; // auto-lock after 5 minutes without use

// ---------- build the pop-up ----------
const root = el('div', 'pin-screen');
root.id = 'pin-screen';

const card = el('div', 'pin-card');

const brand = el('div', 'pin-brand');
const logo = document.createElement('img');
logo.className = 'pin-logo';
logo.src = DEMO_LOGO;
logo.alt = 'Demo Restaurant';
brand.append(logo, el('h1', '', 'Demo Restaurant'), el('p', 'pin-sub', 'RESTAURANT POS'));

const pad = el('div', 'pin-pad');
pad.append(el('h2', '', 'Enter your PIN'));
const dots = el('div', 'pin-dots');
for (let i = 0; i < 4; i++) dots.appendChild(el('span', 'pin-dot'));
const msg = el('p', 'pin-msg', '');
const keys = el('div', 'pin-keys');

function keyBtn(label, cls, handler) {
  const b = el('button', 'pin-key ' + (cls || ''), label);
  b.type = 'button';
  b.addEventListener('click', handler);
  return b;
}
['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((d) => keys.appendChild(keyBtn(d, '', () => press(d))));
keys.appendChild(keyBtn('Clear', 'pin-key-small', clearAll));
keys.appendChild(keyBtn('0', '', () => press('0')));
const back = keyBtn('⌫', 'pin-key-small', backspace);
back.setAttribute('aria-label', 'Delete');
keys.appendChild(back);
pad.append(dots, msg, keys);

card.append(brand, pad);

const foot = el('div', 'pin-foot');
foot.appendChild(el('div', 'pin-powered', 'Powered by Sarvesh Computer Enterprise'));
const help = el('div', 'pin-help');
help.appendChild(document.createTextNode('Any problem with this system? WhatsApp '));
const wa = document.createElement('a');
wa.href = WHATSAPP_LINK;
wa.target = '_blank';
wa.rel = 'noopener';
wa.textContent = WHATSAPP_TEXT;
help.appendChild(wa);
foot.appendChild(help);

root.append(card, foot);
document.body.appendChild(root);

// ---------- show / hide ----------
function showPad() {
  root.hidden = false;
  document.body.classList.add('pin-open');
}
function hidePad() {
  root.hidden = true;
  document.body.classList.remove('pin-open');
}

function renderDots() {
  Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i < digits.length));
}
function setMsg(text, bad) {
  msg.textContent = text;
  msg.classList.toggle('bad', !!bad);
}
function resetPad() {
  digits = '';
  renderDots();
}

function clearAll() {
  if (busy) return;
  resetPad();
  setMsg('', false);
}
function backspace() {
  if (busy) return;
  digits = digits.slice(0, -1);
  renderDots();
}
function press(d) {
  if (busy || digits.length >= 4) return;
  goFullscreen(); // the first key press counts as a user action, so full screen is allowed
  setMsg('', false);
  digits += d;
  renderDots();
  if (digits.length === 4) submit();
}

document.addEventListener('keydown', (e) => {
  if (root.hidden) return;
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    press(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    backspace();
  } else if (e.key === 'Escape' || e.key === 'Delete') {
    clearAll();
  }
});

function wrong(text) {
  setMsg(text, true);
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
  resetPad();
}

// ---------- sign in ----------
async function submit() {
  busy = true;
  const pin = digits;
  setMsg('Checking...', false);
  try {
    const r = await supabase.rpc('pin_lookup', { p_pin: pin });
    if (r.error) {
      const t = String(r.error.message || '');
      if (/could not find the function|pin_lookup/i.test(t) && !/too many/i.test(t)) {
        await useFallback();
        busy = false;
        return;
      }
      wrong(t.replace(/^.*?:\s*/, '') || 'Could not check the PIN.');
      busy = false;
      return;
    }
    const email = r.data;
    if (!email) {
      wrong('Wrong PIN. Try again.');
      busy = false;
      return;
    }
    const cur = await supabase.auth.getSession();
    const curUser = cur.data && cur.data.session ? cur.data.session.user : null;
    let session = cur.data ? cur.data.session : null;
    if (!curUser || String(curUser.email).toLowerCase() !== String(email).toLowerCase()) {
      if (curUser) await supabase.auth.signOut();
      const s = await supabase.auth.signInWithPassword({ email, password: pin + PIN_SUFFIX });
      if (s.error) {
        wrong('This PIN could not sign in. Ask the owner to set it again.');
        busy = false;
        return;
      }
      session = s.data.session;
    }
    await loadRole(session.user.id);
    try {
      sessionStorage.setItem(OK_KEY, session.user.id);
    } catch (e) {
      /* ignore */
    }
    unlocked = true;
    lastActivity = Date.now();
    resetPad();
    setMsg('', false);
    keepFullscreen();
    if (curUser && String(curUser.email).toLowerCase() === String(email).toLowerCase()) {
      // same person after an auto-lock: just open the screen again, nothing is lost
      hidePad();
      busy = false;
      return;
    }
    // let app.js show the home page for this user, then wait for the shift check before hiding the pad
    waitingShift = true;
    document.dispatchEvent(new CustomEvent('kamala:pin-session', { detail: session }));
    setTimeout(finishUnlock, 3000);
  } catch (e) {
    wrong('Something went wrong: ' + (e.message || e));
  }
  busy = false;
}

function finishUnlock() {
  if (!waitingShift) return;
  waitingShift = false;
  hidePad();
}
document.addEventListener('kamala:shift-checked', finishUnlock);

async function loadRole(userId) {
  try {
    const p = await supabase.from('profiles').select('role').eq('id', userId).single();
    currentRole = p.data && p.data.role ? p.data.role : '';
  } catch (e) {
    currentRole = '';
  }
}

// pins.sql was not run: use the old email/password login so nobody is locked out
async function useFallback() {
  fallback = true;
  document.body.classList.add('pin-fallback');
  hidePad();
  const s = await supabase.auth.getSession();
  if (s.data && s.data.session) {
    try {
      sessionStorage.setItem(OK_KEY, s.data.session.user.id);
    } catch (e) {
      /* ignore */
    }
    unlocked = true;
  }
}

// ---------- full screen (hides the title bar and the Windows taskbar) ----------
function goFullscreen() {
  return; // DEMO: never force full screen on a website visitor
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (e) {
    /* ignore */
  }
}
function keepFullscreen() {
  return; // DEMO
  // for waiters and cashiers: Esc is held back, so full screen stays on
  if (currentRole !== 'owner') {
    try {
      if (navigator.keyboard && navigator.keyboard.lock && document.fullscreenElement) {
        navigator.keyboard.lock(['Escape']).catch(() => {});
      }
    } catch (e) {
      /* ignore */
    }
  }
}
document.addEventListener('pointerdown', () => {
  if (unlocked && !fallback && currentRole && currentRole !== 'owner' && !document.fullscreenElement) {
    goFullscreen();
    setTimeout(keepFullscreen, 400);
  }
});

// ---------- auto-lock after 5 minutes without use ----------
function touch() {
  lastActivity = Date.now();
}
['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'].forEach((ev) => document.addEventListener(ev, touch, { passive: true }));

function lockNow() {
  try {
    sessionStorage.removeItem(OK_KEY);
  } catch (e) {
    /* ignore */
  }
  unlocked = false;
  resetPad();
  setMsg('Locked. Enter your PIN to continue.', false);
  showPad();
}
setInterval(() => {
  if (unlocked && !fallback && root.hidden && Date.now() - lastActivity > IDLE_MS) lockNow();
}, Math.min(15000, Math.max(500, IDLE_MS / 2)));

// ---------- shut down (only called when the shift is closed) ----------
export async function shutdownNow() {
  try {
    sessionStorage.removeItem(OK_KEY);
  } catch (e) {
    /* ignore */
  }
  unlocked = false;
  currentRole = '';
  try {
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch (e) {
    /* ignore */
  }
  await supabase.auth.signOut();
  document.dispatchEvent(new CustomEvent('kamala:pin-session', { detail: null }));
  resetPad();
  setMsg('', false);
  if (!fallback) showPad();
  try {
    window.close(); // closes the installed app window (browsers may refuse; the PIN pad then stays)
  } catch (e) {
    /* ignore */
  }
}

export function pinFallbackActive() {
  return fallback;
}

// ---------- start-up ----------
showPad();
(async () => {
  let session = null;
  try {
    const s = await supabase.auth.getSession();
    session = s.data ? s.data.session : null;
  } catch (e) {
    session = null;
  }
  let ok = false;
  try {
    ok = !!session && sessionStorage.getItem(OK_KEY) === session.user.id;
  } catch (e) {
    ok = false;
  }
  if (ok) {
    unlocked = true;
    await loadRole(session.user.id);
    hidePad();
  }
})();

// closing the window (Alt+F4, X, reload) while a shift is open: the browser asks first
export function setCloseGuard(getOpen) {
  window.addEventListener('beforeunload', (e) => {
    if (unlocked && !fallback && getOpen()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
