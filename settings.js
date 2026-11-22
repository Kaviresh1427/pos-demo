// Settings: shop details, receipt font, DuitNow QR picture (owner only).
import { supabase, el, makeButton } from './common.js';
import { SHOP, buildReceipt, applyShop, nowText } from './receipt-view.js';
import { printBill } from './receipt.js';
import { compressImage, storagePath } from './image-tools.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'settings.css';
document.head.appendChild(link);

const FONTS = [
  ['classic', 'Classic', 'Arial with a serif shop name'],
  ['modern', 'Modern', 'Clean and bold'],
  ['mono', 'Typewriter', 'Old shop-receipt style'],
  ['friendly', 'Friendly', 'Soft and easy to read'],
  ['elegant', 'Elegant', 'All serif, fine dining'],
];

// the form values (they start from the current SHOP details)
let form = {};
function resetForm() {
  form = {
    name: SHOP.name,
    tagline: SHOP.tagline,
    line1: SHOP.lines[0] || '',
    line2: SHOP.lines[1] || '',
    phone: SHOP.phone,
    email: SHOP.email,
    footer: SHOP.footer,
    font: SHOP.font || 'classic',
    qr: SHOP.qr || '',
    logo: SHOP.logo || '',
  };
}
resetForm();

function shopFromForm() {
  return {
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    lines: [form.line1.trim(), form.line2.trim()].filter(Boolean),
    phone: form.phone.trim(),
    email: form.email.trim(),
    footer: form.footer.trim(),
    font: form.font,
    qr: form.qr,
    logo: form.logo,
  };
}

// ---------- screen ----------
const screen = el('main', 'screen menu-screen');
screen.id = 'settings-screen';
screen.hidden = true;
const wrap = el('div', 'st-wrap');
const left = el('div', 'st-left');
const right = el('aside', 'st-right');
wrap.append(left, right);
screen.appendChild(wrap);
document.body.appendChild(screen);

const message = el('p', 'menu-message', '');
message.hidden = true;
function say(text, bad) {
  message.textContent = text;
  message.className = 'menu-message' + (bad ? ' menu-error' : '');
  message.hidden = !text;
}

const preview = el('div', 'st-paper');
function renderPreview() {
  const sample = {
    shop: shopFromForm(),
    paid: false,
    receiptNo: '',
    when: nowText(),
    rowLabel: 'Table',
    where: 'T03',
    staff: 'Owner',
    items: [
      { name: 'Nasi Ayam', qty: 2, unit: 1050, note: '', takeaway: false },
      { name: 'Teh Tarik', qty: 2, unit: 250, note: '', takeaway: false },
      { name: 'Nasi Lemak', qty: 1, unit: 500, note: '', takeaway: true },
    ],
    tagTakeaway: true,
    subCents: 2600,
    discCents: 0,
    adj: 0,
    totalCents: 2600,
  };
  preview.replaceChildren(buildReceipt(sample));
  return sample;
}

function field(label, key, placeholder) {
  const wrapF = el('label', 'st-field');
  wrapF.appendChild(el('span', '', label));
  const input = el('input', '');
  input.type = 'text';
  input.value = form[key];
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    form[key] = input.value;
    renderPreview();
  });
  wrapF.appendChild(input);
  return wrapF;
}

function card(title, hint, ...kids) {
  const c = el('section', 'rp-panel st-card');
  c.appendChild(el('h3', '', title));
  if (hint) c.appendChild(el('p', 'st-hint', hint));
  kids.forEach((k) => c.appendChild(k));
  return c;
}

// shrink the picture first, then upload it (returns the public link, or '' if it failed)
async function uploadPicture(f, kind, name) {
  if (!f) return '';
  if (!f.type.startsWith('image/')) {
    say('Please choose a picture file (PNG or JPG).', true);
    return '';
  }
  say('Making the picture small and uploading...');
  try {
    const c = await compressImage(f, kind);
    const path = name + '-' + Date.now() + '.' + c.ext;
    const up = await supabase.storage.from('shop-assets').upload(path, c.blob, { upsert: true, contentType: c.type });
    if (up.error) throw new Error(up.error.message + ' (has settings.sql been run in Supabase?)');
    return supabase.storage.from('shop-assets').getPublicUrl(path).data.publicUrl;
  } catch (e) {
    say('Could not upload: ' + e.message, true);
    return '';
  }
}

