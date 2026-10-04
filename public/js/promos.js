let promos = [], editingId = null, picked = null;
const form = $('#form');

function status(p) {
  const now = new Date();
  if (!p.active) return `<span class="chip">${t('promo_off')}</span>`;
  if (p.startsAt && new Date(p.startsAt) > now) return `<span class="chip amber">${t('promo_scheduled')}</span>`;
  if (p.endsAt && new Date(p.endsAt) < now) return `<span class="chip warn">${t('promo_ended')}</span>`;
  return `<span class="chip ok">${t('promo_running')}</span>`;
}

function render() {
  $('#list').innerHTML = promos.map((p) => `<tr>
    <td><b>${esc(p.name)}</b></td>
    <td>${p.type === 'percent' ? fmtQty(p.value) + '%' : fmtMoney(p.value) + ' ' + t('currency')}</td>
    <td>${p.scope === 'all' ? t('promo_scope_all') : p.scope === 'category' ? `${t('category')}: ${esc(p.category)}` : esc(p.product ? p.product.name : '—')}</td>
    <td>${p.startsAt ? fmtDate(p.startsAt) : '…'} – ${p.endsAt ? fmtDate(p.endsAt) : '…'}</td>
    <td>${status(p)}</td>
    <td><button class="btn sm" data-edit="${p._id}">${t('edit')}</button> <button class="btn sm danger" data-del="${p._id}">${t('delete')}</button></td></tr>`).join('')
    || `<tr><td colspan="6" class="hint">${t('none')}</td></tr>`;
}

async function load() { promos = await api('/api/promotions'); render(); }

function scopeUi() {
  const s = $('#fScope').value;
  $('#boxProduct').hidden = s !== 'product';
  $('#boxCategory').hidden = s !== 'category';
}
$('#fScope').addEventListener('change', scopeUi);

function setPicked(p) { picked = p; $('#pickedName').textContent = p ? `${p.name} (${p.barcode})` : ''; }

function reset() {
  form.reset(); editingId = null; setPicked(null); scopeUi();
  $('#formTitle').textContent = t('promo_new'); $('#cancelEdit').hidden = true;
}
$('#cancelEdit').onclick = reset;

$('#list').addEventListener('click', async (e) => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed) {
    const p = promos.find((x) => x._id === ed);
    editingId = ed;
    $('#fName').value = p.name; $('#fType').value = p.type; $('#fValue').value = p.value; $('#fScope').value = p.scope;
    $('#fCat').value = p.category || ''; $('#fFrom').value = dateInput(p.startsAt); $('#fTo').value = dateInput(p.endsAt); $('#fActive').checked = p.active;
    setPicked(p.product ? { _id: p.product._id, name: p.product.name, barcode: p.product.barcode } : null);
    scopeUi();
    $('#formTitle').textContent = t('promo_edit'); $('#cancelEdit').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (del && confirm(t('confirm_delete'))) { try { await api('/api/promotions/' + del, { method: 'DELETE' }); await load(); } catch (err) { fail(err); } }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const scope = $('#fScope').value;
  if (scope === 'product' && !picked) { toast(t('promo_pick_product'), true); return; }
  const body = {
    name: $('#fName').value, type: $('#fType').value, value: parseFloat($('#fValue').value), scope,
    product: scope === 'product' ? picked._id : null, category: $('#fCat').value,
    startsAt: $('#fFrom').value, endsAt: $('#fTo').value, active: $('#fActive').checked,
  };
  try {
    if (editingId) await api('/api/promotions/' + editingId, { method: 'PUT', body });
    else await api('/api/promotions', { method: 'POST', body });
    toast(t('saved')); reset(); await load();
  } catch (err) { fail(err); }
});

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  productPicker($('#fPick'), $('#pickList'), setPicked);
  scopeUi();
  await load().catch(fail);
})();
