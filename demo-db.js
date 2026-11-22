// =====================================================================
// DEMO DATABASE
// This file pretends to be Supabase, but everything is kept inside the
// visitor's own browser (localStorage). Nothing is sent to any server.
// Every visitor gets a private copy of the Demo Restaurant. It starts
// fresh every day, or when the visitor presses "Reset demo".
// =====================================================================
import { seedDemo } from './demo-seed.js';

const KEY = 'sarvesh_pos_demo_v1';

function todayKL() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

let db = null;
try {
  db = JSON.parse(localStorage.getItem(KEY) || 'null');
} catch (e) {
  db = null;
}
if (!db || !db.t || db.day !== todayKL()) {
  const keepSession = db && db.day === todayKL() ? db.session : null;
  db = seedDemo();
  db.day = todayKL();
  db.session = keepSession;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      // storage full (usually too many photos): drop the uploaded photos and try again
      db.files = {};
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e2) {
        /* ignore */
      }
    }
  }, 120);
}
save();

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.clear();
  } catch (e) {
    /* ignore */
  }
  location.reload();
}

// ---------- helpers ----------
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const nowISO = () => new Date().toISOString();
const cents = (v) => Math.round(Number(v || 0) * 100);
const rm = (c) => Math.round(c) / 100;
const fail = (message) => ({ data: null, error: { message, code: 'DEMO' }, count: null, status: 400 });
const ok = (data, count) => ({ data, error: null, count: count === undefined ? null : count, status: 200 });

function table(name) {
  if (!db.t[name]) db.t[name] = [];
  return db.t[name];
}
function nextId(name) {
  db.seq[name] = (db.seq[name] || 0) + 1;
  return db.seq[name];
}

const KEY_COL = { app_settings: 'key', settings: 'key', day_closings: 'closing_date', profiles: 'id' };

const DEFAULTS = {
  orders: () => ({ status: 'open', paid_subtotal: 0, payment_id: null, closed_at: null, created_at: nowISO() }),
  order_items: () => ({ status: 'active', paid_part_id: null, note: null, modifiers: [], created_at: nowISO() }),
  payments: () => ({ created_at: nowISO(), rounding: 0, discount: 0 }),
  refunds: () => ({ created_at: nowISO() }),
  cash_movements: () => ({ created_at: nowISO() }),
  table_reservations: () => ({ created_at: nowISO(), status: 'active' }),
  shifts: () => ({ opened_at: nowISO(), closed_at: null, created_at: nowISO() }),
  categories: () => ({ active: true, sort_order: 0 }),
  menu_items: () => ({ active: true, sold_out: false, available_for: 'both', image_url: null, delivery_price: null }),
  modifier_groups: () => ({ active: true, required: false, multi: false, sort_order: 0 }),
  modifier_options: () => ({ active: true, price: 0, sort_order: 0 }),
};

function same(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return String(a) === String(b);
}
function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && typeof a !== 'boolean') return na - nb;
  return String(a) < String(b) ? -1 : 1;
}

// split "a, b, rel(x, y), c" at top-level commas
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function embedsOf(select) {
  if (!select) return [];
  return splitTop(select)
    .map((part) => {
      const m = part.match(/^([a-z_]+)\s*\((.*)\)$/s);
      return m ? { rel: m[1], inner: m[2] } : null;
    })
    .filter(Boolean);
}
const singular = (n) => n.replace(/s$/, '');

function attachEmbeds(tableName, rows, select) {
  embedsOf(select).forEach(({ rel, inner }) => {
    const relRows = table(rel);
    const childKey = singular(tableName) + '_id'; // e.g. order_items.order_id
    const parentKey = singular(rel) + '_id'; // e.g. order_items.order_id -> orders
    rows.forEach((r) => {
      if (relRows.length && Object.prototype.hasOwnProperty.call(relRows[0], childKey)) {
        const kids = relRows.filter((x) => same(x[childKey], r.id)).map(clone);
        attachEmbeds(rel, kids, inner);
        r[rel] = kids;
      } else {
        const p = relRows.find((x) => same(x.id, r[parentKey]));
        const pc = p ? clone(p) : null;
        if (pc) attachEmbeds(rel, [pc], inner);
        r[rel] = pc;
      }
    });
  });
  return rows;
}

