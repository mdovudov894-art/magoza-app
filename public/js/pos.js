let me;
let cart = [];        // [{id, name, barcode, price, unit, qty}]
let priced = null;    // ҷавоби сервер барои ҳисоби нарх бо тахфифҳо
let seq = 0, scanner = null, lastCode = '', lastTime = 0, busy = false;

const codeInp = $('#code'), msgEl = $('#msg'), cartEl = $('#cart');
const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const focusCode = () => { if (!touch) codeInp.focus(); };
const setMsg = (html) => { msgEl.innerHTML = html || ''; };

// ---------- Ҳисобкунӣ ----------
function localTotals() {
  const sub = cart.reduce((s, l) => s + l.price * l.qty, 0);
  return { subtotal: sub, promoDiscount: 0, manualDiscount: 0, total: sub };
}
const totals = () => priced || localTotals();

function render() {
  const map = new Map((priced ? priced.lines : []).map((l) => [String(l.product), l]));
  cartEl.innerHTML = cart.map((l, i) => {
    const pl = map.get(l.id);
    const net = pl ? pl.net : l.price * l.qty;
    const step = isWeighable(l.unit) ? '0.001' : '1';
    return `<tr>
      <td class="nm">${esc(l.name)}${pl && pl.promo ? `<small>${esc(pl.promo)}</small>` : ''}</td>
      <td><button class="qbtn" data-dec="${i}">−</button>
          <input class="qty" type="number" min="0.001" step="${step}" value="${l.qty}" data-i="${i}">
          <button class="qbtn" data-inc="${i}">+</button> <small>${esc(unitLabel(l.unit))}</small></td>
      <td class="num">${fmtMoney(l.price)}</td>
      <td class="num">${fmtMoney(net)}</td>
      <td><button class="qbtn" data-rm="${i}" title="${t('delete')}">×</button></td></tr>`;
  }).join('');
  $('#empty').hidden = cart.length > 0;
  const T = totals();
  $('#sub').textContent = fmtMoney(T.subtotal);
  $('#promo').textContent = '-' + fmtMoney(T.promoDiscount);
  $('#manualAmt').textContent = '-' + fmtMoney(T.manualDiscount);
  $('#total').textContent = fmtMoney(T.total);
  $('#payBtn').disabled = !cart.length || busy;
  $('#payBtn').textContent = cart.length ? `${t('pos_pay')} ${fmtMoney(T.total)}` : t('pos_pay');
  updateChange();
}

function updateChange() {
  const cash = document.querySelector('input[name=method]:checked').value === 'cash';
  $('#cashBox').hidden = !cash;
  const paid = parseFloat($('#paid').value);
  const T = totals();
  $('#changeBox').textContent = cash && isFinite(paid) && cart.length ? `${t('change')}: ${fmtMoney(Math.max(0, paid - T.total))}` : '';
}

const reprice = debounce(async () => {
  const my = ++seq;
  if (!cart.length) { priced = null; render(); return; }
  try {
    const r = await api('/api/sales/price', { method: 'POST', body: { items: cart.map((l) => ({ productId: l.id, qty: l.qty })), manualDiscountPct: parseFloat($('#manualPct').value) || 0 } });
    if (my === seq) { priced = r; render(); }
  } catch (e) { fail(e); }
}, 120);

function changed() { priced = null; render(); reprice(); }

// ---------- Сабад ----------
function addProduct(p, qty) {
  if (qty == null) {
    if (isWeighable(p.unit)) {
      const v = prompt(t('pos_ask_weight', { name: p.name }));
      qty = parseFloat(String(v || '').replace(',', '.'));
      if (!(qty > 0)) return;
    } else qty = 1;
  }
  const ex = cart.find((l) => l.id === String(p._id));
  if (ex) ex.qty = Math.round((ex.qty + qty) * 1000) / 1000;
  else cart.push({ id: String(p._id), name: p.name, barcode: p.barcode, price: p.price, unit: p.unit, qty });
  $('#lastTag').innerHTML = `<div class="lasttag">${p.photo ? `<img src="${p.photo}" alt="">` : '<span></span>'}<div><b>${esc(p.name)}</b><span>${fmtPrice(p.price)}</span></div></div>`;
  setMsg('');
  changed();
}

cartEl.addEventListener('click', (e) => {
  const d = e.target;
  const step = (i) => (isWeighable(cart[i].unit) ? 0.1 : 1);
  if (d.dataset.inc !== undefined) { const i = +d.dataset.inc; cart[i].qty = Math.round((cart[i].qty + step(i)) * 1000) / 1000; changed(); }
  if (d.dataset.dec !== undefined) { const i = +d.dataset.dec; const q = Math.round((cart[i].qty - step(i)) * 1000) / 1000; if (q > 0) { cart[i].qty = q; changed(); } }
  if (d.dataset.rm !== undefined) { cart.splice(+d.dataset.rm, 1); changed(); focusCode(); }
});
cartEl.addEventListener('change', (e) => {
  if (!e.target.classList.contains('qty')) return;
  const i = +e.target.dataset.i;
  let q = parseFloat(e.target.value);
  if (!(q > 0)) q = cart[i].qty;
  cart[i].qty = isWeighable(cart[i].unit) ? Math.round(q * 1000) / 1000 : Math.max(1, Math.round(q));
  changed();
});

