let sales = [], rf = null;

async function load() {
  const q = new URLSearchParams();
  if ($('#fNo').value) q.set('number', $('#fNo').value);
  else { if ($('#fFrom').value) q.set('from', $('#fFrom').value); if ($('#fTo').value) q.set('to', $('#fTo').value); }
  if ($('#fType').value) q.set('type', $('#fType').value);
  sales = await api('/api/sales?' + q);
  $('#count').textContent = `${t('shown')}: ${sales.length}`;
  $('#list').innerHTML = sales.map((s) => `<tr>
    <td><b>${s.number}</b></td><td>${fmtDateTime(s.createdAt)}</td><td>${esc(s.cashierName || '')}</td>
    <td><span class="chip ${s.type === 'refund' ? 'warn' : 'ok'}">${t('type_' + s.type)}${s.refOf ? ' №' + s.refOf : ''}</span></td>
    <td>${t('method_' + s.method)}</td>
    <td class="num ${s.total < 0 ? 'neg' : ''}">${fmtMoney(s.total)}</td>
    <td><button class="btn sm" data-view="${s.number}">${t('view')}</button>
        ${s.type === 'sale' ? `<button class="btn sm danger" data-refund="${s.number}">${t('refund')}</button>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="7" class="hint">${t('none')}</td></tr>`;
}

function refundSum() {
  let sum = 0;
  $$('#rfItems input').forEach((inp) => {
    const q = parseFloat(inp.value) || 0, it = rf.items[+inp.dataset.i];
    if (q > 0) sum += q === it.qty - (it.refundedQty || 0) ? it.net - (it.refundedNet || 0) : (it.net * q) / it.qty;
  });
  $('#rfSum').textContent = fmtMoney(sum);
}

$('#list').addEventListener('click', (e) => {
  const v = e.target.dataset.view, r = e.target.dataset.refund;
  if (v) showReceiptDialog(sales.find((s) => s.number === +v));
  if (r) {
    rf = sales.find((s) => s.number === +r);
    $('#rfNo').textContent = rf.number;
    $('#rfMethod').value = rf.method;
    $('#rfItems').innerHTML = rf.items.map((it, i) => {
      const left = Math.round((it.qty - (it.refundedQty || 0)) * 1000) / 1000;
      return `<tr><td>${esc(it.name)}</td><td class="num">${fmtQty(it.qty)}</td><td class="num">${fmtQty(it.refundedQty || 0)}</td>
        <td><input type="number" min="0" max="${left}" step="any" value="0" data-i="${i}" style="width:90px" ${left <= 0 ? 'disabled' : ''}>
        ${left > 0 ? `<button type="button" class="btn sm" data-all="${i}" data-left="${left}">${t('all')}</button>` : ''}</td></tr>`;
    }).join('');
    refundSum();
    $('#refundDlg').showModal();
  }
});

$('#rfItems').addEventListener('input', refundSum);
$('#rfItems').addEventListener('click', (e) => {
  if (e.target.dataset.all !== undefined) { $(`#rfItems input[data-i="${e.target.dataset.all}"]`).value = e.target.dataset.left; refundSum(); }
});
$('#rfCancel').onclick = () => $('#refundDlg').close();
$('#rfOk').onclick = async () => {
  const items = $$('#rfItems input').map((i) => ({ index: +i.dataset.i, qty: parseFloat(i.value) || 0 })).filter((x) => x.qty > 0);
  if (!items.length) { toast(t('refund_nothing'), true); return; }
  if (!confirm(t('refund_confirm'))) return;
  try {
    const r = await api(`/api/sales/${rf.number}/refund`, { method: 'POST', body: { items, method: $('#rfMethod').value } });
    $('#refundDlg').close();
    toast(`${t('refund_done')} №${r.number}`);
    await load();
    showReceiptDialog(r);
  } catch (err) { fail(err); }
};

$('#filters').addEventListener('submit', (e) => { e.preventDefault(); load().catch(fail); });

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  $('#fFrom').value = $('#fTo').value = ymdLocal();
  await load().catch(fail);
})();