// ---------- query builder (supabase.from(...)) ----------
class Query {
  constructor(name) {
    this.name = name;
    this.action = 'select';
    this.filters = [];
    this.orders = [];
    this.lim = null;
    this.rng = null;
    this.one = null; // 'single' | 'maybe'
    this.wantRows = false;
    this.sel = '*';
    this.head = false;
    this.countMode = null;
  }
  select(cols, opts) {
    if (this.action === 'select') {
      this.sel = cols || '*';
      if (opts && opts.head) this.head = true;
      if (opts && opts.count) this.countMode = opts.count;
    } else {
      this.wantRows = true;
      this.sel = cols || '*';
    }
    return this;
  }
  insert(rows) {
    this.action = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows) {
    this.action = 'upsert';
    this.payload = rows;
    return this;
  }
  update(patch) {
    this.action = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.action = 'delete';
    return this;
  }
  eq(c, v) { this.filters.push((r) => same(r[c], v)); return this; }
  neq(c, v) { this.filters.push((r) => !same(r[c], v)); return this; }
  gt(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) > 0); return this; }
  gte(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) >= 0); return this; }
  lt(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) < 0); return this; }
  lte(c, v) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) <= 0); return this; }
  in(c, list) { const l = (list || []).map(String); this.filters.push((r) => r[c] !== null && r[c] !== undefined && l.includes(String(r[c]))); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  not(c, op, v) {
    if (op === 'is' && (v === null || v === 'null')) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    else if (op === 'eq') this.filters.push((r) => !same(r[c], v));
    return this;
  }
  ilike(c, pat) {
    const re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
    this.filters.push((r) => re.test(String(r[c] || '')));
    return this;
  }
  like(c, pat) { return this.ilike(c, pat); }
  order(c, opts) { this.orders.push({ c, asc: !(opts && opts.ascending === false) }); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(resolve, reject) {
    let res;
    try {
      res = this.run();
    } catch (e) {
      res = fail(e.message || String(e));
    }
    return Promise.resolve(res).then(resolve, reject);
  }

  match() {
    return table(this.name).filter((r) => this.filters.every((f) => f(r)));
  }
  shape(rows) {
    let out = rows.map(clone);
    if (this.orders.length) {
      out.sort((a, b) => {
        for (const o of this.orders) {
          const d = cmp(a[o.c], b[o.c]);
          if (d !== 0) return o.asc ? d : -d;
        }
        return 0;
      });
    }
    const total = out.length;
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim !== null) out = out.slice(0, this.lim);
    attachEmbeds(this.name, out, this.sel);
    return { out, total };
  }
  finish(rows, count) {
    if (this.one) {
      if (rows.length === 1) return ok(rows[0], count);
      if (rows.length === 0 && this.one === 'maybe') return ok(null, count);
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null, status: 406 };
    }
    return ok(rows, count);
  }

  run() {
    const name = this.name;
    if (this.action === 'select') {
      const { out, total } = this.shape(this.match());
      if (this.head) return ok(null, total);
      return this.finish(out, this.countMode ? total : undefined);
    }

    if (this.action === 'insert' || this.action === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keyCol = KEY_COL[name] || 'id';
      const done = [];
      list.forEach((row) => {
        if (this.action === 'upsert') {
          const existing = table(name).find((x) => same(x[keyCol], row[keyCol]));
          if (existing) {
            Object.assign(existing, clone(row));
            done.push(existing);
            return;
          }
        }
        const base = DEFAULTS[name] ? DEFAULTS[name]() : {};
        const r = Object.assign(base, clone(row));
        if (keyCol === 'id' && (r.id === undefined || r.id === null)) r.id = nextId(name);
        table(name).push(r);
        done.push(r);
      });
      save();
      if (!this.wantRows) return ok(null);
      const { out } = this.shapeRows(done);
      return this.finish(out);
    }

    if (this.action === 'update') {
      const rows = this.match();
      const patch = this.payload || {};
      // same guards as the real database
      if (name === 'order_items') {
        for (const r of rows) {
          if (r.paid_part_id && ((patch.status && patch.status !== r.status) || (patch.qty !== undefined && patch.qty !== r.qty))) {
            return fail('This item is already paid and cannot be changed.');
          }
        }
      }
      if (name === 'orders') {
        for (const r of rows) {
          if (Number(r.paid_subtotal) > 0 && r.status === 'open' && patch.status === 'cancelled') {
            return fail('Part of this bill is already paid, so it cannot be cancelled.');
          }
        }
      }
      rows.forEach((r) => Object.assign(r, clone(patch)));
      save();
      if (!this.wantRows) return ok(null);
      return this.finish(this.shapeRows(rows).out);
    }

    if (this.action === 'delete') {
      const rows = this.match();
      db.t[name] = table(name).filter((r) => !rows.includes(r));
      // remove children too (like ON DELETE CASCADE)
      if (name === 'modifier_groups') {
        const ids = rows.map((r) => String(r.id));
        db.t.modifier_options = table('modifier_options').filter((o) => !ids.includes(String(o.group_id)));
        db.t.menu_item_modifier_groups = table('menu_item_modifier_groups').filter((o) => !ids.includes(String(o.group_id)));
      }
      save();
      if (!this.wantRows) return ok(null);
      return this.finish(rows.map(clone));
    }
    return fail('Not supported in the demo.');
  }
  shapeRows(rows) {
    const out = rows.map(clone);
    attachEmbeds(this.name, out, this.sel);
    return { out };
  }
}

