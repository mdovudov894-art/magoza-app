let cur = null; // маҳсулоти интихобшуда

function expChip(d, warnDays) {
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d) - today) / 86400000);
  if (days < 0) return `<span class="chip warn">${fmtDate(d)} (${t('expired')})</span>`;
  if (days <= warnDays) return `<span class="chip amber">${fmtDate(d)} (${days} ${t('days_short')})</span>`;
  return fmtDate(d);
}

async function loadOverview() {
  const o = await api('/api/stock/overview');
  const li = (b) => `<li><span><b>${esc(b.product.name)}</b> · ${esc(b.batchNo || '')}<br><small>${fmtQty(b.qty)} ${esc(unitLabel(b.product.unit))} · ${fmtDate(b.expiry)}</small></span>
      <span><button class="btn sm" data-pick="${b.product._id}">${t('open')}</button> <button class="btn sm danger" data-wo="${b._id}" data-q="${b.qty}">${t('writeoff')}</button></span></li>`;
  $('#alerts').innerHTML = `
    <div class="alert-box red"><h3>${t('alert_expired')} (${o.expired.length})</h3><ul>${o.expired.map(li).join('') || `<li class="hint">${t('none')}</li>`}</ul></div>
    <div class="alert-box amber"><h3>${t('alert_expiring', { n: o.warnDays })} (${o.expiring.length})</h3><ul>${o.expiring.map(li).join('') || `<li class="hint">${t('none')}</li>`}</ul></div>
    <div class="alert-box"><h3>${t('alert_low')} (${o.low.length})</h3><ul>${o.low.map((p) => `<li><span><b>${esc(p.name)}</b><br><small>${fmtQty(p.stock)} / ${t('min_stock')}: ${fmtQty(p.minStock)}</small></span><button class="btn sm" data-pick="${p._id}">${t('open')}</button></li>`).join('') || `<li class="hint">${t('none')}</li>`}</ul></div>`;
}

async function select(id) {
  const d = await api('/api/stock/batches/' + id);
  cur = d.product;
  $('#sel').hidden = false;
  $('#selName').textContent = `${cur.name} (${cur.barcode})`;
  $('#selCards').innerHTML = `
    <div class="stat hl"><small>${t('stock')}</small><b>${cur.trackStock ? fmtQty(cur.stock) : '—'} ${esc(unitLabel(cur.unit))}</b></div>
    <div class="stat"><small>${t('min_stock')}</small><b>${fmtQty(cur.minStock)}</b></div>
    <div class="stat"><small>${t('stock_tracked')}</small><b>${cur.trackStock ? t('yes') : t('no')}</b></div>`;
  const warn = (window.SETTINGS && SETTINGS.expiryWarnDays) || 7;
  $('#batches').innerHTML = d.batches.map((b) => `<tr${b.qty <= 0 ? ' style="opacity:.5"' : ''}>
    <td>${esc(b.batchNo || '')}</td><td>${fmtDate(b.receivedAt)}</td><td>${expChip(b.expiry, warn)}</td>
    <td class="num">${fmtQty(b.qty)}</td><td>${esc(b.supplier || '')}</td>
    <td><button class="btn sm" data-adj="${b._id}" data-q="${b.qty}">${t('adjust')}</button>
        <button class="btn sm danger" data-wo="${b._id}" data-q="${b.qty}">${t('writeoff')}</button></td></tr>`).join('') || `<tr><td colspan="6" class="hint">${t('none')}</td></tr>`;
  $('#moves').innerHTML = d.moves.map((m) => `<tr><td>${fmtDateTime(m.at)}</td><td>${t('mv_' + m.type)}${m.ref ? ` №${m.ref}` : ''}</td>
    <td class="num ${m.qty < 0 ? 'neg' : ''}">${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)}</td><td>${esc(m.userName || '')}</td><td>${esc(m.note || '')}</td></tr>`).join('') || `<tr><td colspan="5" class="hint">${t('none')}</td></tr>`;
}

async function writeoff(batchId, maxQty) {
  const q = prompt(t('stock_ask_writeoff_qty'), maxQty);
  if (q === null) return;
  const reason = prompt(t('stock_ask_reason')) || '';
  try {
    await api('/api/stock/writeoff', { method: 'POST', body: { batchId, qty: q, reason } });
    toast(t('saved'));
    await loadOverview();
    if (cur) await select(cur._id);
  } catch (e) { fail(e); }
}

document.addEventListener('click', async (e) => {
  const d = e.target.dataset;
  try {
    if (d.pick) { await select(d.pick); $('#sel').scrollIntoView({ behavior: 'smooth' }); }
    if (d.wo) await writeoff(d.wo, d.q);
    if (d.adj) {
      const v = prompt(t('stock_ask_new_qty'), d.q);
      if (v === null) return;
      await api('/api/stock/adjust', { method: 'POST', body: { batchId: d.adj, newQty: v } });
      toast(t('saved')); await loadOverview(); await select(cur._id);
    }
  } catch (err) { fail(err); }
});

$('#recvForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/stock/receive', { method: 'POST', body: {
      productId: cur._id, qty: $('#rQty').value, expiry: $('#rExp').value, batchNo: $('#rBatch').value, supplier: $('#rSup').value, cost: $('#rCost').value } });
    toast(t('saved'));
    e.target.reset();
    await loadOverview(); await select(cur._id);
  } catch (err) { fail(err); }
});

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  productPicker($('#pick'), $('#pickList'), (p) => select(p._id).catch(fail));
  await loadOverview().catch(fail);
})();
