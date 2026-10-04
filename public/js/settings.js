function fill(s) {
  $('#sName').value = s.storeName; $('#sAddr').value = s.storeAddress; $('#sPhone').value = s.storePhone; $('#sFooter').value = s.receiptFooter;
  $('#sDays').value = s.expiryWarnDays; $('#wOn').checked = s.weightEnabled; $('#wPrefix').value = s.weightPrefix; $('#wMode').value = s.weightMode;
  $('#wItemLen').value = s.weightItemLen; $('#wValStart').value = s.weightValueStart; $('#wValLen').value = s.weightValueLen;
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const s = await api('/api/settings', { method: 'PUT', body: {
      storeName: $('#sName').value, storeAddress: $('#sAddr').value, storePhone: $('#sPhone').value, receiptFooter: $('#sFooter').value,
      expiryWarnDays: $('#sDays').value, weightEnabled: $('#wOn').checked, weightPrefix: $('#wPrefix').value, weightMode: $('#wMode').value,
      weightItemLen: $('#wItemLen').value, weightValueStart: $('#wValStart').value, weightValueLen: $('#wValLen').value } });
    fill(s); toast(t('saved'));
  } catch (err) { fail(err); }
});

const kb = (n) => (n / 1024 < 1024 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

async function loadBackups() {
  const r = await api('/api/backup');
  $('#bkDir').textContent = r.dir;
  $('#bkList').innerHTML = r.files.map((f) => `<tr><td>${fmtDateTime(f.mtime)}</td><td class="code">${esc(f.name)}</td><td class="num">${kb(f.size)}</td>
    <td><a class="btn sm" href="/api/backup/${encodeURIComponent(f.name)}/download">${t('download')}</a>
        <button class="btn sm danger" data-restore="${esc(f.name)}">${t('backup_restore')}</button></td></tr>`).join('')
    || `<tr><td colspan="4" class="hint">${t('none')}</td></tr>`;
}

$('#bkNow').onclick = async () => { try { await api('/api/backup', { method: 'POST', body: {} }); toast(t('saved')); await loadBackups(); } catch (e) { fail(e); } };

$('#bkList').addEventListener('click', async (e) => {
  const name = e.target.dataset.restore;
  if (!name) return;
  if (prompt(t('backup_restore_confirm', { name })) !== 'RESTORE') return;
  try {
    await api(`/api/backup/${encodeURIComponent(name)}/restore`, { method: 'POST', body: { confirm: 'RESTORE' } });
    alert(t('backup_restored'));
    location.href = '/login.html';
  } catch (err) { fail(err); }
});

(async () => {
  const me = await initPage('owner');
  if (!me) return;
  fill(SETTINGS);
  await loadBackups().catch(fail);
})();
