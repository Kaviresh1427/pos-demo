// DEMO VERSION: no real database. demo-db.js keeps everything inside the visitor's browser.
import { demoDb } from './demo-db.js';

export const supabase = demoDb;

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function makeButton(label, onClick, extraClass) {
  const b = el('button', 'secondary small' + (extraClass ? ' ' + extraClass : ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function money(value) {
  return 'RM ' + Number(value).toFixed(2);
}