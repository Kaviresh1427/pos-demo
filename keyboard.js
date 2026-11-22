// Glass on-screen keyboard (letters + numbers) for every search box.
// It appears when a search box is tapped. Add data-kbd="off" to a box to skip it.
if (!document.getElementById('keyboard-css')) {
  const link = document.createElement('link');
  link.id = 'keyboard-css';
  link.rel = 'stylesheet';
  link.href = 'keyboard.css';
  document.head.appendChild(link);
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];

let kb = null; // the open keyboard: { input, shift, timer }
let ui = null;

function isSearchBox(el) {
  if (!el || el.tagName !== 'INPUT' || el.readOnly || el.disabled) return false;
  if (el.dataset.kbd === 'off' || el.closest('#pin-screen')) return false;
  if (el.dataset.kbd === 'on') return true;
  return el.type === 'search' || /search/i.test(el.id + ' ' + el.className) || /^search/i.test(el.placeholder || '');
}

const ICON_BACK =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9-5 6M11 9l5 6"/></svg>';
const ICON_SHIFT =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 4 13h4.5v6h7v-6H20z"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function mkBtn(cls, html) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = html;
  return b;
}

function build() {
  const root = document.createElement('div');
  root.className = 'kb-pad';
  root.hidden = true;
  root.setAttribute('role', 'dialog');

  const head = document.createElement('div');
  head.className = 'kb-head';
  const title = document.createElement('span');
  title.className = 'kb-title';
  const x = mkBtn('kb-x', ICON_X);
  x.setAttribute('aria-label', 'Close keyboard');
  head.append(title, x);
  root.appendChild(head);

  const letterEls = [];
  const rows = document.createElement('div');
  rows.className = 'kb-rows';
  ROWS.forEach((row, ri) => {
    const r = document.createElement('div');
    r.className = 'kb-row kb-row-' + ri;
    row.forEach((k) => {
      let b;
      if (k === 'shift') {
        b = mkBtn('kb-key kb-fn kb-shift', ICON_SHIFT);
        b.setAttribute('aria-label', 'Capital letters');
      } else if (k === 'back') {
        b = mkBtn('kb-key kb-fn kb-back', ICON_BACK);
        b.setAttribute('aria-label', 'Backspace');
      } else {
        b = mkBtn('kb-key', k);
        if (/[a-z]/.test(k)) letterEls.push(b);
      }
      b.dataset.k = k;
      r.appendChild(b);
    });
    rows.appendChild(r);
  });
  const bottom = document.createElement('div');
  bottom.className = 'kb-row kb-bottom';
  const clear = mkBtn('kb-key kb-fn kb-wide', 'Clear');
  clear.dataset.k = 'clear';
  const space = mkBtn('kb-key kb-space', 'space');
  space.dataset.k = ' ';
  const done = mkBtn('kb-key kb-done', 'Done');
  done.dataset.k = 'done';
  bottom.append(clear, space, done);
  rows.appendChild(bottom);
  root.appendChild(rows);
  document.body.appendChild(root);

  // never take the focus away from the search box
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !kb) return;
    if (b === x) return closeKb();
    press(b.dataset.k);
  });
  return { root, title, letterEls, shiftBtn: root.querySelector('.kb-shift') };
}

function fire(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function paintShift() {
  ui.shiftBtn.classList.toggle('on', !!kb.shift);
  ui.letterEls.forEach((b) => (b.textContent = kb.shift ? b.dataset.k.toUpperCase() : b.dataset.k));
}

function press(k) {
  if (!kb) return;
  const input = kb.input;
  if (k === 'done') return closeKb();
  if (k === 'shift') {
    kb.shift = !kb.shift;
    return paintShift();
  }
  if (k === 'clear') {
    input.value = '';
    return fire(input);
  }
  const a = input.selectionStart ?? input.value.length;
  const b = input.selectionEnd ?? a;
  if (k === 'back') {
    if (a !== b) input.setRangeText('', a, b, 'end');
    else if (a > 0) input.setRangeText('', a - 1, a, 'end');
    return fire(input);
  }
  const ch = kb.shift && /[a-z]/.test(k) ? k.toUpperCase() : k;
  input.setRangeText(ch, a, b, 'end');
  if (kb.shift) {
    kb.shift = false;
    paintShift();
  }
  fire(input);
}

function openKb(input) {
  if (kb && kb.input === input) return;
  if (!ui) ui = build();
  if (kb) closeKb();
  if (input.getAttribute('inputmode') !== 'none') input.setAttribute('inputmode', 'none'); // no phone keyboard
  kb = { input, shift: false };
  ui.title.textContent = (input.placeholder || 'Search').replace(/\.\.\.$/, '');
  paintShift();
  ui.root.hidden = false;
  ui.root.classList.remove('kb-in');
  void ui.root.offsetWidth;
  ui.root.classList.add('kb-in');
  kb.timer = setInterval(() => {
    // close when the box disappears (another page was opened)
    if (!kb) return;
    const i = kb.input;
    if (!document.body.contains(i) || i.offsetParent === null) closeKb();
  }, 300);
}

function closeKb() {
  if (!kb) return;
  clearInterval(kb.timer);
  kb = null;
  if (ui) ui.root.hidden = true;
}

document.addEventListener('focusin', (e) => {
  if (isSearchBox(e.target)) openKb(e.target);
  else if (kb && !(ui && ui.root.contains(e.target))) closeKb();
});
document.addEventListener('click', (e) => {
  if (isSearchBox(e.target)) openKb(e.target);
});
document.addEventListener('pointerdown', (e) => {
  if (!kb) return;
  if (ui.root.contains(e.target) || e.target === kb.input) return;
  closeKb();
});
document.addEventListener(
  'keydown',
  (e) => {
    if (kb && e.target === kb.input && (e.key === 'Escape' || e.key === 'Enter')) closeKb();
  },
  true
);
