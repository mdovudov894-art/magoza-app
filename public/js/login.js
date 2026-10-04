applyI18n();
langButtons($('#langBox'));
const msg = $('#msg');

(async () => {
  try {
    const { needsSetup } = await api('/api/auth/status');
    $('#loginForm').hidden = needsSetup;
    $('#setupForm').hidden = !needsSetup;
  } catch (e) { msg.textContent = e.message; }
})();

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } });
    location.href = '/';
  } catch (err) { msg.textContent = err.message; }
});

$('#setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  if ($('#sPass').value !== $('#sPass2').value) { msg.textContent = t('E_PASSWORD_MISMATCH'); return; }
  try {
    await api('/api/auth/setup', { method: 'POST', body: { name: $('#sName').value, username: $('#sUser').value, password: $('#sPass').value } });
    location.href = '/';
  } catch (err) { msg.textContent = err.message; }
});
