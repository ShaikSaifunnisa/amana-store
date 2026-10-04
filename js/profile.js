(async function () {
  const { api, Auth, esc, init, $, toast, setBusy, showFieldErrors, requireLogin, logout } = App;
  init('profile');
  if (!requireLogin()) return;
  const form = $('#profile-form');
  const user = (await App.refreshUser()) || Auth.user;
  if (user) Object.keys(user).forEach((k) => { if (form.elements[k] && typeof user[k] === 'string') form.elements[k].value = user[k]; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    $('#form-alert').innerHTML = ''; showFieldErrors(form, {});
    const body = Object.fromEntries(new FormData(form)); delete body.email;
    setBusy(btn, true, 'Saving…');
    try { const r = await api('/api/auth/me', { method: 'PUT', body }); Auth.setUser(r.user); toast('Profile saved', 'success'); }
    catch (err) { showFieldErrors(form, err.errors || {}); $('#form-alert').innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
    setBusy(btn, false);
  });

  const pw = $('#password-form');
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = pw.querySelector('button[type=submit]');
    $('#pw-alert').innerHTML = ''; showFieldErrors(pw, {});
    setBusy(btn, true, 'Updating…');
    try {
      const r = await api('/api/auth/change-password', { method: 'PUT', body: Object.fromEntries(new FormData(pw)) });
      Auth.save(r.token, r.user); pw.reset(); toast('Password updated. Other devices were logged out.', 'success');
    } catch (err) { showFieldErrors(pw, err.errors || {}); $('#pw-alert').innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
    setBusy(btn, false);
  });

  $('#logout-all').addEventListener('click', logout);
})();
