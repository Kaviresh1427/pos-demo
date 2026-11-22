// Modifiers page (owner only): make option groups once (Spice level, Hot / Iced, Extras ...),
// then tick which menu items use them. The cashier sees the choices when tapping those dishes.
import { supabase, el, money } from './common.js';
import { askConfirm } from './dialogs.js';
import { modsReady } from './mod-core.js';
import './numpad.js';

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'split-bill.css' }));
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'modifiers.css' }));

// ready-made groups: the owner only changes names and prices
const TEMPLATES = [
  { name: 'Spice level', required: false, multi: false, options: ['No spicy', 'Mild', 'Medium', 'Hot'] },
  { name: 'Hot or Iced', required: true, multi: false, options: ['Hot', 'Iced'] },
  { name: 'Sugar level', required: false, multi: false, options: ['Normal', 'Less sugar', 'Half sugar', 'No sugar'] },
  { name: 'Milk level', required: false, multi: false, options: ['Normal', 'Less milk', 'No milk'] },
  { name: 'Ice level', required: false, multi: false, options: ['Normal ice', 'Less ice', 'No ice'] },
  { name: 'Size', required: true, multi: false, options: ['Regular', 'Large'] },
  { name: 'Extras (food)', required: false, multi: true, options: ['Extra egg', 'Extra chicken', 'Extra rice', 'Extra gravy', 'Extra sambal'] },
  { name: 'Extras (drinks)', required: false, multi: true, options: ['Extra shot', 'Add pearls', 'Add jelly'] },
  { name: 'Remove ingredient', required: false, multi: true, options: ['No onion', 'No chilli', 'No egg', 'No peanuts', 'No coriander'] },
  { name: 'Rice or bread', required: true, multi: false, options: ['Plain rice', 'Briyani rice', 'Naan', 'Roti', 'Chapati'] },
  { name: 'Egg style', required: false, multi: false, options: ['Fried', 'Boiled', 'Half-boiled', 'Omelette'] },
];

const screen = el('main', 'screen menu-screen');
screen.id = 'modifiers-screen';
screen.hidden = true;
const wrap = el('div', 'md-wrap');
screen.appendChild(wrap);
document.body.appendChild(screen);

let groups = []; // [{id, name, required, multi, options: [{id, name, price}]}]
let links = []; // [{menu_item_id, group_id}]
let cats = [];
let items = [];
let openId = null; // the group card that is expanded
let notice = { text: '', bad: false };
let ready = true;

function say(text, bad) {
  notice = { text: text || '', bad: !!bad };
  const n = wrap.querySelector('.md-notice');
  if (n) {
    n.textContent = notice.text;
    n.hidden = !notice.text;
    n.classList.toggle('bad', notice.bad);
  }
}

async function load() {
  ready = await modsReady();
  if (!ready) return render();
  const [g, o, l, c, i] = await Promise.all([
    supabase.from('modifier_groups').select('id, name, required, multi, sort_order').order('sort_order').order('id'),
    supabase.from('modifier_options').select('id, group_id, name, price, sort_order').order('sort_order').order('id'),
    supabase.from('menu_item_modifier_groups').select('menu_item_id, group_id'),
    supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
    supabase.from('menu_items').select('id, name, category_id, active').eq('active', true).order('name'),
  ]);
  const err = g.error || o.error || l.error || c.error || i.error;
  if (err) {
    say('Could not load: ' + err.message, true);
    return render();
  }
  groups = g.data.map((x) => ({
    id: x.id,
    name: x.name,
    required: !!x.required,
    multi: !!x.multi,
    options: o.data.filter((p) => p.group_id === x.id).map((p) => ({ id: p.id, name: p.name, price: Number(p.price || 0) })),
  }));
  links = l.data;
  cats = c.data;
  items = i.data;
  render();
}

function usedCount(g) {
  return links.filter((l) => l.group_id === g.id).length;
}

