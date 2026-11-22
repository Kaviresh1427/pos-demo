// Glass number pad for every amount / number box in the system.
// Money boxes work like a bank terminal: digits slide in from the right (5, 0, 0 = 5.00).
// Add data-numpad="off" to a box to skip it. data-numpad="int" = whole numbers, "tel" = phone number.

if (!document.getElementById('numpad-css')) {
  const link = document.createElement('link');
  link.id = 'numpad-css';
  link.rel = 'stylesheet';
  link.href = 'numpad.css';
  document.head.appendChild(link);
}

const MAX_CENTS_DIGITS = 7; // up to 99,999.99
let pad = null; // the open pad: { input, mode, cents, text, els }

function autoMode(input) {
  const im = (input.dataset.npAuto || input.getAttribute('inputmode') || '').toLowerCase();
  if (im === 'tel') return 'tel';
  return 'money';
}

function modeOf(input) {
  const m = input.dataset.numpad;
  if (m === 'money' || m === 'int' || m === 'tel') return m;
  return autoMode(input);
}

function isEligible(el) {
  if (!el || el.tagName !== 'INPUT') return false;
  if (el.readOnly || el.disabled) return false;
  if (el.dataset.numpad === 'off' || el.id === 'pay-cash-input') return false;
  if (el.closest('#pin-screen')) return false;
  if (el.dataset.npAuto) return true;
  const im = (el.getAttribute('inputmode') || '').toLowerCase();
  if (im === 'numeric' || im === 'decimal' || im === 'tel' || el.dataset.numpad) {
    el.dataset.npAuto = im || 'numeric';
    el.setAttribute('inputmode', 'none'); // no phone keyboard, our pad is used instead
    return true;
  }
  return false;
}

const fmt = (cents) => (cents / 100).toFixed(2);

function titleOf(input, mode) {
  if (input.dataset.npTitle) return input.dataset.npTitle;
  let t = '';
  if (input.id) {
    const lab = document.querySelector('label[for="' + input.id + '"]');
    if (lab) t = lab.textContent.trim();
  }
  if (!t) {
    const wrap = input.closest('.sh-open, .sh-move-form, .sh-close, .op-cash, .pay-discount-box, .op-disc-box, .money-field, label');
    const lab = wrap && (wrap.matches('label') ? wrap : wrap.querySelector('label, .sh-label, h3'));
    if (lab && !lab.contains(input)) t = lab.textContent.trim();
  }
  if (!t && input.placeholder && !/^[\d.,\s]+$/.test(input.placeholder)) t = input.placeholder;
  if (!t) t = mode === 'tel' ? 'Phone number' : mode === 'int' ? 'Number' : 'Amount';
  return t.length > 44 ? t.slice(0, 42) + '...' : t;
}

// ---------- build the pad (once) ----------
function build() {
  const root = document.createElement('div');
  root.className = 'np-pad';
  root.setAttribute('role', 'dialog');

  const head = document.createElement('div');
  head.className = 'np-head';
  const titles = document.createElement('div');
  titles.className = 'np-titles';
  const title = document.createElement('div');
  title.className = 'np-title';
  const hint = document.createElement('div');
  hint.className = 'np-hint';
  titles.append(title, hint);
  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'np-x';
  xBtn.setAttribute('aria-label', 'Cancel');
  xBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(titles, xBtn);
  const screen = document.createElement('div');
  screen.className = 'np-screen';
  const unitL = document.createElement('span');
  unitL.className = 'np-unit np-unit-l';
  const val = document.createElement('span');
  val.className = 'np-val';
  const unitR = document.createElement('span');
  unitR.className = 'np-unit np-unit-r';
  screen.append(unitL, val, unitR);

  const keys = document.createElement('div');
  keys.className = 'np-keys';
  const layout = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'x', '0', 'back'];
  const keyEls = {};
  layout.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'np-key';
    b.dataset.k = k;
    if (k === 'back') {
      b.classList.add('np-key-fn');
      b.innerHTML =
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9-5 6M11 9l5 6"/></svg>';
      b.setAttribute('aria-label', 'Backspace');
    } else {
      b.textContent = k;
    }
    keyEls[k] = b;
    keys.appendChild(b);
  });

  const foot = document.createElement('div');
  foot.className = 'np-foot';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'np-btn np-clear';
  clear.textContent = 'Clear';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'np-btn np-ok';
  ok.textContent = 'OK';
  foot.append(clear, ok);

  root.append(head, screen, keys, foot);
  const back = document.createElement('div');
  back.className = 'np-back';
  back.hidden = true;
  back.appendChild(root);
  document.body.appendChild(back);
  // tap outside the pad: close and keep the value
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) closePad();
  });
  xBtn.addEventListener('click', () => cancelPad());

  // never take the focus away from the box
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  keys.addEventListener('click', (e) => {
    const b = e.target.closest('.np-key');
    if (!b || !pad) return;
    press(b.dataset.k);
  });
  clear.addEventListener('click', () => pad && press('clear'));
  ok.addEventListener('click', () => closePad());

  return { back, root, title, hint, val, unitL, unitR, keyEls };
}

