import './menu-search.js';
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'menu-page.css' }));
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'order-page.css' }));
import { supabase, el, makeButton, money } from './common.js';
import { askConfirm, askText } from './dialogs.js';
import './orders.js';

// ---------- Login and home ----------

const loginScreen = document.getElementById('login-screen');
const homeScreen = document.getElementById('home-screen');
const menuScreen = document.getElementById('menu-screen');
const ordersScreen = document.getElementById('orders-screen');
const orderScreen = document.getElementById('order-screen');
const form = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const errorBox = document.getElementById('login-error');
const welcome = document.getElementById('welcome');
const roleBadge = document.getElementById('role-badge');
const logoutBtn = document.getElementById('logout-btn');
const menuBtn = document.getElementById('menu-btn');

let currentProfile = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showLogin() {
  homeScreen.hidden = true;
  menuScreen.hidden = true;
  ordersScreen.hidden = true;
  orderScreen.hidden = true;
  loginScreen.hidden = false;
}

function showHome(profile) {
  currentProfile = profile;
  welcome.textContent = 'Welcome, ' + (profile.full_name || 'Staff');
  roleBadge.textContent = profile.role.toUpperCase();
  menuBtn.hidden = profile.role !== 'owner';
  loginScreen.hidden = true;
  menuScreen.hidden = true;
  ordersScreen.hidden = true;
  orderScreen.hidden = true;
  homeScreen.hidden = false;
}

async function startSession(session) {
  if (!session) {
    showLogin();
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, role, active')
    .eq('id', session.user.id)
    .single();

  if (error || !data || !data.active) {
    await supabase.auth.signOut();
    showLogin();
    showError('This account is not allowed to use the POS.');
    return;
  }

  showHome(data);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError('Wrong email or password.');
  } else {
    await startSession(data.session);
  }

  loginBtn.disabled = false;
  loginBtn.textContent = 'Log in';
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentProfile = null;
  form.reset();
  errorBox.hidden = true;
  showLogin();
});

// ---------- Menu management (owner only) ----------

const menuBackBtn = document.getElementById('menu-back-btn');
const menuMessage = document.getElementById('menu-message');
const catForm = document.getElementById('cat-form');
const catName = document.getElementById('cat-name');
const catList = document.getElementById('cat-list');
const itemForm = document.getElementById('item-form');
const itemFormTitle = document.getElementById('item-form-title');
const itemName = document.getElementById('item-name');
const itemCategory = document.getElementById('item-category');
const itemPrice = document.getElementById('item-price');
const itemSaveBtn = document.getElementById('item-save-btn');
const itemCancelBtn = document.getElementById('item-cancel-btn');
const itemList = document.getElementById('item-list');

let categories = [];
let items = [];
let editingItemId = null;

function setMenuMessage(text, isError) {
  if (!text) {
    menuMessage.hidden = true;
    return;
  }
  menuMessage.textContent = text;
  menuMessage.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  menuMessage.hidden = false;
  menuMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ----- Bank-style money boxes -----
// The box always shows an amount like 0.00 and cannot be edited like normal text.
// The cursor is locked at the end. Digits slide in from the right: type 5, 0, 0 to get 5.00.
// Backspace removes the last digit. If emptyWhenZero is true, a zero amount shows as empty
// (used for the optional Foodpanda / Grab price).

function attachMoneyInput(input, emptyWhenZero) {
  function currentDigits() {
    return input.value.replace(/\D/g, '').replace(/^0+/, '');
  }

  function caretToEnd() {
    const end = input.value.length;
    try {
      input.setSelectionRange(end, end);
    } catch (e) {
      // some browsers do not allow this; safe to ignore
    }
  }

  function render(digits) {
    digits = digits.replace(/^0+/, '').slice(0, 7);
    if (digits === '') {
      input.value = emptyWhenZero ? '' : '0.00';
    } else {
      const padded = digits.padStart(3, '0');
      input.value = padded.slice(0, -2) + '.' + padded.slice(-2);
    }
    caretToEnd();
  }

  // Take control of every keystroke: only digits in, only the last digit out
  input.addEventListener('beforeinput', (event) => {
    event.preventDefault();
    const type = event.inputType || '';
    let digits = currentDigits();

    if (type.startsWith('insert')) {
      let typed = event.data;
      if (!typed && event.dataTransfer) typed = event.dataTransfer.getData('text');
      digits += (typed || '').replace(/\D/g, '');
    } else if (type.startsWith('delete')) {
      digits = digits.slice(0, -1);
    }
    render(digits);
  });

  // Backup for keyboards that cannot be intercepted
  input.addEventListener('input', () => render(currentDigits()));

  // Keep the cursor locked at the end, whatever the user taps or selects
  input.addEventListener('focus', () => {
    caretToEnd();
    setTimeout(caretToEnd, 0);
    setTimeout(caretToEnd, 60);
  });
  ['click', 'mouseup', 'touchend', 'select'].forEach((name) => {
    input.addEventListener(name, () => {
      caretToEnd();
      setTimeout(caretToEnd, 0);
    });
  });
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== input) return;
    const end = input.value.length;
    if (input.selectionStart !== end || input.selectionEnd !== end) caretToEnd();
  });
}