// ---------- drawing ----------
function render() {
  const keepY = screen.scrollTop;
  wrap.replaceChildren();

  if (!ready) {
    const c = el('div', 'md-card md-setup');
    c.appendChild(el('h3', '', 'One-time setup needed'));
    c.appendChild(el('p', '', 'Modifiers are not switched on in the database yet.'));
    const steps = el('ol', '');
    ['Open Supabase and go to SQL Editor, then New query.', 'Open the file modifiers.sql, copy everything, paste it in, and press Run.', 'Come back here and press the button below.'].forEach((t) => steps.appendChild(el('li', '', t)));
    c.appendChild(steps);
    const b = el('button', 'md-btn md-primary', 'I have run it - check again');
    b.type = 'button';
    b.addEventListener('click', load);
    c.appendChild(b);
    wrap.appendChild(c);
    return;
  }

  const bar = el('div', 'md-bar');
  const intro = el('p', 'md-intro', 'Make a group once (for example Spice level), then tick the dishes that use it. The waiter taps the choices when adding the dish.');
  const addBtn = el('button', 'md-btn md-primary', '+ New group');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => createGroup({ name: 'New group', required: false, multi: false, options: [] }));
  bar.append(intro, addBtn);
  wrap.appendChild(bar);

  const note = el('p', 'md-notice', notice.text);
  note.hidden = !notice.text;
  note.classList.toggle('bad', notice.bad);
  wrap.appendChild(note);

  // ready-made templates
  const tpl = el('div', 'md-tpl');
  tpl.appendChild(el('strong', '', 'Ready-made groups (tap to add):'));
  const chips = el('div', 'md-tpl-chips');
  TEMPLATES.forEach((t) => {
    const taken = groups.some((g) => g.name.toLowerCase() === t.name.toLowerCase());
    const b = el('button', 'md-chip' + (taken ? ' done' : ''), (taken ? '✓ ' : '+ ') + t.name);
    b.type = 'button';
    b.disabled = taken;
    b.addEventListener('click', () => createGroup(t));
    chips.appendChild(b);
  });
  tpl.appendChild(chips);
  wrap.appendChild(tpl);

  if (groups.length === 0) {
    wrap.appendChild(el('p', 'md-empty', 'No groups yet. Tap a ready-made group above, or press + New group.'));
  }
  groups.forEach((g) => wrap.appendChild(groupCard(g)));
  screen.scrollTop = keepY;
}

function groupCard(g) {
  const isOpen = openId === g.id;
  const card = el('section', 'md-card' + (isOpen ? ' open' : ''));

  const head = el('div', 'md-head');
  const title = el('button', 'md-title');
  title.type = 'button';
  const label = el('div', 'md-tl');
  label.appendChild(el('strong', '', g.name));
  const sub = g.options.map((o) => o.name).join(', ') || 'No choices yet';
  label.appendChild(el('small', '', sub));
  title.appendChild(label);
  title.addEventListener('click', () => {
    openId = isOpen ? null : g.id;
    render();
  });
  const tags = el('div', 'md-tags');
  tags.appendChild(el('span', 'md-tag' + (g.required ? ' req' : ''), g.required ? 'Required' : 'Optional'));
  tags.appendChild(el('span', 'md-tag', g.multi ? 'Pick any' : 'Pick one'));
  const n = usedCount(g);
  tags.appendChild(el('span', 'md-tag' + (n === 0 ? ' warn' : ''), n === 0 ? 'Not used yet' : 'Used on ' + n + (n === 1 ? ' dish' : ' dishes')));
  const chev = el('span', 'md-chev', isOpen ? '▲' : '▼');
  head.append(title, tags, chev);
  card.appendChild(head);
  if (!isOpen) return card;

  const body = el('div', 'md-body');

  // name + rules
  const row = el('div', 'md-row');
  const nameField = el('label', 'md-field');
  nameField.appendChild(el('span', '', 'Group name'));
  const nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.value = g.name;
  nameInp.maxLength = 40;
  nameInp.addEventListener('change', async () => {
    const v = nameInp.value.trim();
    if (!v) {
      nameInp.value = g.name;
      return;
    }
    await saveGroup(g, { name: v });
  });
  nameField.appendChild(nameInp);
  row.appendChild(nameField);

  const rules = el('div', 'md-rules');
  rules.appendChild(seg('Waiter must choose', [['yes', 'Required'], ['no', 'Optional']], g.required ? 'yes' : 'no', (v) => saveGroup(g, { required: v === 'yes' })));
  rules.appendChild(seg('How many choices', [['one', 'Pick one'], ['any', 'Pick any']], g.multi ? 'any' : 'one', (v) => saveGroup(g, { multi: v === 'any' })));
  row.appendChild(rules);
  body.appendChild(row);

  // choices
  body.appendChild(el('h4', '', 'Choices (price 0.00 = free)'));
  const list = el('div', 'md-opts');
  g.options.forEach((o) => list.appendChild(optionRow(g, o)));
  body.appendChild(list);
  const addOpt = el('button', 'md-btn', '+ Add a choice');
  addOpt.type = 'button';
  addOpt.addEventListener('click', () => addOption(g));
  body.appendChild(addOpt);

  // actions
  const act = el('div', 'md-actions');
  const use = el('button', 'md-btn md-primary', 'Choose dishes (' + usedCount(g) + ')');
  use.type = 'button';
  use.addEventListener('click', () => chooseItems(g));
  const del = el('button', 'md-btn md-danger', 'Delete group');
  del.type = 'button';
  del.addEventListener('click', () => deleteGroup(g));
  act.append(use, del);
  body.appendChild(act);

  card.appendChild(body);
  return card;
}