$('#clearBtn').onclick = () => { if (!cart.length || confirm(t('pos_confirm_clear'))) { cart = []; $('#paid').value = ''; changed(); focusCode(); } };
$('#manualPct').addEventListener('input', changed);
document.querySelectorAll('input[name=method]').forEach((r) => r.addEventListener('change', updateChange));
$('#paid').addEventListener('input', updateChange);
$('#paid').addEventListener('keydown', (e) => { if (e.key === 'Enter') pay(); });

// ---------- Ҷустуҷӯ ва скан ----------
async function lookup(code) {
  code = code.trim();
  if (!code) return;
  try {
    const r = await api('/api/products/lookup/' + encodeURIComponent(code));
    addProduct(r.product, r.qty);
  } catch (e) {
    if (e.key === 'E_PRODUCT_NOT_FOUND') {
      const add = RANK[me.role] >= RANK.manager ? ` <a href="/admin.html?barcode=${encodeURIComponent(code)}">${t('pos_add_product')}</a>` : '';
      setMsg(`${esc(t('E_PRODUCT_NOT_FOUND'))}: ${esc(code)}${add}`);
    } else fail(e);
  }
}

$('#codeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = codeInp.value.trim();
  const sugs = $('#sugs');
  if (!/^\d+$/.test(v) && sugs._items && sugs._items.length) addProduct(sugs._items[0], null);
  else await lookup(v);
  codeInp.value = '';
  sugs.innerHTML = '';
  focusCode();
});

productPicker(codeInp, $('#sugs'), (p) => { addProduct(p, null); focusCode(); });
// Рақами пок бо сканери USB ҷустуҷӯи ном намекунад (танҳо матн)
codeInp.addEventListener('input', () => { if (/^\d+$/.test(codeInp.value)) $('#sugs').innerHTML = ''; });

// Агар фокус гум шавад ва сканер рақам фиристад, ба майдон бармегардем
document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) && !e.ctrlKey && !e.altKey && e.key.length === 1 && !$('dialog[open]')) focusCode();
});

// ---------- Камера ----------
function onScan(code) {
  const now = Date.now();
  if (code === lastCode && now - lastTime < 2500) return;
  lastCode = code; lastTime = now;
  beep();
  lookup(code);
}
async function camToggle(forceOn) {
  const box = $('#reader');
  if (scanner && !forceOn) {
    await stopScanner(scanner); scanner = null; box.hidden = true;
    $('#camBtn').textContent = t('cam_open'); localStorage.setItem('cam', '0'); return;
  }
  if (scanner) return;
  try {
    box.hidden = false;
    scanner = await startScanner('reader', onScan);
    $('#camBtn').textContent = t('cam_close'); localStorage.setItem('cam', '1');
  } catch (e) { scanner = null; box.hidden = true; fail(new Error(t('cam_failed') + ': ' + (e.message || e))); }
}
$('#camBtn').onclick = () => camToggle();

// ---------- Пардохт ----------
async function pay() {
  if (!cart.length || busy) return;
  busy = true; render();
  const method = document.querySelector('input[name=method]:checked').value;
  try {
    const sale = await api('/api/sales', { method: 'POST', body: {
      items: cart.map((l) => ({ productId: l.id, qty: l.qty })),
      manualDiscountPct: parseFloat($('#manualPct').value) || 0,
      method, paid: method === 'cash' ? $('#paid').value : undefined,
    } });
    cart = []; priced = null; $('#paid').value = ''; $('#manualPct').value = 0; $('#lastTag').innerHTML = '';
    toast(`${t('pos_sale_done')} №${sale.number}`);
    if ($('#autoPrint').checked) printReceipt(sale); else showReceiptDialog(sale);
  } catch (e) { fail(e); }
  busy = false; render(); focusCode();
}
$('#payBtn').onclick = pay;

// ---------- Ҷустуҷӯи чек ----------
$('#recBtn').onclick = () => { $('#recDlg').showModal(); $('#recNo').focus(); };
$('#recClose').onclick = () => $('#recDlg').close();
$('#recForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const s = await api('/api/sales/' + encodeURIComponent($('#recNo').value)); $('#recDlg').close(); showReceiptDialog(s); } catch (err) { fail(err); }
});

$('#autoPrint').checked = localStorage.getItem('autoPrint') === '1';
$('#autoPrint').addEventListener('change', (e) => localStorage.setItem('autoPrint', e.target.checked ? '1' : '0'));

(async () => {
  me = await initPage('cashier');
  if (!me) return;
  $('#manualRow').hidden = RANK[me.role] < RANK.manager;
  render();
  focusCode();
  if (localStorage.getItem('cam') === '1') camToggle(true);
})();
