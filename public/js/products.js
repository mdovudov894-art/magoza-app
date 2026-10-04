const form = $('#form'), listEl = $('#list'), search = $('#search');
const saveBtn = $('#saveBtn'), cancelBtn = $('#cancelEdit');
const photoInp = $('#photo'), preview = $('#preview'), rmPhoto = $('#rmPhoto');
const scanDlg = $('#scanDialog');
let products = [], editingId = null, photo = '', scanner = null, impFile = null;

async function loadList() {
  products = await api('/api/products');
  renderList();
}

function renderList() {
  const q = search.value.trim().toLowerCase();
  const items = products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.category || '').toLowerCase().includes(q));
  $('#count').textContent = `${t('shown')}: ${items.length} / ${products.length}`;
  if (!items.length) { listEl.innerHTML = `<tr><td colspan="7" class="hint">${products.length ? t('nothing_found') : t('prod_empty')}</td></tr>`; return; }
  listEl.innerHTML = items.slice(0, 300).map((p) => `<tr>
    <td>${p.photo ? `<img src="${p.photo}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:5px">` : ''}</td>
    <td><b>${esc(p.name)}</b>${p.category ? `<br><small class="hint">${esc(p.category)}</small>` : ''}</td>
    <td class="code">${esc(p.barcode)}${p.plu ? `<br><small class="hint">PLU ${esc(p.plu)}</small>` : ''}</td>
    <td class="num">${fmtMoney(p.price)} / ${esc(unitLabel(p.unit))}</td>
    <td class="num">${p.cost ? fmtMoney(p.cost) : ''}</td>
    <td class="num">${p.trackStock ? `<span class="chip ${p.stock <= p.minStock ? 'warn' : 'ok'}">${fmtQty(p.stock)}</span>` : ''}</td>
    <td><button class="btn sm" data-edit="${p._id}">${t('edit')}</button>
        <a class="btn sm" href="/audit.html?entity=product&entityId=${p._id}">${t('history')}</a>
        <button class="btn sm danger" data-del="${p._id}">${t('delete')}</button></td></tr>`).join('');
}
search.addEventListener('input', renderList);

listEl.addEventListener('click', async (e) => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed) startEdit(ed);
  if (del && confirm(t('confirm_delete'))) {
    try { await api('/api/products/' + del, { method: 'DELETE' }); if (editingId === del) resetForm(); await loadList(); } catch (err) { fail(err); }
  }
});

function renderPhoto() { preview.src = photo; preview.hidden = rmPhoto.hidden = !photo; }
photoInp.addEventListener('change', async () => {
  if (!photoInp.files[0]) return;
  try { photo = await fileToThumb(photoInp.files[0]); renderPhoto(); } catch (err) { fail(err); }
  photoInp.value = '';
});
rmPhoto.addEventListener('click', () => { photo = ''; renderPhoto(); });

function resetForm() {
  form.reset(); editingId = null; photo = '';
  $('#formTitle').textContent = t('prod_new');
  cancelBtn.hidden = true; renderPhoto();
}

function startEdit(id) {
  const p = products.find((x) => x._id === id);
  if (!p) return;
  editingId = id;
  $('#pBarcode').value = p.barcode; $('#pName').value = p.name; $('#pPrice').value = p.price; $('#pCost').value = p.cost || '';
  $('#pUnit').value = unitKey(p.unit); $('#pCat').value = p.category || ''; $('#pPlu').value = p.plu || '';
  $('#pMin').value = p.minStock || ''; $('#pNote').value = p.note || '';
  photo = p.photo || '';
  $('#formTitle').textContent = t('prod_edit');
  cancelBtn.hidden = false; renderPhoto();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
cancelBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    barcode: $('#pBarcode').value.trim(), name: $('#pName').value, price: parseFloat($('#pPrice').value),
    cost: parseFloat($('#pCost').value) || 0, unit: $('#pUnit').value, category: $('#pCat').value, plu: $('#pPlu').value.trim(),
    minStock: parseFloat($('#pMin').value) || 0, note: $('#pNote').value, photo,
  };
  saveBtn.disabled = true;
  try {
    if (editingId) await api('/api/products/' + editingId, { method: 'PUT', body });
    else await api('/api/products', { method: 'POST', body });
    toast(t('saved'));
    resetForm(); await loadList();
  } catch (err) { fail(err); } finally { saveBtn.disabled = false; }
});

// ---------- Баркод бо камера ----------
$('#scanBtn').addEventListener('click', async () => {
  scanDlg.showModal();
  try {
    scanner = await startScanner('reader2', (code) => { $('#pBarcode').value = code; beep(); scanDlg.close(); });
  } catch (err) { scanDlg.close(); fail(new Error(t('cam_failed') + ': ' + (err.message || err))); }
});
scanDlg.addEventListener('close', async () => { if (scanner) { await stopScanner(scanner); scanner = null; } });
$('#closeScan').addEventListener('click', () => scanDlg.close());

// ---------- Воридоти оммавӣ ----------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error(t('E_IMPORT_READ')));
    r.readAsDataURL(file);
  });
}

function showImport(r, applied) {
  const errs = (r.errors || []).map((x) => `<li>${t('row')} ${x.row}: ${esc(t(x.error))}</li>`).join('');
  $('#impResult').innerHTML = `
    <div class="cards">
      <div class="stat"><small>${t('import_rows')}</small><b>${r.rows}</b></div>
      <div class="stat"><small>${applied ? t('import_created') : t('import_will_create')}</small><b>${applied ? r.created : r.willCreate}</b></div>
      <div class="stat"><small>${applied ? t('import_updated') : t('import_will_update')}</small><b>${applied ? r.updated : r.willUpdate}</b></div>
      <div class="stat"><small>${t('import_errors')}</small><b>${r.errorCount}</b></div>
    </div>${errs ? `<ul class="hint mt">${errs}</ul>` : ''}`;
}

$('#impFile').addEventListener('change', () => { impFile = $('#impFile').files[0] || null; $('#impApply').disabled = true; $('#impResult').innerHTML = ''; });

async function runImport(apply) {
  if (!impFile) { toast(t('import_choose_file'), true); return; }
  try {
    const r = await api('/api/import', { method: 'POST', body: { filename: impFile.name, data: await fileToBase64(impFile), apply } });
    showImport(r, apply);
    if (apply) { toast(t('saved')); $('#impApply').disabled = true; await loadList(); }
    else $('#impApply').disabled = r.valid === 0;
  } catch (err) { fail(err); }
}
$('#impPreview').addEventListener('click', () => runImport(false));
$('#impApply').addEventListener('click', () => { if (confirm(t('import_confirm'))) runImport(true); });

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  renderPhoto();
  const pre = new URLSearchParams(location.search).get('barcode');
  if (pre) $('#pBarcode').value = pre;
  await loadList().catch(fail);
})();