function seg(title, options, value, onPick) {
  const box = el('div', 'md-seg-box');
  box.appendChild(el('span', 'md-seg-title', title));
  const s = el('div', 'md-seg');
  options.forEach(([k, t]) => {
    const b = el('button', 'md-seg-b' + (value === k ? ' on' : ''), t);
    b.type = 'button';
    b.addEventListener('click', () => onPick(k));
    s.appendChild(b);
  });
  box.appendChild(s);
  return box;
}

function optionRow(g, o) {
  const r = el('div', 'md-opt');
  const name = document.createElement('input');
  name.type = 'text';
  name.value = o.name;
  name.maxLength = 40;
  name.placeholder = 'Choice name';
  name.addEventListener('change', async () => {
    const v = name.value.trim();
    if (!v) {
      name.value = o.name;
      return;
    }
    const res = await supabase.from('modifier_options').update({ name: v }).eq('id', o.id);
    if (res.error) return say('Could not save: ' + res.error.message, true);
    o.name = v;
    say('Saved.');
  });
  const price = el('div', 'sb-money md-price');
  price.appendChild(el('span', 'sb-rm', '+ RM'));
  const pin = document.createElement('input');
  pin.type = 'text';
  pin.value = Number(o.price).toFixed(2);
  pin.autocomplete = 'off';
  pin.dataset.numpad = 'money';
  pin.dataset.npTitle = 'Extra price: ' + o.name;
  pin.dataset.npFresh = '1';
  pin.dataset.npHint = 'Type 0.00 if this choice is free';
  let timer = null;
  const savePrice = async () => {
    const v = Math.max(0, parseFloat(pin.value || '0') || 0);
    if (v === o.price) return;
    const res = await supabase.from('modifier_options').update({ price: v }).eq('id', o.id);
    if (res.error) return say('Could not save: ' + res.error.message, true);
    o.price = v;
    say('Saved.');
  };
  pin.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(savePrice, 500);
  });
  pin.addEventListener('change', savePrice);
  price.appendChild(pin);
  const x = el('button', 'md-x', '×');
  x.type = 'button';
  x.title = 'Remove this choice';
  x.addEventListener('click', async () => {
    const res = await supabase.from('modifier_options').delete().eq('id', o.id);
    if (res.error) return say('Could not remove: ' + res.error.message, true);
    g.options = g.options.filter((p) => p.id !== o.id);
    say('Removed.');
    render();
  });
  r.append(name, price, x);
  return r;
}

// ---------- saving ----------
async function createGroup(t) {
  say('');
  const sort = groups.length;
  const res = await supabase.from('modifier_groups').insert({ name: t.name, required: t.required, multi: t.multi, sort_order: sort }).select('id').single();
  if (res.error) return say('Could not make the group: ' + res.error.message, true);
  const id = res.data.id;
  if (t.options.length) {
    const ins = await supabase.from('modifier_options').insert(t.options.map((n, i) => ({ group_id: id, name: n, price: 0, sort_order: i })));
    if (ins.error) say('The group was made, but the choices were not saved: ' + ins.error.message, true);
  }
  openId = id;
  await load();
  say(t.options.length ? 'Added. Set any prices, then press Choose dishes.' : 'Added. Add the choices, then press Choose dishes.');
}

async function saveGroup(g, patch) {
  const res = await supabase.from('modifier_groups').update(patch).eq('id', g.id);
  if (res.error) return say('Could not save: ' + res.error.message, true);
  Object.assign(g, patch);
  render();
  say('Saved.');
}

async function addOption(g) {
  const res = await supabase.from('modifier_options').insert({ group_id: g.id, name: 'New choice', price: 0, sort_order: g.options.length }).select('id, name, price').single();
  if (res.error) return say('Could not add: ' + res.error.message, true);
  g.options.push({ id: res.data.id, name: res.data.name, price: 0 });
  render();
  const inputs = wrap.querySelectorAll('.md-opt input[type=text]:not([data-numpad])');
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.select();
  }
}

async function deleteGroup(g) {
  const n = usedCount(g);
  const ok = await askConfirm({
    title: 'Delete "' + g.name + '"?',
    message: (n ? 'It will be removed from ' + n + ' dish' + (n === 1 ? '' : 'es') + '. ' : '') + 'Bills that were already made keep what the customer chose.',
    okText: 'Delete',
    cancelText: 'Keep',
    danger: true,
  });
  if (!ok) return;
  const res = await supabase.from('modifier_groups').delete().eq('id', g.id);
  if (res.error) return say('Could not delete: ' + res.error.message, true);
  openId = null;
  await load();
  say('Deleted.');
}