attachMoneyInput(itemPrice, false);

async function loadMenu() {
  const catRes = await supabase
    .from('categories')
    .select('id, name, sort_order, active')
    .order('sort_order')
    .order('name');
  const itemRes = await supabase
    .from('menu_items')
    .select('id, category_id, name, price, delivery_price, active')
    .order('name');

  if (catRes.error || itemRes.error) {
    const err = catRes.error || itemRes.error;
    setMenuMessage('Could not load the menu: ' + err.message, true);
    return;
  }

  categories = catRes.data;
  items = itemRes.data;
  renderCategories();
  renderCategorySelect();
  renderItems();
}

// ----- Categories -----

function renderCategories() {
  catList.replaceChildren();

  if (categories.length === 0) {
    catList.appendChild(el('p', 'menu-empty', 'No categories yet. Add your first one above.'));
    return;
  }

  categories.forEach((cat) => {
    const row = el('div', 'menu-row' + (cat.active ? '' : ' menu-dim'));
    const info = el('div', 'menu-info');
    info.appendChild(el('strong', '', cat.name));
    if (!cat.active) info.appendChild(el('span', 'menu-tag', 'Hidden'));

    const actions = el('div', 'menu-actions');
    actions.appendChild(makeButton('Rename', () => renameCategory(cat)));
    actions.appendChild(makeButton(cat.active ? 'Hide' : 'Show', () => toggleCategory(cat)));
    actions.appendChild(makeButton('Delete', () => deleteCategory(cat), 'danger'));

    row.append(info, actions);
    catList.appendChild(row);
  });
}

function renderCategorySelect() {
  const keep = itemCategory.value;
  itemCategory.replaceChildren();

  const first = el('option', '', 'Choose a category');
  first.value = '';
  itemCategory.appendChild(first);

  categories.forEach((cat) => {
    const o = el('option', '', cat.active ? cat.name : cat.name + ' (hidden)');
    o.value = String(cat.id);
    itemCategory.appendChild(o);
  });

  itemCategory.value = keep;
}

catForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMenuMessage('');
  const name = catName.value.trim();
  if (!name) return;

  const nextOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;
  const { error } = await supabase.from('categories').insert({ name, sort_order: nextOrder });

  if (error) {
    setMenuMessage('Could not add the category: ' + error.message, true);
    return;
  }

  catForm.reset();
  setMenuMessage('Category added.', false);
  await loadMenu();
});

async function renameCategory(cat) {
  const newName = await askText({
    title: 'Rename category',
    message: 'New name for "' + cat.name + '":',
    value: cat.name,
    placeholder: 'Category name',
    okText: 'Rename',
  });
  if (newName === null) return;

  const { error } = await supabase
    .from('categories')
    .update({ name: newName })
    .eq('id', cat.id);

  if (error) {
    setMenuMessage('Could not rename: ' + error.message, true);
    return;
  }
  setMenuMessage('Category renamed.', false);
  await loadMenu();
}

async function toggleCategory(cat) {
  const { error } = await supabase
    .from('categories')
    .update({ active: !cat.active })
    .eq('id', cat.id);

  if (error) {
    setMenuMessage('Could not update: ' + error.message, true);
    return;
  }
  await loadMenu();
}

async function deleteCategory(cat) {
  setMenuMessage('');

  const count = items.filter((i) => i.category_id === cat.id).length;
  if (count > 0) {
    setMenuMessage(
      '"' + cat.name + '" still has ' + count + ' item(s). Delete or move those items first, or use Hide instead.',
      true
    );
    return;
  }

  const sure = await askConfirm({
    title: 'Delete category?',
    message: 'Delete the category "' + cat.name + '" permanently?\n\nThis cannot be undone.',
    okText: 'Delete',
    cancelText: 'Keep it',
    danger: true,
  });
  if (!sure) return;

  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', cat.id)
    .select();

  if (error) {
    setMenuMessage('Could not delete the category: ' + error.message, true);
    return;
  }
  if (!data || data.length === 0) {
    setMenuMessage('The database blocked this delete. Please tell Claude about this message.', true);
    return;
  }

  setMenuMessage('Category deleted.', false);
  await loadMenu();
}

// ----- Menu items -----

