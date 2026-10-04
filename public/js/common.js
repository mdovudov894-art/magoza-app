// ===== Қисмҳои умумӣ барои ҳамаи саҳифаҳо =====
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const RANK = { cashier: 1, manager: 2, owner: 3 };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = (n) => Number(n || 0).toFixed(2);
const fmtPrice = (n) => fmtMoney(n) + ' ' + t('currency');
const fmtQty = (n) => String(Math.round(Number(n || 0) * 1000) / 1000);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '');
const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateInput = (d) => (d ? ymdLocal(new Date(d)) : '');

const UNIT_LEGACY = { 'дона': 'pcs', 'кг': 'kg', 'литр': 'l', 'баста': 'pack' };
const unitKey = (u) => UNIT_LEGACY[u] || u || 'pcs';
const unitLabel = (u) => t('unit_' + unitKey(u));
const isWeighable = (u) => unitKey(u) === 'kg';

// ----- API -----
function errText(d) {
  let s = t(d && d.error ? d.error : 'E_SERVER');
  if (d && d.items && d.items.length) s += ': ' + d.items.join(', ');
  return s;
}
async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !location.pathname.endsWith('login.html')) {
    location.href = '/login.html';
    throw new Error(t('E_AUTH'));
  }
  if (!r.ok) {
    const e = new Error(errText(d));
    e.key = d.error;
    e.data = d;
    throw e;
  }
  return d;
}

// ----- Паёмҳои кӯтоҳ -----
function toast(msg, bad) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), bad ? 6000 : 2800);
}
const fail = (e) => toast(e.message || String(e), true);

// ----- Сарлавҳа ва меню -----
const NAV = [
  ['/', 'nav_pos', 'cashier'], ['/admin.html', 'nav_products', 'manager'], ['/stock.html', 'nav_stock', 'manager'],
  ['/promos.html', 'nav_promos', 'manager'], ['/sales.html', 'nav_sales', 'manager'], ['/reports.html', 'nav_reports', 'manager'],
  ['/audit.html', 'nav_audit', 'manager'], ['/users.html', 'nav_users', 'owner'], ['/settings.html', 'nav_settings', 'owner'],
];

function langButtons(container) {
  container.innerHTML = ['tg', 'ru'].map((l) => `<button type="button" class="lg${l === LANG ? ' on' : ''}" data-l="${l}">${l === 'tg' ? 'ТҶ' : 'РУ'}</button>`).join('');
  container.addEventListener('click', (e) => { if (e.target.dataset.l) setLang(e.target.dataset.l); });
}

function buildHeader(me) {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  const top = $('#top');
  top.className = 'top';
  top.innerHTML = `
    <b class="brand">${esc(SETTINGS.storeName || t('app_name'))}</b>
    <nav>${NAV.filter((n) => RANK[me.role] >= RANK[n[2]]).map((n) => `<a href="${n[0]}" class="${n[0] === path ? 'on' : ''}" data-i18n="${n[1]}"></a>`).join('')}</nav>
    <span class="who">${esc(me.name || me.username)} <small>${t('role_' + me.role)}</small></span>
    <span class="lang" id="langBox"></span>
    <button type="button" class="hbtn" id="pwBtn" data-i18n="change_password"></button>
    <button type="button" class="hbtn" id="outBtn" data-i18n="logout"></button>`;
  langButtons($('#langBox'));
  $('#outBtn').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {} location.href = '/login.html'; };
  $('#pwBtn').onclick = () => {
    const o = prompt(t('old_password')); if (!o) return;
    const n = prompt(t('new_password')); if (!n) return;
    api('/api/auth/password', { method: 'POST', body: { oldPassword: o, newPassword: n } }).then(() => toast(t('saved'))).catch(fail);
  };
}

async function initPage(minRole = 'cashier') {
  document.documentElement.lang = LANG === 'ru' ? 'ru' : 'tg';
  let me;
  try { me = await api('/api/auth/me'); } catch (e) { return null; }
  if (RANK[me.role] < RANK[minRole]) { location.href = '/'; return null; }
  window.ME = me;
  window.SETTINGS = await api('/api/settings');
  buildHeader(me);
  applyI18n();
  return me;
}

// ----- Хондани баркод бо камера (html5-qrcode, оффлайн) -----
async function startScanner(elId, onCode) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(t('cam_insecure'));
  const F = Html5QrcodeSupportedFormats;
  const scanner = new Html5Qrcode(elId, {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF],
    useBarCodeDetectorIfSupported: true,
    verbose: false,
  });
  await scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.5, 160)) }) },
    onCode,
    () => {}
  );
  return scanner;
}
async function stopScanner(scanner) {
  try { await scanner.stop(); scanner.clear(); } catch (e) {}
}