// ---------- the logged-in staff member ----------
const listeners = [];
function sessionObj() {
  if (!db.session) return null;
  const p = table('profiles').find((x) => x.id === db.session);
  if (!p) return null;
  return { access_token: 'demo', token_type: 'bearer', user: { id: p.id, email: p.email, role: 'authenticated' } };
}
function emit(event) {
  const s = sessionObj();
  listeners.slice().forEach((cb) => {
    try {
      cb(event, s);
    } catch (e) {
      /* ignore */
    }
  });
}
function me() {
  return table('profiles').find((x) => x.id === db.session) || null;
}

const auth = {
  async getSession() {
    return { data: { session: sessionObj() }, error: null };
  },
  async getUser() {
    const s = sessionObj();
    return { data: { user: s ? s.user : null }, error: null };
  },
  async signInWithPassword({ email }) {
    const p = table('profiles').find((x) => String(x.email).toLowerCase() === String(email || '').toLowerCase());
    if (!p) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
    db.session = p.id;
    save();
    const s = sessionObj();
    setTimeout(() => emit('SIGNED_IN'), 0);
    return { data: { session: s, user: s.user }, error: null };
  },
  async signOut() {
    db.session = null;
    save();
    setTimeout(() => emit('SIGNED_OUT'), 0);
    return { error: null };
  },
  onAuthStateChange(cb) {
    listeners.push(cb);
    setTimeout(() => {
      try {
        cb('INITIAL_SESSION', sessionObj());
      } catch (e) {
        /* ignore */
      }
    }, 0);
    return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } } } };
  },
};

// ---------- photos (kept in the browser as pictures) ----------
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
const storage = {
  from(bucket) {
    return {
      async upload(path, blob) {
        try {
          db.files[bucket + '/' + path] = await blobToDataUrl(blob);
          save();
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: 'Could not read the picture.' } };
        }
      },
      getPublicUrl(path) {
        return { data: { publicUrl: db.files[bucket + '/' + path] || '' } };
      },
      async remove(paths) {
        (paths || []).forEach((p) => delete db.files[bucket + '/' + p]);
        save();
        return { data: [], error: null };
      },
    };
  },
};

// ---------- server functions (same rules as the real POS) ----------
function roundingOn() {
  const s = table('settings').find((x) => x.key === 'rounding_5sen');
  return s ? s.value === 'on' : true;
}
function roundAdj(c) {
  if (!roundingOn()) return 0;
  const last = ((Math.round(c) % 10) + 10) % 10;
  return { 1: -1, 2: -2, 3: 2, 4: 1, 6: -1, 7: -2, 8: 2, 9: 1 }[last] || 0;
}
function receiptNo() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).replace(/-/g, '').slice(2);
  db.seq.receipt = (db.seq.receipt || 0) + 1;
  return 'DR' + d + '-' + String(db.seq.receipt).padStart(4, '0');
}
function activeItems(orderId) {
  return table('order_items').filter((i) => same(i.order_id, orderId) && i.status === 'active');
}

