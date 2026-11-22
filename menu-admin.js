// New Menu Management page (owner only): items table with photos, categories, add/edit pop-ups.
import { supabase, el, money } from './common.js';
import { askConfirm, askText } from './dialogs.js';
import { compressImage } from './image-tools.js';

document.head.appendChild(
  Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'menu-admin.css' })
);

const screen = document.getElementById('menu-screen');
const wrapBox = screen ? screen.querySelector('.menu-wrap') : null;

if (screen && wrapBox) {
  const root = el('div', 'mm-root');
  wrapBox.appendChild(root);

  let tab = 'items'; // 'items' or 'categories'
  let catFilter = null; // null = all items
  let search = '';
  let statusFilter = 'all'; // all, available, unavailable
  let categories = [];
  let items = [];
  let message = null; // { text, error }
  let hasPhotos = true; // false until the image_url column exists
  let hasAvail = false;

  // ---------- small helpers ----------
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  function iconBtn(icon, title, cls, onClick) {
    const b = el('button', 'mm-icon-btn ' + (cls || ''));
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    b.addEventListener('click', onClick);
    return b;
  }

  function button(text, cls, onClick) {
    const b = el('button', cls || '', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function setMessage(text, isError) {
    message = text ? { text, error: !!isError } : null;
    render();
  }

  // ---------- load ----------
  async function load() {
    const catRes = await supabase
      .from('categories')
      .select('id, name, sort_order, active')
      .order('sort_order')
      .order('name');

    hasAvail = true;
    let itemRes = await supabase
      .from('menu_items')
      .select('id, category_id, name, price, delivery_price, active, image_url, available_for')
      .order('name');
    if (itemRes.error && /available_for/i.test(itemRes.error.message)) {
      // the "show in" column is not created yet: load without it
      hasAvail = false;
      itemRes = await supabase
        .from('menu_items')
        .select('id, category_id, name, price, delivery_price, active, image_url')
        .order('name');
    }
    hasPhotos = true;
    if (itemRes.error && /image_url/i.test(itemRes.error.message)) {
      // the photo column is not created yet: load without photos
      hasPhotos = false;
      itemRes = await supabase
        .from('menu_items')
        .select('id, category_id, name, price, delivery_price, active')
        .order('name');
    }

    if (catRes.error || itemRes.error) {
      const err = catRes.error || itemRes.error;
      message = { text: 'Could not load the menu: ' + err.message, error: true };
    } else {
      categories = catRes.data;
      items = itemRes.data;
    }
    render();
  }

  // ---------- draw ----------
  function thumb(item) {
    if (item.image_url) {
      const img = el('img', 'mm-thumb');
      img.src = item.image_url;
      img.alt = item.name;
      img.loading = 'lazy';
      return img;
    }
    return el('span', 'mm-thumb mm-thumb-letter', item.name.trim().charAt(0).toUpperCase());
  }

  function catName(id) {
    const c = categories.find((x) => x.id === id);
    return c ? c.name : 'No category';
  }

  // after a save / update the list stays where it was; a new filter starts at the top
  let resetScroll = false;
  let keepRows = 0;
  let keepPage = 0;

  function render() {
    const oldRows = root.querySelector('.mm-rows');
    keepRows = oldRows && !resetScroll ? oldRows.scrollTop : 0;
    keepPage = resetScroll ? 0 : window.scrollY;
    resetScroll = false;
    root.replaceChildren();

    // heading row: tabs on the left, big add button on the right
    const head = el('div', 'mm-head');
    const tabs = el('div', 'mm-tabs');
    [
      ['items', 'Menu Items'],
      ['categories', 'Categories'],
    ].forEach(([key, text]) => {
      const b = button(text, 'mm-tab' + (tab === key ? ' active' : ''), () => {
        tab = key;
        message = null;
        resetScroll = true;
        render();
      });
      tabs.appendChild(b);
    });
    const addBtn = el('button', 'mm-add-btn');
    addBtn.type = 'button';
    addBtn.innerHTML = ICON.plus + '<span>' + (tab === 'items' ? 'Add Menu Item' : 'Add Category') + '</span>';
    addBtn.addEventListener('click', () => (tab === 'items' ? openItemForm(null) : addCategory()));
    head.append(tabs, addBtn);
    root.appendChild(head);

    if (message) {
      root.appendChild(el('p', 'mm-msg ' + (message.error ? 'mm-msg-error' : 'mm-msg-ok'), message.text));
    }
    if (!hasPhotos && tab === 'items') {
      root.appendChild(
        el('p', 'mm-msg mm-msg-error', 'Photos are not set up yet. Run the menu photos SQL in Supabase to turn them on.')
      );
    }

    if (tab === 'items') renderItemsTab();
    else renderCategoriesTab();
  }

  function renderItemsTab() {
    const body = el('div', 'mm-body');

    // ----- left: categories with counts -----
    const side = el('div', 'mm-card mm-side');
    side.appendChild(el('h3', '', 'Categories (' + categories.length + ')'));
    const addRow = (id, name, count) => {
      const row = el('button', 'mm-cat' + (catFilter === id ? ' active' : ''));
      row.type = 'button';
      row.append(el('span', '', name), el('span', 'mm-cat-count', String(count)));
      row.addEventListener('click', () => {
        catFilter = id;
        resetScroll = true;
        render();
      });
      side.appendChild(row);
    };
    addRow(null, 'All Items', items.length);
    categories.forEach((c) => addRow(c.id, c.name, items.filter((i) => i.category_id === c.id).length));

    // ----- right: search + table -----
    const main = el('div', 'mm-card mm-main');
    const bar = el('div', 'mm-bar');
    const searchWrap = el('div', 'mm-search');
    searchWrap.innerHTML = ICON.search;
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search menu items...';
    input.autocomplete = 'off';
    input.value = search;
    searchWrap.appendChild(input);

    const select = document.createElement('select');
    select.className = 'mm-status-select';
    [
      ['all', 'All Status'],
      ['available', 'Available'],
      ['unavailable', 'Unavailable'],
    ].forEach(([v, t]) => {
      const o = el('option', '', t);
      o.value = v;
      select.appendChild(o);
    });
    select.value = statusFilter;
    select.addEventListener('change', () => {
      statusFilter = select.value;
      resetScroll = true;
      render();
    });
    bar.append(searchWrap, select);

    const table = el('div', 'mm-table');
    const headRow = el('div', 'mm-row mm-row-head');
    ['Menu Item', 'Category', 'Available for', 'Price', 'Status', 'Action'].forEach((t, i) =>
      headRow.appendChild(el('span', i === 5 ? 'mm-right' : '', t))
    );
    table.appendChild(headRow);

    const rowsBox = el('div', 'mm-rows');
    table.appendChild(rowsBox);

    function drawRows() {
      rowsBox.replaceChildren();
      const q = search.trim().toLowerCase();
      const list = items.filter(
        (i) =>
          (catFilter === null || i.category_id === catFilter) &&
          (q === '' || i.name.toLowerCase().includes(q)) &&
          (statusFilter === 'all' || (statusFilter === 'available' ? i.active : !i.active))
      );
      if (list.length === 0) {
        rowsBox.appendChild(
          el('p', 'menu-empty', items.length === 0 ? 'No menu items yet. Tap "Add Menu Item".' : 'No item found.')
        );
        return;
      }
      list.forEach((item) => {
        const row = el('div', 'mm-row' + (item.active ? '' : ' mm-dim'));

        const nameCell = el('span', 'mm-name');
        nameCell.append(thumb(item), el('strong', 'mm-name-text', item.name));
        const whereCell = el('span', 'mm-where-cell');
        if (item.available_for === 'takeaway') whereCell.appendChild(el('small', 'mm-where mm-where-ta', 'Takeaway only'));
        else if (item.available_for === 'dinein') whereCell.appendChild(el('small', 'mm-where mm-where-di', 'Dine-in only'));
        else whereCell.appendChild(el('small', 'mm-where mm-where-both', 'Dine-in & Takeaway'));

        const priceCell = el('span', 'mm-price');
        priceCell.appendChild(el('strong', '', money(item.price)));

        const pill = el('button', 'mm-pill ' + (item.active ? 'mm-on' : 'mm-off'), item.active ? 'Available' : 'Unavailable');
        pill.type = 'button';
        pill.title = 'Tap to change';
        pill.addEventListener('click', () => toggleItem(item));
        const statusCell = el('span', '');
        statusCell.appendChild(pill);

        const actions = el('span', 'mm-actions');
        actions.append(
          iconBtn(ICON.edit, 'Edit', '', () => openItemForm(item)),
          iconBtn(ICON.trash, 'Delete', 'mm-danger', () => deleteItem(item))
        );

        row.append(nameCell, el('span', 'mm-cat-text', catName(item.category_id)), whereCell, priceCell, statusCell, actions);
        rowsBox.appendChild(row);
      });
    }
    drawRows();

    input.addEventListener('input', () => {
      search = input.value;
      rowsBox.scrollTop = 0;
      drawRows(); // only the rows, so the search box keeps focus
    });

    main.append(bar, table);
    body.append(side, main);
    root.appendChild(body);
    rowsBox.scrollTop = keepRows;
    if (keepPage) window.scrollTo(0, keepPage);
  }

  function renderCategoriesTab() {
    const card = el('div', 'mm-card mm-cats-card');
    if (categories.length === 0) {
      card.appendChild(el('p', 'menu-empty', 'No categories yet. Tap "Add Category".'));
    }
    categories.forEach((cat) => {
      const count = items.filter((i) => i.category_id === cat.id).length;
      const row = el('div', 'mm-cat-row' + (cat.active ? '' : ' mm-dim'));
      const info = el('div', 'mm-cat-info');
      info.append(el('strong', '', cat.name), el('small', '', count + (count === 1 ? ' item' : ' items')));
      const pill = el('button', 'mm-pill ' + (cat.active ? 'mm-on' : 'mm-off'), cat.active ? 'Visible' : 'Hidden');
      pill.type = 'button';
      pill.title = 'Tap to change';
      pill.addEventListener('click', () => toggleCategory(cat));
      const actions = el('span', 'mm-actions');
      actions.append(
        iconBtn(ICON.edit, 'Rename', '', () => renameCategory(cat)),
        iconBtn(ICON.trash, 'Delete', 'mm-danger', () => deleteCategory(cat))
      );
      row.append(info, pill, actions);
      card.appendChild(row);
    });
    root.appendChild(card);
  }

  // ---------- categories ----------
  async function addCategory() {
    const name = await askText({
      title: 'New category',
      message: 'Type the category name, for example Rice.',
      placeholder: 'Category name',
      okText: 'Add',
    });
    if (name === null) return;
    const nextOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;
    const { error } = await supabase.from('categories').insert({ name, sort_order: nextOrder });
    if (error) return setMessage('Could not add the category: ' + error.message, true);
    await load();
    setMessage('Category added.', false);
  }

  async function renameCategory(cat) {
    const name = await askText({
      title: 'Rename category',
      message: 'New name for "' + cat.name + '":',
      value: cat.name,
      placeholder: 'Category name',
      okText: 'Rename',
    });
    if (name === null) return;
    const { error } = await supabase.from('categories').update({ name }).eq('id', cat.id);
    if (error) return setMessage('Could not rename: ' + error.message, true);
    await load();
    setMessage('Category renamed.', false);
  }

  async function toggleCategory(cat) {
    const { error } = await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id);
    if (error) return setMessage('Could not update: ' + error.message, true);
    await load();
  }

  async function deleteCategory(cat) {
    const count = items.filter((i) => i.category_id === cat.id).length;
    if (count > 0) {
      return setMessage(
        '"' + cat.name + '" still has ' + count + ' item(s). Delete or move those items first, or hide the category.',
        true
      );
    }
    const sure = await askConfirm({
      title: 'Delete category?',
      message: 'Delete the category "' + cat.name + '" permanently?\n\nThis cannot be undone.',
      okText: 'Delete',
      cancelText: 'Keep it',
      danger: true,
    });
    if (!sure) return;
    const { data, error } = await supabase.from('categories').delete().eq('id', cat.id).select();
    if (error) return setMessage('Could not delete the category: ' + error.message, true);
    if (!data || data.length === 0) return setMessage('The database blocked this delete.', true);
    if (catFilter === cat.id) catFilter = null;
    await load();
    setMessage('Category deleted.', false);
  }

  // ---------- items ----------
  async function toggleItem(item) {
    const { error } = await supabase.from('menu_items').update({ active: !item.active }).eq('id', item.id);
    if (error) return setMessage('Could not update: ' + error.message, true);
    await load();
  }

  async function deleteItem(item) {
    const sure = await askConfirm({
      title: 'Delete menu item?',
      message: 'Delete "' + item.name + '" permanently?\n\nThis cannot be undone.',
      okText: 'Delete',
      cancelText: 'Keep it',
      danger: true,
    });
    if (!sure) return;
    const { data, error } = await supabase.from('menu_items').delete().eq('id', item.id).select();
    if (error) {
      if (error.code === '23503') {
        return setMessage('"' + item.name + '" is used in past orders, so it cannot be deleted. Set it to Unavailable instead.', true);
      }
      return setMessage('Could not delete the item: ' + error.message, true);
    }
    if (!data || data.length === 0) return setMessage('The database blocked this delete.', true);
    await removePhotoFile(item.image_url);
    await load();
    setMessage('Item deleted.', false);
  }

  // ---------- photos ----------
  function photoPath(url) {
    if (!url) return null;
    const marker = '/menu-photos/';
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  }

  async function removePhotoFile(url) {
    const path = photoPath(url);
    if (path) await supabase.storage.from('menu-photos').remove([path]); // best effort
  }

  // ---------- add / edit pop-up ----------
  function moneyBox(initial, emptyWhenZero) {
    const field = el('div', 'money-field');
    field.appendChild(el('span', '', 'RM'));
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = emptyWhenZero ? 'Same as price' : '0.00';
    const show = (digits) => {
      digits = digits.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7);
      if (digits === '') {
        input.value = emptyWhenZero ? '' : '0.00';
      } else {
        const p = digits.padStart(3, '0');
        input.value = p.slice(0, -2) + '.' + p.slice(-2);
      }
    };
    // digits slide in from the right: type 5, 0, 0 to get 5.00
    input.addEventListener('input', () => show(input.value));
    if (initial !== null && initial !== undefined) input.value = Number(initial).toFixed(2);
    else show('');
    field.appendChild(input);
    return { field, input };
  }

  function openItemForm(item) {
    if (categories.length === 0) {
      setMessage('Add a category first (Categories tab), then add menu items.', true);
      return;
    }
    const editing = item !== null;
    let newBlob = null; // a new photo chosen in this pop-up
    let removePhoto = false;

    const overlay = el('div', 'dlg-overlay');
    const card = el('div', 'dlg-card mm-modal');
    overlay.appendChild(card);
    const close = () => overlay.remove();
    card.appendChild(el('h3', '', editing ? 'Edit menu item' : 'Add menu item'));

    const label = (t) => card.appendChild(el('label', 'mm-label', t));

    label('Item name');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.value = editing ? item.name : '';
    card.appendChild(nameInput);

    label('Category');
    const catSelect = document.createElement('select');
    categories.forEach((c) => {
      const o = el('option', '', c.active ? c.name : c.name + ' (hidden)');
      o.value = String(c.id);
      catSelect.appendChild(o);
    });
    catSelect.value = editing && item.category_id !== null ? String(item.category_id) : catFilter !== null ? String(catFilter) : String(categories[0].id);
    card.appendChild(catSelect);

    card.appendChild(el('label', 'mm-label', 'Price'));
    const priceBox = moneyBox(editing ? item.price : null, false);
    card.appendChild(priceBox.field);

    // where this item is shown on the order screen
    let availSelect = null;
    if (hasAvail) {
      label('Show in');
      availSelect = document.createElement('select');
      [['both', 'Dine-in and Takeaway'], ['dinein', 'Dine-in only'], ['takeaway', 'Takeaway only']].forEach(([v, t]) => {
        const o = el('option', '', t);
        o.value = v;
        availSelect.appendChild(o);
      });
      availSelect.value = editing && item.available_for ? item.available_for : 'both';
      card.appendChild(availSelect);
    }

    // photo
    if (hasPhotos) {
      label('Photo');
      const photoRow = el('div', 'mm-photo-row');
      const preview = el('div', 'mm-photo-preview');
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.hidden = true;

      const drawPreview = () => {
        preview.replaceChildren();
        const src = newBlob ? URL.createObjectURL(newBlob) : !removePhoto && editing ? item.image_url : null;
        if (src) {
          const img = el('img', '');
          img.src = src;
          img.alt = '';
          preview.appendChild(img);
        } else {
          preview.appendChild(el('span', '', 'No photo'));
        }
      };
      drawPreview();

      const btns = el('div', 'mm-photo-btns');
      btns.append(
        button('Choose photo', 'secondary small', () => fileInput.click()),
        button('Remove photo', 'secondary small', () => {
          newBlob = null;
          removePhoto = true;
          drawPreview();
        })
      );
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files[0];
        if (!f) return;
        try {
          newBlob = (await compressImage(f, 'photo')).blob;
          removePhoto = false;
          err.hidden = true;
          drawPreview();
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
        }
      });
      photoRow.append(preview, btns, fileInput);
      card.appendChild(photoRow);
    }

    const err = el('p', 'dlg-error', '');
    err.hidden = true;
    card.appendChild(err);

    const actions = el('div', 'dlg-actions');
    const save = button(editing ? 'Save changes' : 'Add item', '', async () => {
      err.hidden = true;
      const name = nameInput.value.trim();
      const price = parseFloat(priceBox.input.value);
      const fail = (t) => {
        err.textContent = t;
        err.hidden = false;
      };
      if (!name) return fail('Please enter the item name.');
      if (Number.isNaN(price) || price < 0) return fail('Please enter a valid price.');

      save.disabled = true;
      save.textContent = 'Saving...';
      const fields = { name, category_id: Number(catSelect.value), price };
      if (availSelect) fields.available_for = availSelect.value;

      try {
        if (hasPhotos) {
          if (newBlob) {
            const path = crypto.randomUUID() + '.jpg';
            const up = await supabase.storage.from('menu-photos').upload(path, newBlob, { contentType: 'image/jpeg' });
            if (up.error) throw new Error('Photo upload failed: ' + up.error.message);
            fields.image_url = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
          } else if (removePhoto) {
            fields.image_url = null;
          }
        }

        const result = editing
          ? await supabase.from('menu_items').update(fields).eq('id', item.id)
          : await supabase.from('menu_items').insert({ ...fields, active: true });
        if (result.error) throw result.error;

        // the old photo file is not needed any more
        if (editing && hasPhotos && (newBlob || removePhoto)) await removePhotoFile(item.image_url);
      } catch (e) {
        fail('Could not save: ' + e.message);
        save.disabled = false;
        save.textContent = editing ? 'Save changes' : 'Add item';
        return;
      }
      close();
      await load();
      setMessage(editing ? 'Item updated.' : 'Item added.', false);
    });
    actions.append(button('Cancel', 'secondary', close), save);
    card.appendChild(actions);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    nameInput.focus();
  }

  // ---------- refresh whenever the screen opens ----------
  new MutationObserver(() => {
    if (!screen.hidden) {
      message = null;
      load();
    }
  }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  if (!screen.hidden) load();
}