function renderItems() {
  itemList.replaceChildren();

  if (items.length === 0) {
    itemList.appendChild(el('p', 'menu-empty', 'No menu items yet. Add your first one above.'));
    return;
  }

  const groups = categories.map((c) => ({
    title: c.name,
    list: items.filter((i) => i.category_id === c.id),
  }));
  const orphans = items.filter((i) => !categories.some((c) => c.id === i.category_id));
  if (orphans.length > 0) groups.push({ title: 'No category', list: orphans });

  groups.forEach((group) => {
    if (group.list.length === 0) return;
    itemList.appendChild(el('h4', 'menu-group', group.title));

    group.list.forEach((item) => {
      const row = el('div', 'menu-row' + (item.active ? '' : ' menu-dim'));
      const info = el('div', 'menu-info');
      info.appendChild(el('strong', '', item.name));

      let priceText = money(item.price);
      info.appendChild(el('span', 'menu-price', priceText));
      if (!item.active) info.appendChild(el('span', 'menu-tag', 'Not available'));

      const actions = el('div', 'menu-actions');
      actions.appendChild(makeButton('Edit', () => startEditItem(item)));
      actions.appendChild(
        makeButton(item.active ? 'Mark unavailable' : 'Mark available', () => toggleItem(item))
      );
      actions.appendChild(makeButton('Delete', () => deleteItem(item), 'danger'));

      row.append(info, actions);
      itemList.appendChild(row);
    });
  });
}

function resetItemForm() {
  editingItemId = null;
  itemForm.reset();
  itemFormTitle.textContent = 'Add menu item';
  itemSaveBtn.textContent = 'Add item';
  itemCancelBtn.hidden = true;
}

function startEditItem(item) {
  editingItemId = item.id;
  itemName.value = item.name;
  itemCategory.value = item.category_id === null ? '' : String(item.category_id);
  itemPrice.value = Number(item.price).toFixed(2);
  itemFormTitle.textContent = 'Edit menu item';
  itemSaveBtn.textContent = 'Save changes';
  itemCancelBtn.hidden = false;
  setMenuMessage('');
  itemForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

itemCancelBtn.addEventListener('click', resetItemForm);

itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMenuMessage('');

  const name = itemName.value.trim();
  const categoryId = Number(itemCategory.value);
  const price = parseFloat(itemPrice.value);

  if (!name) {
    setMenuMessage('Please enter the item name.', true);
    return;
  }
  if (!categoryId) {
    setMenuMessage('Please choose a category.', true);
    return;
  }
  if (Number.isNaN(price) || price < 0) {
    setMenuMessage('Please enter a valid price.', true);
    return;
  }

  const fields = {
    name,
    category_id: categoryId,
    price,
  };

  let result;
  if (editingItemId === null) {
    result = await supabase.from('menu_items').insert({ ...fields, active: true });
  } else {
    result = await supabase.from('menu_items').update(fields).eq('id', editingItemId);
  }

  if (result.error) {
    setMenuMessage('Could not save the item: ' + result.error.message, true);
    return;
  }

  const wasEditing = editingItemId !== null;
  resetItemForm();
  setMenuMessage(wasEditing ? 'Item updated.' : 'Item added.', false);
  await loadMenu();
});

async function toggleItem(item) {
  const { error } = await supabase
    .from('menu_items')
    .update({ active: !item.active })
    .eq('id', item.id);

  if (error) {
    setMenuMessage('Could not update: ' + error.message, true);
    return;
  }
  await loadMenu();
}

async function deleteItem(item) {
  setMenuMessage('');

  const sure = await askConfirm({
    title: 'Delete menu item?',
    message: 'Delete "' + item.name + '" permanently?\n\nThis cannot be undone.',
    okText: 'Delete',
    cancelText: 'Keep it',
    danger: true,
  });
  if (!sure) return;

  const { data, error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', item.id)
    .select();

  if (error) {
    // 23503 = the item is used by past orders, so the database refuses
    if (error.code === '23503') {
      setMenuMessage(
        '"' + item.name + '" is used in past orders, so it cannot be deleted. Use "Mark unavailable" instead.',
        true
      );
    } else {
      setMenuMessage('Could not delete the item: ' + error.message, true);
    }
    return;
  }
  if (!data || data.length === 0) {
    setMenuMessage('The database blocked this delete. Please tell Claude about this message.', true);
    return;
  }

  if (editingItemId === item.id) resetItemForm();
  setMenuMessage('Item deleted.', false);
  await loadMenu();
}

// ----- Open and close the menu screen -----

menuBtn.addEventListener('click', async () => {
  if (!currentProfile || currentProfile.role !== 'owner') return;
  homeScreen.hidden = true;
  menuScreen.hidden = false;
  setMenuMessage('');
  resetItemForm();
  await loadMenu();
});

menuBackBtn.addEventListener('click', () => {
  menuScreen.hidden = true;
  homeScreen.hidden = false;
  resetItemForm();
});

// The PIN pad tells us when someone has entered a PIN (session) or shut down (null)
document.addEventListener('kamala:pin-session', (e) => {
  startSession(e.detail);
});

// When the page opens, check if someone is already logged in
const { data: { session } } = await supabase.auth.getSession();
await startSession(session);