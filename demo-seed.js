// =====================================================================
// DEMO SAMPLE DATA for "Demo Restaurant"
// Made fresh every day: menu, staff, open tables, a reservation, an open
// shift and about 30 days of past sales (so Dashboard and Reports look alive).
// =====================================================================

// a simple food picture (coloured card + emoji), no photo files needed
function pic(emoji, a, b) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
    '<defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="' + a + '"/>' +
    '<stop offset="1" stop-color="' + b + '"/></radialGradient></defs>' +
    '<rect width="400" height="300" fill="url(#g)"/>' +
    '<circle cx="200" cy="150" r="96" fill="rgba(255,255,255,0.16)"/>' +
    '<text x="200" y="152" font-size="132" text-anchor="middle" dominant-baseline="central">' + emoji + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const DEMO_LOGO =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f5c43"/><stop offset="1" stop-color="#06291f"/></linearGradient></defs>' +
      '<circle cx="100" cy="100" r="96" fill="url(#g)" stroke="#d9b55a" stroke-width="6"/>' +
      '<text x="100" y="92" font-size="66" text-anchor="middle" dominant-baseline="central">🍽️</text>' +
      '<text x="100" y="150" font-family="Arial, sans-serif" font-weight="700" font-size="22" fill="#f3dc9a" text-anchor="middle" letter-spacing="2">DEMO</text></svg>'
  );

const DEMO_QR =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    (() => {
      let cells = '';
      let s = 7;
      for (let y = 0; y < 25; y++)
        for (let x = 0; x < 25; x++) {
          s = (s * 9301 + 49297) % 233280;
          const finder = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
          if (!finder && s / 233280 > 0.55) cells += '<rect x="' + x * 8 + '" y="' + y * 8 + '" width="8" height="8"/>';
        }
      const f = (x, y) =>
        '<rect x="' + x + '" y="' + y + '" width="56" height="56" fill="#000"/><rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="40" height="40" fill="#fff"/><rect x="' + (x + 16) + '" y="' + (y + 16) + '" width="24" height="24" fill="#000"/>';
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 224 224"><rect x="-12" y="-12" width="224" height="224" fill="#fff"/><g fill="#000">' +
        cells + '</g>' + f(0, 0) + f(144, 0) + f(0, 144) +
        '<rect x="62" y="86" width="76" height="28" rx="6" fill="#e2156b"/><text x="100" y="105" font-family="Arial" font-weight="700" font-size="15" fill="#fff" text-anchor="middle">DEMO</text></svg>'
      );
    })()
  );

const CATS = [
  [1, 'Rice', '#f6b93b', '#c0392b'],
  [2, 'Noodles', '#f8c291', '#b33939'],
  [3, 'Roti & Thosai', '#ffeaa7', '#d35400'],
  [4, 'Drinks', '#81ecec', '#0a7d6b'],
  [5, 'Desserts', '#fab1a0', '#8e44ad'],
];

// [id, category, name, price, emoji, available_for]
const MENU = [
  [1, 1, 'Nasi Lemak Ayam Goreng', 12.9, '🍛'],
  [2, 1, 'Nasi Goreng Kampung', 9.5, '🍳'],
  [3, 1, 'Nasi Briyani Kambing', 16.9, '🍲'],
  [4, 1, 'Banana Leaf Rice', 11.0, '🍃'],
  [5, 1, 'Chicken Rice', 9.9, '🍗'],
  [6, 2, 'Mee Goreng Mamak', 8.5, '🍜'],
  [7, 2, 'Char Kuey Teow', 10.9, '🍝'],
  [8, 2, 'Maggi Goreng', 7.5, '🥢'],
  [9, 2, 'Curry Laksa', 10.5, '🥘'],
  [10, 3, 'Roti Canai', 1.8, '🫓'],
  [11, 3, 'Roti Telur', 2.8, '🥚'],
  [12, 3, 'Thosai Masala', 4.5, '🌯'],
  [13, 3, 'Roti Tisu', 5.0, '🧻'],
  [14, 4, 'Teh Tarik', 2.8, '☕'],
  [15, 4, 'Kopi O', 2.2, '🫖'],
  [16, 4, 'Milo Ais', 3.8, '🧋'],
  [17, 4, 'Sirap Bandung', 3.5, '🍹'],
  [18, 4, 'Fresh Orange Juice', 6.5, '🍊'],
  [19, 4, 'Mineral Water', 1.5, '💧'],
  [20, 5, 'Cendol', 5.5, '🍧'],
  [21, 5, 'ABC Special', 6.9, '🍨'],
  [22, 5, 'Pisang Goreng', 4.0, '🍌'],
];

