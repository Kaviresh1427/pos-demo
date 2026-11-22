// Table Management page: filter chips, search, grid/list view, table cards, reservations.
import { supabase, money } from './common.js';
import './dialogs.js'; // loads the pop-up style file

const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = 'tables.css';
document.head.appendChild(cssLink);

const grid = document.getElementById('table-grid');
const screen = document.getElementById('orders-screen');

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

if (grid && screen) {
  let filter = 'all'; // all, available, occupied, reserved
  let view = 'grid';
  let reservations = []; // today's active reservations
  let reservationsOk = true; // false if the reservations table is not created yet
  let takeaways = []; // open takeaway orders (TA-01, TA-02 ...)
  try {
    if (localStorage.getItem('kamala-table-view') === 'list') view = 'list';
  } catch (e) { /* ignore */ }

  // ---------- helpers ----------
  const label = (n) => 'T' + String(n).padStart(2, '0');

  function elapsed(iso) {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';
  }

  function clock(iso) {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // ---------- table drawing ----------
  function makeIcon(text) {
    const wrap = document.createElement('span');
    wrap.innerHTML =
      '<svg class="tb-svg" viewBox="0 0 120 100" aria-hidden="true">' +
      '<rect class="tb-chair" x="46" y="2" width="28" height="18" rx="9"/>' +
      '<rect class="tb-chair" x="2" y="32" width="18" height="34" rx="9"/>' +
      '<rect class="tb-chair" x="100" y="32" width="18" height="34" rx="9"/>' +
      '<rect class="tb-top" x="14" y="14" width="92" height="74" rx="24"/>' +
      '<text class="tb-num" x="60" y="52" text-anchor="middle" dominant-baseline="central"></text>' +
      '</svg>';
    const svg = wrap.firstChild;
    svg.querySelector('text').textContent = text;
    return svg;
  }

  // ---------- toolbar: chips, search, view switch, reserve ----------
  const toolbar = mk('div', 'tb-toolbar');
  const chipBox = mk('div', 'tb-chips');
  const chips = {};
  [
    ['all', 'All'],
    ['available', 'Available'],
    ['occupied', 'Occupied'],
    ['reserved', 'Reserved'],
    ['takeaway', 'Takeaway'],
  ].forEach(([key, text]) => {
    const b = mk('button', 'tb-chip', text);
    b.type = 'button';
    b.dataset.base = text;
    b.addEventListener('click', () => {
      filter = key;
      refreshView();
    });
    chips[key] = b;
    chipBox.appendChild(b);
  });

  const tools = mk('div', 'tb-tools');
  const searchInput = mk('input', 'tb-search-input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search table...';
  searchInput.autocomplete = 'off';

  const viewBox = mk('div', 'tb-view');
  const gridBtn = mk('button', 'tb-view-btn');
  gridBtn.type = 'button';
  gridBtn.title = 'Grid view';
  gridBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  const listBtn = mk('button', 'tb-view-btn');
  listBtn.type = 'button';
  listBtn.title = 'List view';
  listBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
  viewBox.append(gridBtn, listBtn);

  const reserveBtn = mk('button', 'tb-reserve-btn', '+ Reserve table');
  reserveBtn.type = 'button';

  const takeawayBtn = mk('button', 'tb-reserve-btn tb-takeaway-btn', '+ Takeaway');
  takeawayBtn.type = 'button';

  tools.append(searchInput, viewBox, takeawayBtn, reserveBtn);
  toolbar.append(chipBox, tools);
  grid.insertAdjacentElement('beforebegin', toolbar);

  // ---------- takeaway section (customers with no table) ----------
  const taSection = mk('div', 'tb-ta');
  const taHead = mk('div', 'tb-ta-head');
  const taTitle = mk('h3', '', 'Takeaway');
  const taCount = mk('span', 'tb-ta-count', '');
  taHead.append(taTitle, taCount);
  const taList = mk('div', 'tb-ta-list');
  taSection.append(taHead, taList);
  grid.insertAdjacentElement('beforebegin', taSection);

  async function loadTakeaways() {
    const res = await supabase
      .from('orders')
      .select('id, platform_order_no, created_at, order_items(unit_price, qty, status)')
      .eq('status', 'open')
      .eq('order_type', 'takeaway')
      .order('created_at');
    takeaways = res.error ? [] : res.data;
    refreshView();
  }

  function openTakeaway(key) {
    document.dispatchEvent(new CustomEvent('kamala:open-order', { detail: { key, type: 'takeaway' } }));
  }

  function renderTakeaways(q) {
    taList.replaceChildren();
    const shown = takeaways.filter((o) => q === '' || String(o.platform_order_no).toLowerCase().includes(q));
    taCount.textContent = takeaways.length === 1 ? '1 open' : takeaways.length + ' open';
    if (shown.length === 0) {
      taList.appendChild(mk('p', 'tb-ta-empty', 'No open takeaway orders. Press "+ Takeaway" when a customer comes to order.'));
    }
    shown.forEach((o) => {
      const items = (o.order_items || []).filter((x) => x.status !== 'cancelled');
      const qty = items.reduce((n, x) => n + x.qty, 0);
      const sen = items.reduce((n, x) => n + Math.round(Number(x.unit_price) * 100) * x.qty, 0);
      const card = mk('button', 'tb-ta-card');
      card.type = 'button';
      card.innerHTML =
        '<svg class="tb-ta-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
      const no = mk('strong', 'tb-ta-no', o.platform_order_no);
      const st = mk('span', 'tb-ta-status', 'Takeaway');
      const mid = mk('span', 'tb-ta-mid', qty + (qty === 1 ? ' item' : ' items') + '  \u00b7  ' + money(sen / 100));
      const time = mk('span', 'tb-ta-time', elapsed(o.created_at));
      card.append(no, st, mid, time);
      card.setAttribute('aria-label', 'Takeaway ' + o.platform_order_no);
      card.addEventListener('click', () => openTakeaway(o.platform_order_no));
      taList.appendChild(card);
    });
  }

  // the next number for today: TA-01, TA-02 ... (starts again every day)
  takeawayBtn.addEventListener('click', async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const res = await supabase
      .from('orders')
      .select('platform_order_no')
      .eq('order_type', 'takeaway')
      .gte('created_at', start.toISOString());
    if (res.error) {
      openModal((card, close) => {
        card.appendChild(mk('h3', '', 'Takeaway'));
        card.appendChild(mk('p', 'dlg-message', 'Takeaway is not set up yet. Please run the takeaway SQL in Supabase first.'));
        card.appendChild(mk('div', 'dlg-actions')).appendChild(btn('Close', 'secondary', close));
      });
      return;
    }
    let max = 0;
    res.data.forEach((o) => {
      const m = /(\d+)$/.exec(o.platform_order_no || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    // also skip numbers that are open right now
    takeaways.forEach((o) => {
      const m = /(\d+)$/.exec(o.platform_order_no || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    openTakeaway('TA-' + String(max + 1).padStart(2, '0'));
  });

  gridBtn.addEventListener('click', () => setView('grid'));
  listBtn.addEventListener('click', () => setView('list'));
  searchInput.addEventListener('input', refreshView);

  function setView(v) {
    view = v;
    try { localStorage.setItem('kamala-table-view', v); } catch (e) { /* ignore */ }
    refreshView();
  }

  // ---------- reservations (Supabase table: table_reservations) ----------
  async function loadReservations() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const res = await supabase
      .from('table_reservations')
      .select('id, table_no, reserved_at, customer_name, phone')
      .eq('status', 'active')
      .gte('reserved_at', start.toISOString())
      .order('reserved_at');
    if (res.error) {
      reservationsOk = false;
      reservations = [];
    } else {
      reservationsOk = true;
      reservations = res.data;
    }
    refreshView();
  }

  function reservationFor(tableNo) {
    return reservations.find((r) => String(r.table_no) === String(tableNo)) || null;
  }

  // ---------- turn the plain table buttons into table cards ----------
  function decorate() {
    grid.querySelectorAll('.table-btn').forEach((b) => {
      if (b.dataset.table) return; // already done
      const strong = b.querySelector('strong');
      if (!strong) return;
      const number = strong.textContent;
      b.dataset.table = number;
      b.dataset.busy = b.classList.contains('table-open') ? '1' : '0';
      b.classList.add('tb-card');

      const info = mk('span', 'tb-info');
      info.append(mk('span', 'tb-status', ''), mk('span', 'tb-time', ''));
      b.replaceChildren(makeIcon(label(number)), info);
    });
    refreshView();
  }

  function refreshView() {
    const counts = { all: 0, available: 0, occupied: 0, reserved: 0, takeaway: takeaways.length };
    const q = searchInput.value.trim().toLowerCase();

    grid.querySelectorAll('.tb-card').forEach((c) => {
      const num = c.dataset.table;
      const busy = c.dataset.busy === '1';
      const rsv = reservationFor(num);
      const state = busy ? 'occupied' : rsv ? 'reserved' : 'available';
      c.dataset.state = state;
      c.dataset.res = !busy && rsv ? rsv.id : '';

      c.classList.remove('tb-st-occupied', 'tb-st-available', 'tb-st-reserved');
      c.classList.add('tb-st-' + state);
      c.querySelector('.tb-status').textContent = state.charAt(0).toUpperCase() + state.slice(1);
      c.querySelector('.tb-time').textContent =
        state === 'occupied' ? elapsed(c.dataset.since) : state === 'reserved' ? clock(rsv.reserved_at) : '';
      c.setAttribute('aria-label', label(num) + ', ' + state);

      counts.all += 1;
      counts[state] += 1;

      const matchSearch = q === '' || label(num).toLowerCase().includes(q) || num.includes(q);
      c.hidden = filter === 'takeaway' || !(matchSearch && (filter === 'all' || filter === state));
    });

    renderTakeaways(q);
    taSection.hidden = !(filter === 'takeaway' || (filter === 'all' && takeaways.length > 0));

    Object.keys(chips).forEach((k) => {
      chips[k].textContent = chips[k].dataset.base + ' (' + counts[k] + ')';
      chips[k].classList.toggle('active', filter === k);
    });
    grid.classList.toggle('tb-list', view === 'list');
    gridBtn.classList.toggle('active', view === 'grid');
    listBtn.classList.toggle('active', view === 'list');
  }

  // ---------- pop-up helper ----------
  function openModal(build) {
    const overlay = mk('div', 'dlg-overlay');
    const card = mk('div', 'dlg-card tb-modal');
    overlay.appendChild(card);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    build(card, close);
    document.body.appendChild(overlay);
    return close;
  }

  function btn(text, cls, onClick) {
    const b = mk('button', cls || '', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- reserve a table ----------
  function nextHalfHour() {
    const d = new Date(Date.now() + 30 * 60000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  reserveBtn.addEventListener('click', () => {
    const free = Array.from(grid.querySelectorAll('.tb-card')).filter((c) => c.dataset.state === 'available');
    openModal((card, close) => {
      card.appendChild(mk('h3', '', 'Reserve a table'));

      if (!reservationsOk) {
        card.appendChild(
          mk('p', 'dlg-message', 'Reservations are not set up yet. Please run the reservation SQL in Supabase first.')
        );
        card.appendChild(mk('div', 'dlg-actions')).appendChild(btn('Close', 'secondary', close));
        return;
      }
      if (free.length === 0) {
        card.appendChild(mk('p', 'dlg-message', 'There is no free table to reserve right now.'));
        card.appendChild(mk('div', 'dlg-actions')).appendChild(btn('Close', 'secondary', close));
        return;
      }

      const field = (text, node) => {
        const l = mk('label', 'tb-field-label', text);
        card.append(l, node);
      };

      const select = document.createElement('select');
      free.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.dataset.table;
        o.textContent = label(c.dataset.table);
        select.appendChild(o);
      });
      const time = document.createElement('input');
      time.type = 'time';
      time.value = nextHalfHour();
      const name = document.createElement('input');
      name.type = 'text';
      name.placeholder = 'Customer name';
      name.maxLength = 60;
      const phone = document.createElement('input');
      phone.type = 'text';
      phone.inputMode = 'tel';
      phone.placeholder = 'Phone (optional)';
      phone.maxLength = 20;
      field('Table', select);
      field('Time (today)', time);
      field('Name', name);
      field('Phone', phone);

      const err = mk('p', 'dlg-error', '');
      err.hidden = true;
      card.appendChild(err);

      const actions = mk('div', 'dlg-actions');
      const save = btn('Reserve', '', async () => {
        err.hidden = true;
        if (!time.value) {
          err.textContent = 'Please choose the time.';
          err.hidden = false;
          return;
        }
        if (!name.value.trim()) {
          err.textContent = 'Please type the customer name.';
          err.hidden = false;
          return;
        }
        const [hh, mm] = time.value.split(':').map(Number);
        const when = new Date();
        when.setHours(hh, mm, 0, 0);

        save.disabled = true;
        const sess = await supabase.auth.getSession();
        const userId = sess.data && sess.data.session ? sess.data.session.user.id : null;
        const { error } = await supabase.from('table_reservations').insert({
          table_no: select.value,
          reserved_at: when.toISOString(),
          customer_name: name.value.trim(),
          phone: phone.value.trim() || null,
          status: 'active',
          created_by: userId,
        });
        if (error) {
          err.textContent = 'Could not save: ' + error.message;
          err.hidden = false;
          save.disabled = false;
          return;
        }
        close();
        loadReservations();
      });
      actions.append(btn('Cancel', 'secondary', close), save);
      card.appendChild(actions);
    });
  });

  // ---------- tapping a reserved table ----------
  grid.addEventListener(
    'click',
    (e) => {
      const card = e.target.closest ? e.target.closest('.tb-card') : null;
      if (!card || card.dataset.state !== 'reserved') return;
      e.stopImmediatePropagation();
      e.preventDefault();

      const rsv = reservations.find((r) => r.id === card.dataset.res);
      if (!rsv) return;

      openModal((box, close) => {
        box.appendChild(mk('h3', '', label(card.dataset.table) + ' is reserved'));
        box.appendChild(
          mk(
            'p',
            'dlg-message',
            rsv.customer_name + '\n' + clock(rsv.reserved_at) + (rsv.phone ? '\n' + rsv.phone : '')
          )
        );
        const err = mk('p', 'dlg-error', '');
        err.hidden = true;
        box.appendChild(err);

        async function setStatus(status) {
          const { error } = await supabase.from('table_reservations').update({ status }).eq('id', rsv.id);
          if (error) {
            err.textContent = 'Could not change the reservation: ' + error.message;
            err.hidden = false;
            return false;
          }
          return true;
        }

        const actions = mk('div', 'dlg-actions tb-actions-col');
        actions.append(
          btn('Customer arrived: start order', '', async () => {
            if (!(await setStatus('seated'))) return;
            close();
            // open the normal order screen for this table
            card.dataset.state = 'available';
            card.click();
            loadReservations();
          }),
          btn('Cancel reservation', 'danger', async () => {
            if (!(await setStatus('cancelled'))) return;
            close();
            loadReservations();
          }),
          btn('Close', 'secondary', close)
        );
        box.appendChild(actions);
      });
    },
    true
  );

  // ---------- keep it fresh ----------
  new MutationObserver(decorate).observe(grid, { childList: true });
  new MutationObserver(() => {
    if (!screen.hidden) { loadReservations(); loadTakeaways(); }
  }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });

  setInterval(() => {
    if (!screen.hidden) { refreshView(); loadTakeaways(); } // updates the "1h 12m" times
  }, 30000);

  decorate();
  loadReservations();
  loadTakeaways();
}
