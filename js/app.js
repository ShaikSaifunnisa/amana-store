/* Shared client code: API wrapper, auth session, cart, layout, realtime, helpers. */
(function () {
  const API_BASE = window.API_BASE || '';
  const TOKEN_KEY = 'grove_token';
  const USER_KEY = 'grove_user';
  const GUEST_CART_KEY = 'grove_guest_cart';

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n) || 0);
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const label = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase());
  const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const unitPrice = (p) => (p.discountPrice != null && p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price);
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#e3eee7"/><circle cx="200" cy="170" r="48" fill="#b9d3c4"/><rect x="110" y="240" width="180" height="22" rx="11" fill="#b9d3c4"/></svg>');
  const imgSrc = (url) => (url ? (/^https?:/i.test(url) ? url : API_BASE + url) : PLACEHOLDER);
  const img = (url, alt, cls) => `<img src="${esc(imgSrc(url))}" alt="${esc(alt || '')}" ${cls ? `class="${cls}"` : ''} loading="lazy">`;
  // CSP forbids inline onerror handlers, so broken images fall back via one capturing listener.
  document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = '1'; t.src = PLACEHOLDER; } }, true);
  const stars = (r, n) => { const f = Math.round(r || 0); return `<span class="stars" aria-label="${r || 0} out of 5">${'★'.repeat(f)}${'☆'.repeat(5 - f)}${n != null ? `<small>(${n})</small>` : ''}</span>`; };

  function toast(message, type = 'info', ms = 4500) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; if (text) btn.textContent = text; }
    else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  function showFieldErrors(form, errors) {
    $$('.err', form).forEach((e) => (e.textContent = ''));
    $$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const input = form.elements[name];
      if (!input) return;
      input.classList.add('invalid');
      const err = input.closest('.field') && $('.err', input.closest('.field'));
      if (err) err.textContent = msg;
    });
  }

  /* ---------- session ---------- */
  const Auth = {
    get token() { return localStorage.getItem(TOKEN_KEY); },
    get user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } },
    get loggedIn() { return !!localStorage.getItem(TOKEN_KEY); },
    get isAdmin() { const u = this.user; return !!(u && u.role === 'admin'); },
    save(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
    setUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); },
    clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  };

  /* ---------- API ---------- */
  class ApiError extends Error { constructor(msg, status, errors) { super(msg); this.status = status; this.errors = errors; } }

  async function api(path, { method = 'GET', body, formData, auth = true } = {}) {
    const headers = {};
    if (auth && Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
    let payload;
    if (formData) payload = formData;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(API_BASE + path, { method, headers, body: payload });
    } catch (e) {
      throw new ApiError('Network error. Check your internet connection and try again.', 0);
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      if (res.status === 401 && Auth.token && !path.startsWith('/api/auth/login')) {
        Auth.clear();
        sessionStorage.setItem('grove_flash', 'Your session expired. Please log in again.');
        location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      }
      throw new ApiError(data.message || `Request failed (${res.status}).`, res.status, data.errors);
    }
    return data;
  }

  function requireLogin() {
    if (!Auth.loggedIn) { location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search)}`); return false; }
    return true;
  }
  function requireAdmin() {
    if (!requireLogin()) return false;
    if (!Auth.isAdmin) { location.replace('/'); return false; }
    return true;
  }
  async function logout() {
    try { if (Auth.loggedIn) await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* token may already be invalid */ }
    Auth.clear();
    location.href = '/login.html';
  }
  async function refreshUser() {
    if (!Auth.loggedIn) return null;
    try { const { user } = await api('/api/auth/me'); Auth.setUser(user); return user; } catch (e) { return Auth.user; }
  }

  /* ---------- config ---------- */
  let cfgPromise;
  const getConfig = () => (cfgPromise = cfgPromise || api('/api/config', { auth: false }).then((r) => r.config).catch(() => ({ onlinePaymentEnabled: false, deliveryCharge: 49, freeDeliveryAbove: 999 })));

  /* ---------- cart (DB for logged-in users, localStorage for guests) ---------- */
  const guest = {
    read() { try { return JSON.parse(localStorage.getItem(GUEST_CART_KEY)) || []; } catch (e) { return []; } },
    write(items) { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items)); },
  };

  async function guestSummary(items) {
    const cfg = await getConfig();
    let subtotal = 0, payable = 0, count = 0;
    items.forEach((i) => { subtotal += i.product.price * i.quantity; payable += unitPrice(i.product) * i.quantity; count += i.quantity; });
    const r2 = (n) => Math.round(n * 100) / 100;
    const delivery = count === 0 ? 0 : payable >= cfg.freeDeliveryAbove ? 0 : cfg.deliveryCharge;
    return { itemCount: count, subtotal: r2(subtotal), discount: r2(subtotal - payable), deliveryCharge: delivery, total: r2(payable + delivery), freeDeliveryAbove: cfg.freeDeliveryAbove };
  }

  function announceCart(count) { localStorage.setItem('grove_cart_count', String(count)); window.dispatchEvent(new CustomEvent('cart:changed', { detail: { count } })); }

  const Cart = {
    async load() {
      if (Auth.loggedIn) { const r = await api('/api/cart'); announceCart(r.summary.itemCount); return r; }
      const raw = guest.read();
      if (!raw.length) { announceCart(0); return { items: [], summary: await guestSummary([]) }; }
      const { products } = await api(`/api/products?ids=${raw.map((i) => i.productId).join(',')}&limit=60`, { auth: false });
      const byId = Object.fromEntries(products.map((p) => [p._id, p]));
      const items = raw.filter((i) => byId[i.productId]).map((i) => {
        const p = byId[i.productId];
        return { product: p, quantity: i.quantity, available: p.stock > 0, lineProblem: p.stock < i.quantity ? `Only ${p.stock} left in stock` : null };
      });
      guest.write(items.map((i) => ({ productId: i.product._id, quantity: i.quantity })));
      const summary = await guestSummary(items.filter((i) => i.available).map((i) => ({ product: i.product, quantity: Math.min(i.quantity, i.product.stock) })));
      announceCart(summary.itemCount);
      return { items, summary };
    },
    async add(product, quantity = 1) {
      if (Auth.loggedIn) { const r = await api('/api/cart', { method: 'POST', body: { productId: product._id, quantity } }); announceCart(r.summary.itemCount); return r; }
      const items = guest.read();
      const line = items.find((i) => i.productId === product._id);
      const next = (line ? line.quantity : 0) + quantity;
      if (product.stock < 1) throw new ApiError(`${product.name} is out of stock.`, 409);
      if (next > product.stock) throw new ApiError(`Only ${product.stock} unit(s) of ${product.name} available.`, 409);
      if (line) line.quantity = next; else items.push({ productId: product._id, quantity });
      guest.write(items);
      return this.load();
    },
    async setQty(productId, quantity) {
      if (Auth.loggedIn) { const r = await api(`/api/cart/${productId}`, { method: 'PUT', body: { quantity } }); announceCart(r.summary.itemCount); return r; }
      let items = guest.read();
      if (quantity <= 0) items = items.filter((i) => i.productId !== productId);
      else { const line = items.find((i) => i.productId === productId); if (line) line.quantity = quantity; }
      guest.write(items);
      return this.load();
    },
    async remove(productId) {
      if (Auth.loggedIn) { const r = await api(`/api/cart/${productId}`, { method: 'DELETE' }); announceCart(r.summary.itemCount); return r; }
      guest.write(guest.read().filter((i) => i.productId !== productId));
      return this.load();
    },
    async mergeGuest() {
      const items = guest.read();
      if (!items.length || !Auth.loggedIn) return;
      try { await api('/api/cart/merge', { method: 'POST', body: { items } }); } catch (e) { /* keep guest cart if merge fails */ return; }
      guest.write([]);
    },
  };

  /* ---------- product card ---------- */
  function productCard(p) {
    const price = unitPrice(p);
    const pct = price < p.price ? Math.round((1 - price / p.price) * 100) : 0;
    return `<article class="pcard">
      ${pct ? `<span class="off">${pct}% off</span>` : ''}${p.stock < 1 ? '<span class="soldout">Sold out</span>' : ''}
      <div class="img">${img(p.images[0], p.name)}</div>
      <div class="body">
        <span class="cat">${esc(p.category)}${p.brand ? ' · ' + esc(p.brand) : ''}</span>
        <h3><a href="/product.html?id=${esc(p._id)}">${esc(p.name)}</a></h3>
        ${stars(p.rating, p.numReviews)}
        <div class="foot"><span class="price">${money(price)}${pct ? `<s>${money(p.price)}</s>` : ''}</span>
        <button class="btn sm" data-add="${esc(p._id)}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Add'}</button></div>
      </div></article>`;
  }

  // One delegated handler for every "Add" button on a product card.
  function bindAddButtons(root, getProduct) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      const product = getProduct(btn.dataset.add);
      if (!product) return;
      setBusy(btn, true, '…');
      try { await Cart.add(product, 1); toast(`${product.name} added to cart`, 'success'); }
      catch (err) { toast(err.message, 'error'); }
      setBusy(btn, false);
    });
  }

  /* ---------- layout ---------- */
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  function renderLayout(active) {
    const h = $('#site-header');
    if (h) {
      const u = Auth.user;
      h.className = 'site-header';
      h.innerHTML = `<div class="wrap">
        <a class="logo" href="/"><i></i>Grove</a>
        <form class="search" id="header-search" role="search">${ICON_SEARCH}<input type="search" name="q" placeholder="Search products, brands, categories" aria-label="Search products" value="${esc(qs('q') || '')}"></form>
        <button class="btn ghost sm menu-btn" id="menu-btn" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <nav class="nav" id="main-nav" aria-label="Main">
          <a href="/products.html" class="${active === 'products' ? 'active' : ''}">Shop</a>
          ${u ? `<a href="/orders.html" class="${active === 'orders' ? 'active' : ''}">My orders</a>` : ''}
          ${u && u.role === 'admin' ? `<a href="/admin.html" class="${active === 'admin' ? 'active' : ''}">Admin</a>` : ''}
          <a href="/cart.html" class="cart-link ${active === 'cart' ? 'active' : ''}" aria-label="Cart">Cart<span class="cart-count" id="cart-count" data-n="0"></span></a>
          ${u ? `<a href="/profile.html" class="${active === 'profile' ? 'active' : ''}">${esc(u.name.split(' ')[0])}</a><button class="link" id="logout-btn">Log out</button>`
              : `<a href="/login.html">Log in</a><a href="/register.html" class="btn sm">Sign up</a>`}
        </nav></div>`;
      $('#header-search').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q').trim(); location.href = `/products.html${q ? `?q=${encodeURIComponent(q)}` : ''}`; });
      const lb = $('#logout-btn'); if (lb) lb.addEventListener('click', logout);
      $('#menu-btn').addEventListener('click', (e) => { const open = $('#main-nav').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', open); });
      const setCount = (n) => { const el = $('#cart-count'); if (el) { el.textContent = n > 0 ? n : ''; el.dataset.n = n; } };
      setCount(Number(localStorage.getItem('grove_cart_count')) || 0);
      window.addEventListener('cart:changed', (e) => setCount(e.detail.count));
      Cart.load().catch(() => {});
    }
    const f = $('#site-footer');
    if (f) {
      f.className = 'site-footer';
      f.innerHTML = `<div class="wrap"><div><a class="logo" href="/" style="color:#fff"><i></i>Grove</a><p style="max-width:28rem;margin-top:.6rem">Everyday things, well made. Orders are tracked live from the moment you place them.</p></div>
        <div><h4>Shop</h4><a href="/products.html">All products</a><a href="/cart.html">Cart</a><a href="/orders.html">My orders</a></div>
        <div><h4>Account</h4><a href="/login.html">Log in</a><a href="/register.html">Create account</a><a href="/forgot-password.html">Reset password</a></div>
        <div class="copy">© ${new Date().getFullYear()} Grove Store. Built with Node.js, Express and MongoDB.</div></div>`;
    }
    const flash = sessionStorage.getItem('grove_flash');
    if (flash) { sessionStorage.removeItem('grove_flash'); toast(flash, 'info'); }
  }

  /* ---------- realtime ---------- */
  let socket;
  function connectRealtime() {
    if (!Auth.loggedIn || typeof io === 'undefined' || socket) return;
    socket = io(API_BASE || undefined, { auth: { token: Auth.token }, reconnectionAttempts: 10 });
    socket.on('order:updated', (data) => {
      toast(`${data.message}${Auth.isAdmin ? '' : ` (${data.orderId})`}`, data.status === 'CANCELLED' ? 'error' : 'success', 6000);
      window.dispatchEvent(new CustomEvent('order:updated', { detail: data }));
    });
    socket.on('order:new', (data) => {
      toast(data.message, 'success', 6000);
      window.dispatchEvent(new CustomEvent('order:new', { detail: data }));
    });
    socket.on('connect_error', () => { /* silent: the REST API still works without realtime */ });
  }

  function init(active) {
    renderLayout(active);
    connectRealtime();
  }

  window.App = { api, ApiError, Auth, Cart, esc, money, fmtDate, fmtDateTime, label, debounce, qs, $, $$, unitPrice, img, imgSrc, stars, toast, setBusy, showFieldErrors, requireLogin, requireAdmin, logout, refreshUser, getConfig, productCard, bindAddButtons, init, PLACEHOLDER };
})();