const PEOPLE = [
  { id: 'demo-owner', full_name: 'Demo Owner', role: 'owner', pin: '1111', email: 'owner@demo.pos' },
  { id: 'demo-cashier', full_name: 'Siti (Cashier)', role: 'cashier', pin: '2222', email: 'cashier@demo.pos' },
  { id: 'demo-waiter', full_name: 'Ravi (Waiter)', role: 'waiter', pin: '3333', email: 'waiter@demo.pos' },
];

// simple repeatable random numbers, so the sample data looks the same every time
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// a time in Malaysia: day offset (0 = today), hour, minute -> ISO text
function klTime(dayOffset, h, m) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const base = new Date(today + 'T00:00:00+08:00').getTime();
  return new Date(base + dayOffset * 86400000 + (h * 60 + m) * 60000).toISOString();
}

export function seedDemo() {
  const t = {
    profiles: PEOPLE.map((p) => ({ ...p, active: true })),
    categories: CATS.map(([id, name], i) => ({ id, name, sort_order: i + 1, active: true })),
    menu_items: MENU.map(([id, cat, name, price, emoji]) => {
      const c = CATS.find((x) => x[0] === cat);
      return { id, category_id: cat, name, price, delivery_price: null, active: true, sold_out: false, available_for: 'both', image_url: pic(emoji, c[2], c[3]) };
    }),
    modifier_groups: [
      { id: 1, name: 'Spice level', required: true, multi: false, sort_order: 1, active: true },
      { id: 2, name: 'Add-ons', required: false, multi: true, sort_order: 2, active: true },
      { id: 3, name: 'Hot or Iced', required: true, multi: false, sort_order: 3, active: true },
      { id: 4, name: 'Sugar level', required: false, multi: false, sort_order: 4, active: true },
    ],
    modifier_options: [
      [1, 1, 'Mild', 0], [2, 1, 'Normal', 0], [3, 1, 'Extra spicy', 0],
      [4, 2, 'Fried egg', 1.5], [5, 2, 'Fried chicken', 4.0], [6, 2, 'Extra sambal', 1.0],
      [7, 3, 'Hot', 0], [8, 3, 'Iced', 0.5],
      [9, 4, 'Normal', 0], [10, 4, 'Less sugar', 0], [11, 4, 'No sugar', 0],
    ].map(([id, group_id, name, price], i) => ({ id, group_id, name, price, sort_order: i, active: true })),
    menu_item_modifier_groups: [],
    orders: [],
    order_items: [],
    payments: [],
    refunds: [],
    shifts: [],
    cash_movements: [],
    table_reservations: [],
    day_closings: [],
    settings: [{ key: 'rounding_5sen', value: 'on' }],
    app_settings: [
      {
        key: 'shop',
        value: {
          name: 'Demo Restaurant',
          tagline: 'Malaysian Cuisine',
          lines: ['No. 1, Jalan Demo 1/1', '50000 Kuala Lumpur'],
          phone: '03-1234 5678',
          email: '',
          logo: DEMO_LOGO,
          qr: DEMO_QR,
          footer: 'Thank you! This is a demo receipt.',
          font: 'classic',
        },
        updated_at: new Date().toISOString(),
      },
    ],
  };

  // which dishes get which options
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((id) => {
    t.menu_item_modifier_groups.push({ menu_item_id: id, group_id: 1 });
    t.menu_item_modifier_groups.push({ menu_item_id: id, group_id: 2 });
  });
  [14, 15, 16, 17].forEach((id) => {
    t.menu_item_modifier_groups.push({ menu_item_id: id, group_id: 3 });
    t.menu_item_modifier_groups.push({ menu_item_id: id, group_id: 4 });
  });

  const seq = { orders: 0, order_items: 0, payments: 0, refunds: 0, shifts: 0, cash_movements: 0, table_reservations: 0, receipt: 0 };
  const id = (k) => ++seq[k];
  const R = rng(20261122);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const nowMs = Date.now();
  const nowKLmin = (() => {
    const p = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false }).split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  })();
  const popular = [1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 7, 8, 9, 10, 10, 10, 11, 12, 13, 14, 14, 14, 14, 15, 16, 16, 17, 18, 19, 20, 21, 22];

  function addItems(orderId, created, n, status) {
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const mid = pick(popular);
      if (used.has(mid)) continue;
      used.add(mid);
      const m = MENU.find((x) => x[0] === mid);
      const qty = mid === 10 || mid === 14 ? 1 + Math.floor(R() * 3) : R() < 0.15 ? 2 : 1;
      t.order_items.push({
        id: id('order_items'), order_id: orderId, menu_item_id: mid, item_name: m[2], unit_price: m[3], qty,
        serve_type: 'dine_in', note: null, modifiers: [], status: status || 'active', created_at: created,
        created_by: pick(['demo-waiter', 'demo-cashier']), paid_part_id: null,
      });
    }
  }
  function itemsTotalC(orderId) {
    return t.order_items.filter((i) => i.order_id === orderId && i.status === 'active').reduce((s, i) => s + Math.round(i.unit_price * 100) * i.qty, 0);
  }
  function adj5(c) {
    return { 1: -1, 2: -2, 3: 2, 4: 1, 6: -1, 7: -2, 8: 2, 9: 1 }[c % 10] || 0;
  }

  // ---------- past sales: the last 30 days + today until now ----------
  for (let d = -30; d <= 0; d++) {
    const weekend = [0, 6].includes(new Date(klTime(d, 12, 0)).getUTCDay());
    const count = Math.round((weekend ? 26 : 16) + R() * 10);
    const minutes = [];
    for (let k = 0; k < count; k++) minutes.push(8 * 60 + Math.floor(R() * 13 * 60)); // 8:00 am to 9:00 pm
    minutes.sort((x, y) => x - y); // receipt numbers follow the time
    for (let k = 0; k < count; k++) {
      const minute = minutes[k];
      if (d === 0 && minute > nowKLmin - 20) continue; // today: only sales before now
      const created = klTime(d, 0, minute - 25);
      const paidAt = klTime(d, 0, minute);
      const isTable = R() < 0.75;
      const oid = id('orders');
      t.orders.push({
        id: oid, order_type: isTable ? 'table' : 'takeaway', table_no: isTable ? String(1 + Math.floor(R() * 12)) : null,
        platform_order_no: isTable ? null : 'TA-' + String(1 + (k % 30)).padStart(2, '0'), status: 'paid',
        created_by: 'demo-waiter', created_at: created, closed_at: paidAt, paid_subtotal: 0, payment_id: null,
      });
      addItems(oid, created, 2 + Math.floor(R() * 4));
      if (!isTable) t.order_items.filter((i) => i.order_id === oid).forEach((i) => (i.serve_type = 'bungkus'));
      const sub = itemsTotalC(oid);
      if (sub <= 0) continue;
      const adj = adj5(sub);
      const total = sub + adj;
      const cash = R() < 0.6;
      const pid = id('payments');
      seq.receipt++;
      const ds = new Date(new Date(paidAt).getTime() + 8 * 3600000).toISOString().slice(2, 10).replace(/-/g, '');
      t.payments.push({
        id: pid, method: cash ? 'cash' : 'duitnow', amount: total / 100,
        cash_received: cash ? Math.ceil(total / 1000) * 10 : null, receipt_no: 'DR' + ds + '-' + String(seq.receipt).padStart(4, '0'),
        paid_by: 'demo-cashier', rounding: adj / 100, discount: 0, discount_type: null, discount_value: 0,
        created_at: paidAt, order_id: null, part_label: null, tender_seq: null, group_receipt: null,
      });
      t.orders[t.orders.length - 1].payment_id = pid;
      // now and then a cancelled item
      if (R() < 0.05) {
        const m = MENU[Math.floor(R() * MENU.length)];
        t.order_items.push({
          id: id('order_items'), order_id: oid, menu_item_id: m[0], item_name: m[2], unit_price: m[3], qty: 1, serve_type: 'dine_in',
          note: null, modifiers: [], status: 'cancelled', cancel_reason: pick(['Customer changed mind', 'Wrong order', 'Out of stock']),
          cancelled_by: 'demo-owner', cancelled_at: created, created_at: created, created_by: 'demo-waiter', paid_part_id: null,
        });
      }
    }
  }
  // one past refund
  const somePay = t.payments.find((p) => p.created_at < klTime(-2, 0, 0) && p.amount > 10);
  if (somePay) {
    t.refunds.push({ id: id('refunds'), payment_id: somePay.id, amount: 5.0, method: somePay.method, reason: 'Dish served cold', refunded_by: 'demo-owner', refunded_by_name: 'Demo Owner', created_at: somePay.created_at });
  }

  // ---------- closed shifts for the last 5 days ----------
  for (let d = -5; d <= -1; d++) {
    const from = klTime(d, 8, 0);
    const to = klTime(d, 22, 0);
    const pays = t.payments.filter((p) => p.created_at >= from && p.created_at < to);
    const cashC = pays.filter((p) => p.method === 'cash').reduce((s, p) => s + Math.round(p.amount * 100), 0);
    const qrC = pays.filter((p) => p.method !== 'cash').reduce((s, p) => s + Math.round(p.amount * 100), 0);
    const expected = 20000 + cashC;
    const diff = d === -3 ? -200 : 0;
    t.shifts.push({
      id: id('shifts'), opening_cash: 200, opened_by: 'demo-cashier', opened_by_name: 'Siti (Cashier)', opened_at: from, created_at: from,
      closed_at: to, closed_by: 'demo-cashier', closed_by_name: 'Siti (Cashier)', counted_cash: (expected + diff) / 100,
      expected_cash: expected / 100, difference: diff / 100, cash_sales: cashC / 100, qr_sales: qrC / 100,
      total_sales: (cashC + qrC) / 100, gross_sales: (cashC + qrC) / 100, refunds: 0, refunds_cash: 0, note: d === -3 ? 'RM 2 short' : null,
    });
  }

  // ---------- today's shift (open) ----------
  const openedAt = new Date(Math.min(new Date(klTime(0, 8, 0)).getTime(), nowMs - 30 * 60000)).toISOString();
  const shiftId = id('shifts');
  t.shifts.push({ id: shiftId, opening_cash: 200, opened_by: 'demo-cashier', opened_by_name: 'Siti (Cashier)', opened_at: openedAt, created_at: openedAt, closed_at: null });
  t.cash_movements.push({ id: id('cash_movements'), shift_id: shiftId, kind: 'out', amount: 15, reason: 'Buy ice', note: 'Ice for drinks', created_by: 'demo-cashier', created_by_name: 'Siti (Cashier)', created_at: new Date(nowMs - 20 * 60000).toISOString() });

  // ---------- tables that are busy right now ----------
  [
    ['2', 26, 3],
    ['5', 48, 5],
    ['7', 9, 2],
    ['10', 15, 4],
  ].forEach(([table, minsAgo, n]) => {
    const created = new Date(nowMs - minsAgo * 60000).toISOString();
    const oid = id('orders');
    t.orders.push({ id: oid, order_type: 'table', table_no: table, platform_order_no: null, status: 'open', created_by: 'demo-waiter', created_at: created, closed_at: null, paid_subtotal: 0, payment_id: null });
    addItems(oid, created, n + 1);
  });
  // one open takeaway
  const taCreated = new Date(nowMs - 6 * 60000).toISOString();
  const ta = id('orders');
  t.orders.push({ id: ta, order_type: 'takeaway', table_no: null, platform_order_no: 'TA-01', status: 'open', created_by: 'demo-cashier', created_at: taCreated, closed_at: null, paid_subtotal: 0, payment_id: null });
  addItems(ta, taCreated, 3);
  t.order_items.filter((i) => i.order_id === ta).forEach((i) => (i.serve_type = 'bungkus'));

  // a reservation for tonight
  t.table_reservations.push({ id: id('table_reservations'), table_no: '9', reserved_at: klTime(0, 20, 0), customer_name: 'Mr. Tan (party of 6)', phone: '012-345 6789', status: 'active', created_by: 'demo-owner', created_at: new Date().toISOString() });

  // highest ids so new rows continue after the sample ones
  const maxId = (k) => t[k].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  ['categories', 'menu_items', 'modifier_groups', 'modifier_options', 'orders', 'order_items', 'payments', 'refunds', 'shifts', 'cash_movements', 'table_reservations', 'day_closings'].forEach((k) => {
    seq[k] = Math.max(seq[k] || 0, maxId(k));
  });

  return { t, seq, files: {}, session: null };
}
