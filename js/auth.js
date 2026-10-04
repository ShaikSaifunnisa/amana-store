(function () {
  const { api, Auth, Cart, esc, init, $, qs, setBusy, showFieldErrors } = App;
  init('login');
  const safeNext = () => { const n = qs('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : null; };

  async function afterLogin(r) {
    Auth.save(r.token, r.user);
    await Cart.mergeGuest();
    location.href = safeNext() || (r.user.role === 'admin' ? '/admin.html' : '/');
  }

  function handle(form, action) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      $('#form-alert').innerHTML = '';
      showFieldErrors(form, {});
      const body = Object.fromEntries(new FormData(form));
      const local = {};
      for (const el of form.elements) if (el.required && !String(el.value).trim()) local[el.name] = 'This field is required.';
      if (form.elements.confirmPassword && form.elements.password && body.password !== body.confirmPassword) local.confirmPassword = 'Passwords do not match.';
      showFieldErrors(form, local);
      if (Object.keys(local).length) { form.elements[Object.keys(local)[0]].focus(); return; }
      setBusy(btn, true, 'Please wait…');
      try { await action(body, form); }
      catch (err) { showFieldErrors(form, err.errors || {}); $('#form-alert').innerHTML = `<div class="alert">${esc(err.message)}</div>`; setBusy(btn, false); }
    });
  }

  const login = $('#login-form');
  if (login) { if (Auth.loggedIn) location.replace(safeNext() || '/'); handle(login, async (b) => afterLogin(await api('/api/auth/login', { method: 'POST', body: b, auth: false }))); }

  const reg = $('#register-form');
  if (reg) handle(reg, async (b) => afterLogin(await api('/api/auth/register', { method: 'POST', body: b, auth: false })));

  const forgot = $('#forgot-form');
  if (forgot) handle(forgot, async (b, f) => {
    const r = await api('/api/auth/forgot-password', { method: 'POST', body: b, auth: false });
    f.innerHTML = `<h1 style="font-size:2rem">Check your inbox</h1><div class="alert ok">${esc(r.message)}</div><a class="btn block" href="/login.html">Back to log in</a>`;
  });

  const reset = $('#reset-form');
  if (reset) {
    const token = qs('token');
    if (!token) $('#form-alert').innerHTML = '<div class="alert">This reset link is missing its token. Request a new link.</div>';
    handle(reset, async (b, f) => {
      const r = await api('/api/auth/reset-password', { method: 'POST', body: { ...b, token }, auth: false });
      f.innerHTML = `<h1 style="font-size:2rem">Password updated</h1><div class="alert ok">${esc(r.message)}</div><a class="btn block" href="/login.html">Log in</a>`;
    });
  }
})();
