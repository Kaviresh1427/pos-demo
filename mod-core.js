// Modifiers (item options such as Spice level, Hot / Iced, Extra egg): shared helpers.
// Everything here is safe when modifiers.sql has not been run yet: modsReady() simply says "no".
import { supabase } from './common.js';

let readyCache = null;
export async function modsReady() {
  if (readyCache) return true;
  const a = await supabase.from('modifier_groups').select('id').limit(1);
  const b = a.error ? a : await supabase.from('order_items').select('modifiers').limit(1);
  if (!b.error) readyCache = true;
  return !b.error;
}

// All active groups with their choices, and which menu items use which group.
// Returns { groups: [{id, name, required, multi, options: [{id, name, price}]}], byItem: Map(itemId -> [group, ...]) }
export async function loadModifiers() {
  const out = { groups: [], byItem: new Map() };
  if (!(await modsReady())) return out;
  const [g, o, l] = await Promise.all([
    supabase.from('modifier_groups').select('id, name, required, multi, sort_order').eq('active', true).order('sort_order').order('id'),
    supabase.from('modifier_options').select('id, group_id, name, price, sort_order').eq('active', true).order('sort_order').order('id'),
    supabase.from('menu_item_modifier_groups').select('menu_item_id, group_id'),
  ]);
  if (g.error || o.error || l.error) return out;
  out.groups = g.data.map((x) => ({
    id: x.id,
    name: x.name,
    required: !!x.required,
    multi: !!x.multi,
    options: o.data.filter((p) => p.group_id === x.id).map((p) => ({ id: p.id, name: p.name, price: Number(p.price || 0) })),
  })).filter((x) => x.options.length > 0);
  const byId = new Map(out.groups.map((x) => [x.id, x]));
  l.data.forEach((r) => {
    const grp = byId.get(r.group_id);
    if (!grp) return;
    const key = String(r.menu_item_id);
    if (!out.byItem.has(key)) out.byItem.set(key, []);
    out.byItem.get(key).push(grp);
  });
  out.byItem.forEach((arr) => arr.sort((a, b) => out.groups.indexOf(a) - out.groups.indexOf(b)));
  return out;
}

// a chosen option is saved as { g: group name, n: choice name, p: extra price }
export function modsPrice(mods) {
  return (Array.isArray(mods) ? mods : []).reduce((n, m) => n + Number((m && m.p) || 0), 0);
}
export function modsList(mods) {
  return (Array.isArray(mods) ? mods : []).map((m) => m.n + (Number(m.p) > 0 ? ' (+' + Number(m.p).toFixed(2) + ')' : ''));
}
// one line for the bill, receipt and kitchen: "Hot, Extra egg; less ice"
export function modsText(mods, note) {
  const parts = (Array.isArray(mods) ? mods : []).map((m) => m.n);
  const first = parts.join(', ');
  return [first, note || ''].filter(Boolean).join('; ');
}
// same choices = same line (used to merge identical lines)
export function modsKey(mods) {
  return (Array.isArray(mods) ? mods : []).map((m) => m.g + ':' + m.n).sort().join('|');
}