function beep() {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.1;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

function fileToThumb(file, max = 240) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error(t('E_INVALID')));
    img.src = URL.createObjectURL(file);
  });
}

// ----- Чек -----
function receiptHtml(sale) {
  const s = window.SETTINGS || {};
  const refund = sale.type === 'refund';
  const rows = sale.items.map((i) => `
    <div class="r-item"><div>${esc(i.name)}</div>
      <div class="r-line"><span>${fmtQty(Math.abs(i.qty))} ${esc(unitLabel(i.unit))} × ${fmtMoney(i.price)}</span><span>${fmtMoney(i.net)}</span></div>
      ${i.promo ? `<div class="r-sub">${esc(i.promo)}</div>` : ''}</div>`).join('');
  const disc = (sale.promoDiscount || 0) + (sale.manualDiscount || 0);
  return `
    <div class="r-head">
      <b>${esc(s.storeName || t('app_name'))}</b>
      ${s.storeAddress ? `<div>${esc(s.storeAddress)}</div>` : ''}${s.storePhone ? `<div>${esc(s.storePhone)}</div>` : ''}
    </div>
    <div class="r-line"><span>${refund ? t('receipt_refund') : t('receipt')} №${sale.number}</span><span>${fmtDateTime(sale.createdAt)}</span></div>
    ${refund ? `<div class="r-sub">${t('receipt_refund_of')} №${sale.refOf}</div>` : ''}
    <div class="r-sub">${t('cashier')}: ${esc(sale.cashierName || '')}</div><hr>
    ${rows}<hr>
    ${disc ? `<div class="r-line"><span>${t('subtotal')}</span><span>${fmtMoney(sale.subtotal)}</span></div>
              <div class="r-line"><span>${t('discount')}</span><span>-${fmtMoney(disc)}</span></div>` : ''}
    <div class="r-line r-total"><span>${t('total')}</span><span>${fmtMoney(sale.total)} ${t('currency')}</span></div>
    ${refund ? '' : `<div class="r-line"><span>${t('method_' + sale.method)}</span><span>${fmtMoney(sale.paid)}</span></div>
    ${sale.method === 'cash' ? `<div class="r-line"><span>${t('change')}</span><span>${fmtMoney(sale.change)}</span></div>` : ''}`}
    ${s.receiptFooter ? `<hr><div class="r-head">${esc(s.receiptFooter)}</div>` : ''}`;
}

const RECEIPT_CSS = `body{font:12px/1.35 monospace;width:72mm;margin:0 auto;padding:4mm;color:#000}
.r-head{text-align:center;margin-bottom:6px}.r-line{display:flex;justify-content:space-between;gap:8px}
.r-sub{font-size:11px;color:#444}.r-item{margin:4px 0}.r-total{font-weight:bold;font-size:14px;margin-top:4px}hr{border:0;border-top:1px dashed #000;margin:6px 0}
@page{margin:0}`;

function printReceipt(sale) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${receiptHtml(sale)}</body></html>`);
  f.contentDocument.close();
  f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); };
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} }, 400);
}

// Равзанаи чек (барои фурӯш, таърихи фурӯш)
function showReceiptDialog(sale) {
  let dlg = $('#receiptDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'receiptDlg';
    dlg.innerHTML = `<div class="receipt" id="receiptBody"></div>
      <div class="row"><button type="button" class="btn" id="receiptClose"></button><button type="button" class="btn primary" id="receiptPrint"></button></div>`;
    document.body.appendChild(dlg);
    $('#receiptClose').textContent = t('close');
    $('#receiptPrint').textContent = t('print');
    $('#receiptClose').onclick = () => dlg.close();
  }
  $('#receiptBody').innerHTML = receiptHtml(sale);
  $('#receiptPrint').onclick = () => printReceipt(sale);
  dlg.showModal();
}

function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}
function downloadLink(url) { const a = document.createElement('a'); a.href = url; a.click(); }

// Интихоби маҳсулот бо ҷустуҷӯ: box = <input>, list = <div>, onPick(product)
function productPicker(input, list, onPick) {
  const run = debounce(async () => {
    const q = input.value.trim();
    if (!q) { list.innerHTML = ''; return; }
    try {
      const items = await api('/api/products/search?q=' + encodeURIComponent(q));
      list.innerHTML = items.map((p, i) => `<button type="button" class="sug" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.barcode)} · ${fmtPrice(p.price)}</span></button>`).join('') || `<p class="hint">${t('nothing_found')}</p>`;
      list._items = items;
    } catch (e) { fail(e); }
  }, 250);
  input.addEventListener('input', run);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.sug');
    if (!b) return;
    const p = list._items[+b.dataset.i];
    list.innerHTML = '';
    input.value = '';
    onPick(p);
  });
}