let ui = null;

// ---------- value handling ----------
function readStart(input, mode) {
  const raw = (input.value || '').trim();
  if (input.dataset.npFresh) return 0; // a pre-filled box (like a full refund) starts again from zero
  if (mode === 'money') {
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? Math.min(Math.round(n * 100), 10 ** MAX_CENTS_DIGITS - 1) : 0;
  }
  return 0;
}

function paint() {
  if (!pad) return;
  const { mode } = pad;
  if (mode === 'money') ui.val.textContent = fmt(pad.cents);
  else ui.val.textContent = pad.text === '' ? '0' : pad.text;
}

function write() {
  const { input, mode } = pad;
  let v;
  if (mode === 'money') {
    v = pad.cents === 0 && input.dataset.npEmpty === '1' ? '' : fmt(pad.cents);
  } else {
    v = pad.text;
  }
  if (input.value !== v) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  paint();
}

function press(k) {
  if (!pad) return;
  const { mode } = pad;
  if (mode === 'money') {
    if (k === 'clear') pad.cents = 0;
    else if (k === 'back') pad.cents = Math.floor(pad.cents / 10);
    else if (/^\d$/.test(k)) {
      const next = (pad.cents > 0 ? String(pad.cents) : '') + k;
      if (next.length <= MAX_CENTS_DIGITS) pad.cents = Number(next);
    } else if (k === 'x') {
      const next = (pad.cents > 0 ? String(pad.cents) : '') + '00';
      if (next.length <= MAX_CENTS_DIGITS) pad.cents = Number(next);
    }
  } else if (mode === 'int') {
    if (k === 'clear') pad.text = '';
    else if (k === 'back') pad.text = pad.text.slice(0, -1);
    else if (/^\d$/.test(k) && pad.text.length < 3) pad.text = (pad.text + k).replace(/^0+(?=\d)/, '');
  } else {
    if (k === 'clear') pad.text = '';
    else if (k === 'back') pad.text = pad.text.slice(0, -1);
    else if ((/^\d$/.test(k) || k === 'x') && pad.text.length < 16) pad.text += k === 'x' ? '+' : k;
  }
  write();
}

// ---------- open / close / position ----------
function openPad(input) {
  if (pad && pad.input === input) return;
  if (!ui) ui = build();
  if (pad) closePad();
  if (input.dataset.npEmpty === undefined) input.dataset.npEmpty = input.value.trim() === '' ? '1' : '0';
  const mode = modeOf(input);
  pad = { input, mode, cents: readStart(input, mode), text: mode === 'money' ? '' : (input.value || '').replace(/[^\d+]/g, '') };
  ui.title.textContent = titleOf(input, mode);
  ui.unitL.textContent = mode === 'money' ? 'RM' : '';
  ui.unitR.textContent = mode === 'int' ? '%' : '';
  ui.unitR.hidden = mode !== 'int';
  const x = ui.keyEls.x;
  x.textContent = mode === 'tel' ? '+' : mode === 'money' ? '00' : '';
  x.disabled = mode === 'int';
  x.classList.toggle('np-key-off', mode === 'int');
  ui.hint.textContent = input.dataset.npHint || '';
  ui.hint.hidden = !ui.hint.textContent;
  pad.orig = input.value;
  ui.back.hidden = false;
  ui.root.classList.remove('np-in');
  void ui.root.offsetWidth;
  ui.root.classList.add('np-in');
  paint();
  pad.timer = setInterval(() => {
    // close when the box disappears (a pop-up was closed, the page changed)
    if (!pad) return;
    const i = pad.input;
    if (!document.body.contains(i) || i.offsetParent === null) closePad();
  }, 300);
}

function closePad() {
  if (!pad) return;
  clearInterval(pad.timer);
  pad = null;
  if (ui) ui.back.hidden = true;
}

// X button: put the old value back and close
function cancelPad() {
  if (!pad) return;
  const { input, orig } = pad;
  if (input.value !== orig) {
    input.value = orig;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  closePad();
}

// ---------- wiring (works for boxes created later too) ----------
document.addEventListener('focusin', (e) => {
  if (isEligible(e.target)) openPad(e.target);
  else if (pad && !(ui && ui.root.contains(e.target))) closePad();
});
document.addEventListener('click', (e) => {
  if (isEligible(e.target)) openPad(e.target);
});
document.addEventListener('pointerdown', (e) => {
  if (!pad) return;
  if (ui.root.contains(e.target) || e.target === pad.input) return;
  closePad();
});

// physical keyboard: same bank style for every amount box
document.addEventListener(
  'keydown',
  (e) => {
    if (!pad || e.target !== pad.input) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      cancelPad();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      closePad();
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      press('back');
    } else if (e.key === '+' && pad.mode === 'tel') {
      e.preventDefault();
      press('x');
    } else if (e.key.length === 1) {
      e.preventDefault(); // letters and symbols are not allowed in these boxes
    }
  },
  true
);