const RPC = {
  pin_lookup({ p_pin }) {
    const p = table('profiles').find((x) => x.pin === String(p_pin) && x.active);
    return ok(p ? p.email : null);
  },

  set_sold_out({ p_item_id, p_sold_out }) {
    const it = table('menu_items').find((x) => same(x.id, p_item_id));
    if (!it) return fail('Item not found.');
    it.sold_out = !!p_sold_out;
    save();
    return ok(null);
  },

  pay_orders({ p_order_ids, p_method, p_cash_received, p_discount_type, p_discount_value, p_discount_reason }) {
    if (!me()) return fail('Not allowed.');
    const ids = (p_order_ids || []).map(String);
    if (!ids.length) return fail('Choose at least one order.');
    const orders = table('orders').filter((o) => ids.includes(String(o.id)));
    if (orders.length !== ids.length) return fail('Order not found.');
    for (const o of orders) {
      if (o.status !== 'open') return fail('One of the orders is not open any more.');
      if (Number(o.paid_subtotal) > 0) return fail('Part of this bill is already paid. Use Split bill to pay the rest.');
    }
    if (!['cash', 'duitnow'].includes(p_method)) return fail('Wrong payment method.');
    let sub = 0;
    orders.forEach((o) => activeItems(o.id).forEach((i) => (sub += cents(i.unit_price) * i.qty)));
    if (sub <= 0) return fail('There is nothing to pay.');
    let disc = 0;
    if (p_discount_type === 'percent') disc = Math.round((sub * Number(p_discount_value || 0)) / 100);
    else if (p_discount_type === 'amount') disc = cents(p_discount_value);
    disc = Math.max(0, Math.min(disc, sub));
    const net = sub - disc;
    const adj = roundAdj(net);
    const total = net + adj;
    if (p_method === 'cash' && p_cash_received !== null && cents(p_cash_received) < total) {
      return fail('The cash received is less than the total.');
    }
    const rec = receiptNo();
    const pay = {
      id: nextId('payments'),
      method: p_method,
      amount: rm(total),
      cash_received: p_method === 'cash' ? (p_cash_received === null ? rm(total) : Number(p_cash_received)) : null,
      receipt_no: rec,
      paid_by: db.session,
      rounding: rm(adj),
      discount: rm(disc),
      discount_type: disc > 0 ? p_discount_type : null,
      discount_value: disc > 0 ? Number(p_discount_value) : 0,
      discount_reason: disc > 0 ? p_discount_reason : null,
      created_at: nowISO(),
      order_id: null,
      part_label: null,
      tender_seq: null,
      group_receipt: null,
    };
    table('payments').push(pay);
    orders.forEach((o) => Object.assign(o, { status: 'paid', payment_id: pay.id, closed_at: nowISO() }));
    save();
    return ok({ payment_id: pay.id, receipt_no: rec, subtotal: rm(sub), discount: rm(disc), rounding: rm(adj), total: rm(total), final: rm(total) });
  },

  pay_part({ p_order_id, p_items, p_amount, p_tenders, p_label }) {
    if (!me()) return fail('Not allowed.');
    const ord = table('orders').find((o) => same(o.id, p_order_id));
    if (!ord) return fail('Order not found.');
    if (ord.status !== 'open') return fail('This order is not open.');
    const all = activeItems(ord.id);
    const totalC = all.reduce((n, i) => n + cents(i.unit_price) * i.qty, 0);
    const remain = totalC - cents(ord.paid_subtotal);
    if (remain <= 0) return fail('Nothing left to pay on this bill.');
    const useItems = Array.isArray(p_items) && p_items.length > 0;
    let share = 0;
    if (useItems) {
      for (const it of p_items) {
        const row = all.find((r) => same(r.id, it.id) && !r.paid_part_id);
        if (!row) return fail('An item is not available (already paid or removed).');
        const q = Number(it.qty);
        if (!q || q < 1 || q > row.qty) return fail('Wrong quantity for ' + row.item_name + '.');
        share += cents(row.unit_price) * q;
      }
    } else share = cents(p_amount);
    if (share <= 0) return fail('The share is empty.');
    if (share > remain) return fail('The share (RM ' + rm(share).toFixed(2) + ') is more than the amount left (RM ' + rm(remain).toFixed(2) + ').');
    const adj = roundAdj(share);
    const fin = share + adj;
    if (!Array.isArray(p_tenders) || p_tenders.length < 1 || p_tenders.length > 2) return fail('Choose how the customer pays.');
    let sum = 0;
    for (const t of p_tenders) {
      const a = cents(t.amount);
      if (!['cash', 'duitnow'].includes(t.method)) return fail('Wrong payment method.');
      if (a <= 0) return fail('A payment amount is empty.');
      if (t.method === 'cash' && t.received !== undefined && t.received !== null && cents(t.received) < a) return fail('The cash received is less than the cash amount.');
      sum += a;
    }
    if (sum !== fin) return fail('The payments (RM ' + rm(sum).toFixed(2) + ') must equal the total (RM ' + rm(fin).toFixed(2) + ').');
    if (p_tenders.length === 2 && p_tenders[0].method === p_tenders[1].method) return fail('Use one cash and one DuitNow payment.');
    const base = receiptNo();
    const ids = [];
    p_tenders.forEach((t, i) => {
      const a = cents(t.amount);
      const pay = {
        id: nextId('payments'),
        method: t.method,
        amount: rm(a),
        cash_received: t.method === 'cash' ? (t.received !== undefined && t.received !== null ? Number(t.received) : rm(a)) : null,
        receipt_no: i === 0 ? base : base + '-2',
        paid_by: db.session,
        rounding: i === 0 ? rm(adj) : 0,
        discount: 0,
        discount_value: 0,
        created_at: nowISO(),
        order_id: ord.id,
        part_label: String(p_label || '').slice(0, 60),
        tender_seq: p_tenders.length === 2 ? i + 1 : null,
        group_receipt: base,
      };
      table('payments').push(pay);
      ids.push(pay.id);
    });
    const first = ids[0];
    if (useItems) {
      p_items.forEach((it) => {
        const row = table('order_items').find((r) => same(r.id, it.id));
        const q = Number(it.qty);
        if (q === row.qty) row.paid_part_id = first;
        else {
          row.qty -= q;
          table('order_items').push(Object.assign(clone(row), { id: nextId('order_items'), qty: q, paid_part_id: first }));
        }
      });
    }
    const newPaid = cents(ord.paid_subtotal) + share;
    if (newPaid >= totalC) Object.assign(ord, { paid_subtotal: rm(newPaid), status: 'paid', payment_id: first, closed_at: nowISO() });
    else ord.paid_subtotal = rm(newPaid);
    save();
    return ok({ payment_ids: ids, payment_id: first, receipt_no: base, subtotal: rm(share), rounding: rm(adj), total: rm(fin), final: rm(fin), remaining: rm(totalC - newPaid) });
  },

  refund_payment({ p_payment_id, p_amount, p_method, p_reason }) {
    const u = me();
    if (!u || !['owner', 'cashier'].includes(u.role)) return fail('Only the owner or a cashier can refund.');
    if (!['cash', 'duitnow'].includes(p_method)) return fail('Wrong refund method.');
    if (!String(p_reason || '').trim()) return fail('A reason is required.');
    const amt = cents(p_amount);
    if (amt <= 0) return fail('The refund amount is empty.');
    const pay = table('payments').find((p) => same(p.id, p_payment_id));
    if (!pay) return fail('Receipt not found.');
    let prim = pay.id;
    let group = cents(pay.amount);
    if (pay.group_receipt) {
      const g = table('payments').filter((p) => p.group_receipt === pay.group_receipt).sort((a, b) => (a.tender_seq || 1) - (b.tender_seq || 1) || a.id - b.id);
      prim = g[0].id;
      group = g.reduce((n, p) => n + cents(p.amount), 0);
    }
    const done = table('refunds').filter((r) => same(r.payment_id, prim)).reduce((n, r) => n + cents(r.amount), 0);
    if (amt > group - done) return fail('The most you can refund is RM ' + rm(group - done).toFixed(2) + '.');
    table('refunds').push({ id: nextId('refunds'), payment_id: prim, amount: rm(amt), method: p_method, reason: String(p_reason).trim(), refunded_by: u.id, refunded_by_name: u.full_name, created_at: nowISO() });
    save();
    return ok({ payment_id: prim, refunded: rm(amt), left: rm(group - done - amt) });
  },
};

export const demoDb = {
  from: (name) => new Query(name),
  async rpc(name, args) {
    const fn = RPC[name];
    if (!fn) return fail('Could not find the function ' + name);
    try {
      return fn(args || {});
    } catch (e) {
      return fail(e.message || String(e));
    }
  },
  auth,
  storage,
  channel() {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
    return ch;
  },
  removeChannel() {},
};
