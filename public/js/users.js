let users = [], editingId = null;

async function load() {
  users = await api('/api/users');
  $('#list').innerHTML = users.map((u) => `<tr>
    <td>${esc(u.name)}</td><td class="code">${esc(u.username)}</td><td>${t('role_' + u.role)}</td>
    <td><span class="chip ${u.active ? 'ok' : 'warn'}">${u.active ? t('active') : t('inactive')}</span></td>
    <td><button class="btn sm" data-edit="${u._id}">${t('edit')}</button>
        <button class="btn sm" data-toggle="${u._id}">${u.active ? t('deactivate') : t('activate')}</button></td></tr>`).join('');
}

function reset() {
  $('#form').reset(); editingId = null;
  $('#uUser').disabled = false; $('#uPass').required = true;
  $('#formTitle').textContent = t('user_new'); $('#cancelEdit').hidden = true;
  $('#pwLabel').textContent = t('password');
}
$('#cancelEdit').onclick = reset;

$('#list').addEventListener('click', async (e) => {
  const ed = e.target.dataset.edit, tg = e.target.dataset.toggle;
  if (ed) {
    const u = users.find((x) => x._id === ed);
    editingId = ed;
    $('#uName').value = u.name; $('#uUser').value = u.username; $('#uUser').disabled = true; $('#uRole').value = u.role;
    $('#uPass').value = ''; $('#uPass').required = false; $('#pwLabel').textContent = t('password_new_optional');
    $('#formTitle').textContent = t('user_edit'); $('#cancelEdit').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (tg) {
    const u = users.find((x) => x._id === tg);
    try { await api('/api/users/' + tg, { method: 'PUT', body: { active: !u.active } }); await load(); } catch (err) { fail(err); }
  }
});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (editingId) {
      const body = { name: $('#uName').value, role: $('#uRole').value };
      if ($('#uPass').value) body.password = $('#uPass').value;
      await api('/api/users/' + editingId, { method: 'PUT', body });
    } else {
      await api('/api/users', { method: 'POST', body: { name: $('#uName').value, username: $('#uUser').value, role: $('#uRole').value, password: $('#uPass').value } });
    }
    toast(t('saved')); reset(); await load();
  } catch (err) { fail(err); }
});

(async () => {
  const me = await initPage('owner');
  if (!me) return;
  await load().catch(fail);
})();
