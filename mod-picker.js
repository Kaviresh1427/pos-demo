// The choice pop-up on the order page: the waiter taps the options for a dish (Spice level, Hot / Iced ...).
import { el, money } from './common.js';
import { modsPrice } from './mod-core.js';

for (const [id, href] of [['split-bill-css', 'split-bill.css'], ['modifiers-css', 'modifiers.css']]) {
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

// opts: { name, basePrice, groups, preset: [{g, n, p}] }  ->  resolves with [{g, n, p}] (may be empty) or null when cancelled
export function pickModifiers(opts) {
  return new Promise((resolve) => {
    const groups = opts.groups || [];
    const picked = new Map(); // group id -> Set of option ids
    groups.forEach((g) => picked.set(g.id, new Set()));
    (opts.preset || []).forEach((m) => {
      groups.forEach((g) => g.options.forEach((o) => {
        if (g.name === m.g && o.name === m.n) picked.get(g.id).add(o.id);
      }));
    });

    const back = el('div', 'sb-back mp-back');
    const modal = el('div', 'sb-modal mp-modal');
    modal.setAttribute('role', 'dialog');
    back.appendChild(modal);
    document.body.appendChild(back);

    let finished = false;
    function done(value) {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      }
    }
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) done(null);
    });

    const head = el('div', 'sb-head');
    const titles = el('div', 'sb-titles');
    titles.append(el('h3', '', opts.name), el('p', '', 'Choose the options'));
    const x = el('button', 'sb-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', () => done(null));
    head.append(titles, x);
    modal.appendChild(head);

    const body = el('div', 'mp-body');
    modal.appendChild(body);

    const foot = el('div', 'mp-foot');
    const priceBox = el('div', 'mp-price');
    const priceLabel = el('span', '', 'Price');
    const priceVal = el('strong', '', '');
    priceBox.append(priceLabel, priceVal);
    const msg = el('p', 'mp-missing', '');
    const addBtn = el('button', 'sb-paybtn mp-add', 'Add to order');
    addBtn.type = 'button';
    foot.append(priceBox, msg, addBtn);
    modal.appendChild(foot);

    const chipEls = new Map(); // option id -> button

    groups.forEach((g) => {
      const box = el('section', 'mp-group');
      const top = el('div', 'mp-gtop');
      top.appendChild(el('strong', '', g.name));
      top.appendChild(el('span', 'mp-tag' + (g.required ? ' req' : ''), (g.required ? 'Required' : 'Optional') + ' · ' + (g.multi ? 'pick any' : 'pick one')));
      box.appendChild(top);
      const row = el('div', 'mp-chips');
      g.options.forEach((o) => {
        const b = el('button', 'mp-chip');
        b.type = 'button';
        b.appendChild(el('span', 'mp-cname', o.name));
        if (o.price > 0) b.appendChild(el('small', '', '+' + money(o.price)));
        b.addEventListener('click', () => {
          const set = picked.get(g.id);
          if (g.multi) {
            if (set.has(o.id)) set.delete(o.id);
            else set.add(o.id);
          } else if (set.has(o.id)) {
            set.delete(o.id); // tap again to un-pick (a required group then asks again)
          } else {
            set.clear();
            set.add(o.id);
          }
          refresh();
        });
        chipEls.set(o.id, b);
        row.appendChild(b);
      });
      box.appendChild(row);
      body.appendChild(box);
    });

    function chosen() {
      const out = [];
      groups.forEach((g) => g.options.forEach((o) => {
        if (picked.get(g.id).has(o.id)) out.push({ g: g.name, n: o.name, p: o.price });
      }));
      return out;
    }
    function refresh() {
      groups.forEach((g) => g.options.forEach((o) => chipEls.get(o.id).classList.toggle('on', picked.get(g.id).has(o.id))));
      const list = chosen();
      priceVal.textContent = money(Number(opts.basePrice) + modsPrice(list));
      const missing = groups.filter((g) => g.required && picked.get(g.id).size === 0);
      addBtn.disabled = missing.length > 0;
      msg.textContent = missing.length ? 'Choose: ' + missing.map((g) => g.name).join(', ') : '';
      msg.hidden = missing.length === 0;
    }
    addBtn.addEventListener('click', () => {
      if (!addBtn.disabled) done(chosen());
    });
    refresh();
  });
}