function build() {
  // shop details
  const grid = el('div', 'st-grid');
  grid.append(
    field('Shop name', 'name', 'Demo Restaurant'),
    field('Sub title', 'tagline', 'Restaurant'),
    field('Address line 1', 'line1', ''),
    field('Address line 2', 'line2', ''),
    field('Phone', 'phone', '012-345 6789'),
    field('E-mail (optional)', 'email', ''),
    field('Thank-you line at the bottom', 'footer', 'Thank you for dining with us!')
  );
  grid.lastChild.classList.add('st-wide');
  const details = card('Shop details', 'These appear at the top of every bill and receipt.', grid);

  // font
  const fonts = el('div', 'st-fonts');
  const fontBtns = {};
  FONTS.forEach(([key, name, sub]) => {
    const b = el('button', 'st-font st-font-' + key);
    b.type = 'button';
    b.append(el('strong', '', name), el('small', '', sub));
    b.addEventListener('click', () => {
      form.font = key;
      Object.keys(fontBtns).forEach((k) => fontBtns[k].classList.toggle('on', k === key));
      renderPreview();
    });
    fontBtns[key] = b;
    fonts.appendChild(b);
  });
  const showFont = () => Object.keys(fontBtns).forEach((k) => fontBtns[k].classList.toggle('on', k === form.font));
  showFont();
  const fontCard = card('Receipt font', 'Pick the style you like. The preview on the right changes at once.', fonts);

  // logo
  const logoBox = el('div', 'st-qr st-logo');
  const logoImg = document.createElement('img');
  logoImg.alt = 'Company logo';
  const logoEmpty = el('div', 'st-qr-empty', 'No logo yet (the chef hat is used)');
  const logoFile = document.createElement('input');
  logoFile.type = 'file';
  logoFile.accept = 'image/*';
  logoFile.hidden = true;
  const showLogo = () => {
    logoImg.hidden = !form.logo;
    logoEmpty.hidden = !!form.logo;
    if (form.logo) logoImg.src = form.logo;
    removeLogo.hidden = !form.logo;
  };
  const uploadLogo = makeButton('Upload logo', () => logoFile.click(), '');
  const removeLogo = makeButton('Remove', () => {
    form.logo = '';
    showLogo();
    renderPreview();
  }, '');
  logoFile.addEventListener('change', async () => {
    const f = logoFile.files[0];
    logoFile.value = '';
    const url = await uploadPicture(f, 'logo', 'logo');
    if (!url) return;
    form.logo = url;
    showLogo();
    renderPreview();
    say('Logo uploaded (made small automatically). Press "Save settings" to keep it.');
  });
  logoBox.append(logoImg, logoEmpty);
  const logoSide = el('div', 'st-qr-side');
  const logoBtns = el('div', 'st-btnrow');
  logoBtns.append(uploadLogo, removeLogo);
  logoSide.append(logoBtns, el('p', 'st-hint', 'A simple black-and-white logo prints best. It shows on the bill, the receipt and the left menu.'));
  const logoRow = el('div', 'st-qr-row');
  logoRow.append(logoBox, logoSide);
  const logoCard = card('Company logo', '', logoRow, logoFile);
  showLogo();

  // QR
  const qrBox = el('div', 'st-qr');
  const qrImg = document.createElement('img');
  qrImg.alt = 'DuitNow QR';
  const qrEmpty = el('div', 'st-qr-empty', 'No QR picture yet');
  const qrFile = document.createElement('input');
  qrFile.type = 'file';
  qrFile.accept = 'image/*';
  qrFile.hidden = true;
  const showQr = () => {
    qrImg.hidden = !form.qr;
    qrEmpty.hidden = !!form.qr;
    if (form.qr) qrImg.src = form.qr;
    removeQr.hidden = !form.qr;
  };
  const uploadBtn = makeButton('Upload QR picture', () => qrFile.click(), '');
  const removeQr = makeButton('Remove', () => {
    form.qr = '';
    showQr();
    renderPreview();
  }, '');
  qrFile.addEventListener('change', async () => {
    const f = qrFile.files[0];
    qrFile.value = '';
    const url = await uploadPicture(f, 'qr', 'duitnow-qr');
    if (!url) return;
    form.qr = url;
    showQr();
    renderPreview();
    say('QR picture uploaded (made small automatically). Press "Save settings" to keep it.');
  });
  const qrBtns = el('div', 'st-btnrow');
  qrBtns.append(uploadBtn, removeQr);
  qrBox.append(qrImg, qrEmpty);
  const qrRow = el('div', 'st-qr-row');
  const qrSide = el('div', 'st-qr-side');
  qrSide.append(qrBtns, el('p', 'st-hint', 'Use the DuitNow QR picture from your bank. It is printed on the unpaid bill.'));
  qrRow.append(qrBox, qrSide);
  const qrCard = card('DuitNow QR', '', qrRow, qrFile);
  showQr();

  // buttons
  const saveBtn = makeButton('Save settings', save, '');
  saveBtn.classList.add('st-save');
  const testBtn = makeButton('Test print', () => printBill(renderPreview()), '');
  const undoBtn = makeButton('Undo changes', () => {
    resetForm();
    left.replaceChildren();
    build();
    say('');
  }, '');
  const actions = el('div', 'st-actions');
  actions.append(saveBtn, testBtn, undoBtn);

  left.replaceChildren(message, details, logoCard, fontCard, qrCard, actions);
  right.replaceChildren(el('div', 'st-prev-title', 'Bill preview'), preview);
  renderPreview();
}

async function save() {
  const v = shopFromForm();
  if (!v.name) return say('The shop name cannot be empty.', true);
  say('Saving...');
  const r = await supabase.from('app_settings').upsert({ key: 'shop', value: v, updated_at: new Date().toISOString() });
  if (r.error) return say('Could not save: ' + r.error.message + ' (has settings.sql been run in Supabase?)', true);
  // remove the old logo / QR files that are no longer used (best effort, keeps storage small)
  const old = [storagePath(SHOP.logo, 'shop-assets'), storagePath(SHOP.qr, 'shop-assets')];
  const keep = [storagePath(v.logo, 'shop-assets'), storagePath(v.qr, 'shop-assets')];
  const gone = old.filter((p) => p && !keep.includes(p));
  if (gone.length) supabase.storage.from('shop-assets').remove(gone);
  applyShop(v);
  say('Saved. New bills and receipts now use these details.');
}

document.addEventListener('kamala:open-settings', async () => {
  screen.hidden = false;
  say('');
  try {
    const r = await supabase.from('app_settings').select('value').eq('key', 'shop').maybeSingle();
    if (r.data && r.data.value) applyShop(r.data.value);
  } catch (e) { /* use the current details */ }
  resetForm();
  build();
});
