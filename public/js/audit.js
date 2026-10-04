const ACTIONS = ['login', 'login_failed', 'setup', 'password_change', 'user_create', 'user_update', 'product_create', 'product_update', 'product_delete',
  'import', 'stock_receive', 'stock_writeoff', 'stock_adjust', 'refund', 'promo_create', 'promo_update', 'promo_delete', 'settings_update', 'backup_create'];
let entity = '', entityId = '';

function describe(e) {
  const d = e.details || {};
  if (d.changes && typeof d.changes === 'object') {
    const parts = Object.entries(d.changes).map(([k, v]) => (Array.isArray(v) ? `${k}: ${v[0]} → ${v[1]}` : `${k}: ${v}`));
    return `${d.name ? '<b>' + esc(d.name) + '</b> — ' : ''}${esc(parts.join('; '))}`;
  }
  const flat = Object.entries(d).filter(([, v]) => typeof v !== 'object' || v === null).map(([k, v]) => `${k}: ${v}`).join('; ');
  const extra = d.items ? ' ' + d.items.map((i) => `${i.name} ×${i.qty}`).join(', ') : '';
  return esc((e.entity === 'sale' ? '№' + e.entityId + ' ' : '') + flat + extra);
}

async function load() {
  const q = new URLSearchParams();
  if ($('#fAction').value) q.set('action', $('#fAction').value);
  if ($('#fUser').value) q.set('user', $('#fUser').value);
  if ($('#fFrom').value) q.set('from', $('#fFrom').value);
  if ($('#fTo').value) q.set('to', $('#fTo').value);
  if (entity) q.set('entity', entity);
  if (entityId) q.set('entityId', entityId);
  const list = await api('/api/audit?' + q);
  $('#list').innerHTML = list.map((e) => `<tr><td>${fmtDateTime(e.at)}</td><td>${esc(e.userName || '')}</td><td><span class="chip">${t('act_' + e.action)}</span></td><td>${describe(e)}</td></tr>`).join('')
    || `<tr><td colspan="4" class="hint">${t('none')}</td></tr>`;
}

$('#filters').addEventListener('submit', (e) => { e.preventDefault(); load().catch(fail); });
$('#reset').onclick = () => { $('#filters').reset(); entity = entityId = ''; $('#filterNote').hidden = true; load().catch(fail); };

(async () => {
  const me = await initPage('manager');
  if (!me) return;
  $('#fAction').innerHTML += ACTIONS.map((a) => `<option value="${a}">${t('act_' + a)}</option>`).join('');
  const p = new URLSearchParams(location.search);
  entity = p.get('entity') || ''; entityId = p.get('entityId') || '';
  if (entityId) { $('#filterNote').hidden = false; $('#filterNote').textContent = t('audit_filtered'); }
  await load().catch(fail);
})();