// ---------- tick the dishes that use this group ----------
function chooseItems(g) {
  const chosen = new Set(links.filter((l) => l.group_id === g.id).map((l) => String(l.menu_item_id)));
  const before = new Set(chosen);
  let filter = '';

  const back = el('div', 'sb-back');
  const modal = el('div', 'sb-modal md-pick');
  modal.setAttribute('role', 'dialog');
  back.appendChild(modal);
  document.body.appendChild(back);
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
  };
  function onKey(e) {
    if (e.key === 'Escape' && !document.querySelector('.np-back:not([hidden])')) close();
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });

  const head = el('div', 'sb-head');
  const t = el('div', 'sb-titles');
  t.append(el('h3', '', 'Dishes that use "' + g.name + '"'), el('p', '', 'Tick a whole category, or single dishes'));
  const x = el('button', 'sb-x');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.addEventListener('click', close);
  head.append(t, x);
  modal.appendChild(head);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'md-search';
  search.placeholder = 'Find a dish...';
  search.dataset.kbd = 'off';
  modal.appendChild(search);

  const list = el('div', 'md-picklist');
  modal.appendChild(list);

  const foot = el('div', 'md-pickfoot');
  const count = el('span', 'md-count', '');
  const save = el('button', 'sb-paybtn md-savebtn', 'Save');
  save.type = 'button';
  foot.append(count, save);
  modal.appendChild(foot);

  function drawList() {
    list.replaceChildren();
    const f = filter.trim().toLowerCase();
    cats.forEach((c) => {
      const its = items.filter((i) => i.category_id === c.id && (!f || i.name.toLowerCase().includes(f)));
      if (its.length === 0) return;
      const allOn = its.every((i) => chosen.has(String(i.id)));
      const someOn = its.some((i) => chosen.has(String(i.id)));
      const sec = el('div', 'md-cat');
      const h = el('label', 'md-cathead');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = allOn;
      cb.indeterminate = !allOn && someOn;
      cb.addEventListener('change', () => {
        its.forEach((i) => (cb.checked ? chosen.add(String(i.id)) : chosen.delete(String(i.id))));
        drawList();
      });
      h.append(cb, el('strong', '', c.name), el('small', '', its.filter((i) => chosen.has(String(i.id))).length + ' / ' + its.length));
      sec.appendChild(h);
      const grid = el('div', 'md-items');
      its.forEach((i) => {
        const l = el('label', 'md-item' + (chosen.has(String(i.id)) ? ' on' : ''));
        const b = document.createElement('input');
        b.type = 'checkbox';
        b.checked = chosen.has(String(i.id));
        b.addEventListener('change', () => {
          if (b.checked) chosen.add(String(i.id));
          else chosen.delete(String(i.id));
          drawList();
        });
        l.append(b, el('span', '', i.name));
        grid.appendChild(l);
      });
      sec.appendChild(grid);
      list.appendChild(sec);
    });
    if (!list.children.length) list.appendChild(el('p', 'md-empty', 'No dishes found.'));
    count.textContent = chosen.size + (chosen.size === 1 ? ' dish selected' : ' dishes selected');
  }
  search.addEventListener('input', () => {
    filter = search.value;
    drawList();
  });
  drawList();

  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = 'Saving...';
    const add = [...chosen].filter((k) => !before.has(k));
    const remove = [...before].filter((k) => !chosen.has(k));
    // the id type can be a number or text, so keep the original value from the menu list
    const idOf = (k) => (items.find((i) => String(i.id) === k) || { id: k }).id;
    if (add.length) {
      const r = await supabase.from('menu_item_modifier_groups').insert(add.map((k) => ({ menu_item_id: idOf(k), group_id: g.id })));
      if (r.error) {
        save.disabled = false;
        save.textContent = 'Save';
        return say('Could not save: ' + r.error.message, true);
      }
    }
    if (remove.length) {
      const r = await supabase.from('menu_item_modifier_groups').delete().eq('group_id', g.id).in('menu_item_id', remove.map(idOf));
      if (r.error) {
        save.disabled = false;
        save.textContent = 'Save';
        return say('Could not save: ' + r.error.message, true);
      }
    }
    close();
    await load();
    say('Saved. ' + chosen.size + ' dish' + (chosen.size === 1 ? '' : 'es') + ' now ask for "' + g.name + '".');
  });
}

document.addEventListener('kamala:open-modifiers', () => {
  screen.hidden = false;
  say('');
  load();
});
