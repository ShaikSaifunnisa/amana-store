(function () {
  const { api, esc, money, fmtDate, fmtDateTime, label, img, init, $, $$, toast, setBusy, showFieldErrors, requireAdmin, debounce } = App;
  init('admin');
  if (!requireAdmin()) return;

  const FLOW = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const PAYS = ['PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED'];
  const st = { tab: 'dashboard', o: { page: 1, userId: '' }, p: { page: 1 }, u: { page: 1 } };
  const err = (e) => `<div class="alert">${esc(e.message)}</div>`;

  /* ---------- tabs ---------- */
  function show(tab) {
    st.tab = tab;
    ['dashboard', 'orders', 'products', 'users'].forEach((t) => { $(`#tab-${t}`).hidden = t !== tab; });
    $$('.admin-nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    history.replaceState(null, '', `#${tab}`);
    ({ dashboard: loadDashboard, orders: loadOrders, products: loadProducts, users: loadUsers })[tab]();
  }
  $$('.admin-nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  const pager = (el, data, key, fn) => {
    el.innerHTML = data.pages > 1 ? Array.from({ length: data.pages }, (_, i) => `<button class="${i + 1 === data.page ? 'on' : ''}" data-p="${i + 1}">${i + 1}</button>`).join('') : '';
    el.onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { st[key].page = Number(b.dataset.p); fn(); } };
  };

  /* ---------- dashboard ---------- */
  async function loadDashboard() {
    const root = $('#tab-dashboard');
    try {
      const { stats: s, lowStock, recent } = await api('/api/admin/stats');
      const card = (n, t) => `<div class="stat"><b>${n}</b><span>${t}</span></div>`;
      root.innerHTML = `<h2>Dashboard</h2><div class="stat-grid">
        ${card(s.totalUsers, 'Customers')}${card(s.totalProducts, 'Active products')}${card(s.totalOrders, 'Total orders')}
        ${card(s.pendingOrders, 'Pending orders')}${card(s.inTransitOrders, 'In transit')}${card(s.deliveredOrders, 'Delivered')}${card(s.cancelledOrders, 'Cancelled')}${card(money(s.totalSales), 'Total sales (excl. cancelled)')}</div>
        <div class="two-col" style="grid-template-columns:1fr 1fr;padding:0">
        <div class="card"><h3>Recent orders</h3>${recent.length ? recent.map((o) => `<div class="row between" style="padding:.45rem 0;border-bottom:1px solid var(--line)"><a href="#orders" data-open="${esc(o.orderId)}"><b>${esc(o.orderId)}</b></a><span class="muted small">${esc(o.customer && o.customer.name)}</span><span class="badge ${esc(o.status)}">${esc(label(o.status))}</span><b>${money(o.totalAmount)}</b></div>`).join('') : '<p class="muted">No orders yet.</p>'}</div>
        <div class="card"><h3>Low stock</h3>${lowStock.length ? lowStock.map((p) => `<div class="row between" style="padding:.45rem 0;border-bottom:1px solid var(--line)"><span>${esc(p.name)}</span><span class="badge ${p.stock === 0 ? 'CANCELLED' : 'PLACED'}">${p.stock} left</span></div>`).join('') : '<p class="muted">All products are well stocked.</p>'}</div></div>`;
      $$('[data-open]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOrder(a.dataset.open); }));
    } catch (e) { root.innerHTML = err(e); }
  }

  /* ---------- orders ---------- */
  async function loadOrders() {
    const body = $('#o-body');
    const p = new URLSearchParams({ page: st.o.page, limit: 12 });
    if ($('#o-q').value.trim()) p.set('q', $('#o-q').value.trim());
    if ($('#o-status').value) p.set('status', $('#o-status').value);
    if ($('#o-pay').value) p.set('payment', $('#o-pay').value);
    if (st.o.userId) p.set('userId', st.o.userId);
    try {
      const d = await api(`/api/admin/orders?${p}`);
      $('#orders-count').textContent = `${d.total} order${d.total === 1 ? '' : 's'}`;
      body.innerHTML = d.orders.length ? d.orders.map((o) => `<tr>
        <td><b>${esc(o.orderId)}</b></td><td>${esc(o.customer.name)}<div class="muted small">${esc(o.customer.phone)}</div></td><td>${fmtDate(o.createdAt)}</td><td>${money(o.totalAmount)}</td>
        <td><span class="badge ${esc(o.paymentStatus)}">${esc(label(o.paymentStatus))}</span><div class="muted small">${o.paymentMethod}</div></td>
        <td><span class="badge ${esc(o.status)}">${esc(label(o.status))}</span></td><td><button class="btn ghost sm" data-order="${esc(o.orderId)}">Manage</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="center muted" style="padding:2rem">No orders match these filters.</td></tr>';
      pager($('#o-pager'), d, 'o', loadOrders);
    } catch (e) { body.innerHTML = `<tr><td colspan="7">${err(e)}</td></tr>`; }
  }
  const reloadOrders = debounce(() => { st.o.page = 1; loadOrders(); });
  $('#o-q').addEventListener('input', reloadOrders);
  $('#o-status').addEventListener('change', reloadOrders);
  $('#o-pay').addEventListener('change', reloadOrders);
  $('#o-body').addEventListener('click', (e) => { const b = e.target.closest('[data-order]'); if (b) openOrder(b.dataset.order); });

  function setUserFilter(id, name) {
    st.o.userId = id || '';
    const el = $('#o-user');
    el.hidden = !id;
    el.innerHTML = id ? `Showing orders for <b>${esc(name)}</b> · <a href="#" id="clear-user">show all</a>` : '';
    const c = $('#clear-user'); if (c) c.addEventListener('click', (e) => { e.preventDefault(); setUserFilter(''); loadOrders(); });
  }

  async function openOrder(orderId) {
    const dlg = $('#order-dlg'); const box = $('#order-dlg-body');
    box.innerHTML = '<div class="skeleton" style="min-height:200px"></div>';
    if (!dlg.open) dlg.showModal();
    try {
      const { order: o, account } = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`);
      const done = o.status === 'DELIVERED' || o.status === 'CANCELLED';
      const next = FLOW.slice(FLOW.indexOf(o.status) + 1);
      const a = o.shippingAddress || {};
      box.innerHTML = `<div class="row between"><h2 style="font-size:1.4rem;margin:0">${esc(o.orderId)}</h2><button class="btn ghost sm" id="od-close">Close</button></div>
        <div class="row" style="margin:.6rem 0"><span class="badge ${esc(o.status)}">${esc(label(o.status))}</span><span class="badge ${esc(o.paymentStatus)}">Payment: ${esc(label(o.paymentStatus))}</span><span class="muted small">${o.paymentMethod} · ${fmtDateTime(o.createdAt)}</span></div>
        <div class="grid2" style="margin-bottom:1rem"><div><b>Customer</b><div class="small">${esc(o.customer.name)}<br>${esc(o.customer.email)}<br>${esc(o.customer.phone)}${account && !account.isActive ? '<br><span class="badge CANCELLED">Account disabled</span>' : ''}</div></div>
          <div><b>Ship to</b><div class="small">${esc(a.fullName)}<br>${esc(a.address)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</div></div></div>
        <table><thead><tr><th></th><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${img(i.image, i.name, 'thumb')}</td><td>${esc(i.name)}</td><td>${i.quantity}</td><td>${money(i.unitPrice)}</td><td>${money(i.lineTotal)}</td></tr>`).join('')}</tbody></table>
        <div class="small right" style="margin:.7rem 0">Subtotal ${money(o.subtotal)} · Discount −${money(o.discount)} · Delivery ${money(o.deliveryCharge)} · <b>Total ${money(o.totalAmount)}</b></div>
        ${o.status === 'CANCELLED' ? `<div class="alert">Cancelled by <b>${esc(o.cancelledBy)}</b> on ${fmtDateTime(o.cancelledAt)}.<br>Reason: ${esc(o.cancellationReason)}<br>Refund: ${esc(label(o.refundStatus))}</div>` : ''}
        <b>History</b><ul class="small" style="margin:.4rem 0 1rem;padding-left:1.1rem">${o.statusHistory.map((h) => `<li>${esc(label(h.status))} · ${fmtDateTime(h.at)} · ${esc(h.by || '')}${h.note ? ` · ${esc(h.note)}` : ''}</li>`).join('')}</ul>
        ${done ? '' : `<div class="card" style="box-shadow:none;border:1px solid var(--line);padding:1rem"><b>Update status</b>
          <div class="filters-bar" style="margin:.6rem 0 0"><select id="od-next">${next.map((s) => `<option value="${s}">${esc(label(s))}</option>`).join('')}</select><input id="od-note" placeholder="Note (optional)"><button class="btn" id="od-update">Update</button></div>
          <div class="filters-bar" style="margin:.8rem 0 0"><input id="od-reason" placeholder="Cancellation reason"><button class="btn danger" id="od-cancel">Cancel order</button></div></div>`}
        <div class="filters-bar" style="margin-top:1rem"><label class="small" style="margin:0;align-self:center">Payment status</label><select id="od-pay">${PAYS.map((s) => `<option ${s === o.paymentStatus ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn ghost sm" id="od-pay-save">Save payment status</button></div>`;

      $('#od-close').addEventListener('click', () => dlg.close());
      const refresh = () => { openOrder(o.orderId); loadOrders(); if (st.tab === 'dashboard') loadDashboard(); };
      const up = $('#od-update');
      if (up) up.addEventListener('click', async () => {
        setBusy(up, true, 'Updating…');
        try { await api(`/api/admin/orders/${o._id}/status`, { method: 'PUT', body: { status: $('#od-next').value, note: $('#od-note').value } }); toast('Status updated. The customer was notified live.', 'success'); refresh(); }
        catch (e) { toast(e.message, 'error'); setBusy(up, false); }
      });
      const cn = $('#od-cancel');
      if (cn) cn.addEventListener('click', async () => {
        const reason = $('#od-reason').value.trim();
        if (reason.length < 3) { toast('Enter a cancellation reason first.', 'error'); return; }
        if (!confirm('Cancel this order? Stock will be restored and the customer notified.')) return;
        setBusy(cn, true, 'Cancelling…');
        try { await api(`/api/admin/orders/${o._id}/status`, { method: 'PUT', body: { status: 'CANCELLED', note: reason } }); toast('Order cancelled and stock restored.', 'success'); refresh(); }
        catch (e) { toast(e.message, 'error'); setBusy(cn, false); }
      });
      $('#od-pay-save').addEventListener('click', async (ev) => {
        setBusy(ev.target, true, 'Saving…');
        try { await api(`/api/admin/orders/${o._id}/payment`, { method: 'PUT', body: { paymentStatus: $('#od-pay').value } }); toast('Payment status saved.', 'success'); refresh(); }
        catch (e) { toast(e.message, 'error'); setBusy(ev.target, false); }
      });
    } catch (e) { box.innerHTML = `${err(e)}<button class="btn ghost" id="od-close">Close</button>`; $('#od-close').addEventListener('click', () => dlg.close()); }
  }

  /* ---------- products ---------- */
  async function loadProducts() {
    const body = $('#p-body');
    const p = new URLSearchParams({ page: st.p.page, limit: 12 });
    if ($('#p-q').value.trim()) p.set('q', $('#p-q').value.trim());
    if ($('#p-status').value) p.set('status', $('#p-status').value);
    try {
      const d = await api(`/api/admin/products?${p}`);
      const prices = (x) => `${money(x.finalPrice != null ? x.finalPrice : x.price)}${x.discountPrice ? ` <s class="muted small">${money(x.price)}</s>` : ''}`;
      body.innerHTML = d.products.length ? d.products.map((x) => `<tr>
        <td>${img(x.images[0], x.name, 'thumb')}</td><td><b>${esc(x.name)}</b><div class="muted small">${esc(x.productId)} · ${esc(x.brand || '')}</div></td><td>${esc(x.category)}</td><td>${prices(x)}</td>
        <td><div class="row" style="flex-wrap:nowrap"><input type="number" min="0" value="${x.stock}" data-stock="${esc(x._id)}" style="width:80px;padding:.4rem .5rem" aria-label="Stock for ${esc(x.name)}"><button class="btn ghost sm" data-save-stock="${esc(x._id)}">Save</button></div></td>
        <td><span class="badge ${x.isActive ? 'DELIVERED' : 'CANCELLED'}">${x.isActive ? 'Active' : 'Inactive'}</span></td>
        <td><div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-edit="${esc(x._id)}">Edit</button><button class="btn ghost sm" data-toggle="${esc(x._id)}" data-active="${x.isActive}">${x.isActive ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('')
        : '<tr><td colspan="7" class="center muted" style="padding:2rem">No products found.</td></tr>';
      pager($('#p-pager'), d, 'p', loadProducts);
      body._data = Object.fromEntries(d.products.map((x) => [x._id, x]));
    } catch (e) { body.innerHTML = `<tr><td colspan="7">${err(e)}</td></tr>`; }
  }
  const reloadProducts = debounce(() => { st.p.page = 1; loadProducts(); });
  $('#p-q').addEventListener('input', reloadProducts);
  $('#p-status').addEventListener('change', reloadProducts);

  $('#p-body').addEventListener('click', async (e) => {
    const body = $('#p-body');
    const ss = e.target.closest('[data-save-stock]');
    if (ss) {
      const stock = Number($(`[data-stock="${ss.dataset.saveStock}"]`).value);
      setBusy(ss, true, '…');
      try { await api(`/api/admin/products/${ss.dataset.saveStock}`, { method: 'PUT', body: { stock } }); toast('Stock updated.', 'success'); } catch (x) { toast(x.message, 'error'); }
      return setBusy(ss, false);
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return openProductForm(body._data[ed.dataset.edit]);
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      try {
        if (tg.dataset.active === 'true') await api(`/api/admin/products/${tg.dataset.toggle}`, { method: 'DELETE' });
        else await api(`/api/admin/products/${tg.dataset.toggle}`, { method: 'PUT', body: { isActive: true } });
        toast('Product updated.', 'success'); loadProducts();
      } catch (x) { toast(x.message, 'error'); }
    }
  });

  const pf = $('#product-form');
  async function openProductForm(p) {
    pf.reset(); showFieldErrors(pf, {}); $('#product-alert').innerHTML = '';
    $('#product-title').textContent = p ? 'Edit product' : 'Add product';
    pf.elements._id.value = p ? p._id : '';
    if (p) {
      ['name', 'description', 'category', 'brand', 'price', 'stock'].forEach((k) => (pf.elements[k].value = p[k] == null ? '' : p[k]));
      pf.elements.discountPrice.value = p.discountPrice == null ? '' : p.discountPrice;
      pf.elements.isActive.value = String(p.isActive);
      pf.elements.images.value = (p.images || []).join('\n');
    }
    try { const { categories } = await api('/api/products/categories', { auth: false }); $('#cat-options').innerHTML = categories.map((c) => `<option value="${esc(c.name)}">`).join(''); } catch (x) { /* optional */ }
    $('#product-dlg').showModal();
  }
  $('#p-add').addEventListener('click', () => openProductForm(null));
  $('#product-cancel').addEventListener('click', () => $('#product-dlg').close());

  $('#pf-files').addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    const fd = new FormData();
    [...e.target.files].forEach((f) => fd.append('images', f));
    try {
      const { urls } = await api('/api/admin/upload', { method: 'POST', formData: fd });
      const ta = pf.elements.images;
      ta.value = [ta.value.trim(), ...urls].filter(Boolean).join('\n');
      toast(`${urls.length} image(s) uploaded.`, 'success');
    } catch (x) { toast(x.message, 'error'); }
    e.target.value = '';
  });

  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = pf.querySelector('button[type=submit]');
    showFieldErrors(pf, {}); $('#product-alert').innerHTML = '';
    const f = Object.fromEntries(new FormData(pf));
    const id = f._id; delete f._id;
    f.images = f.images.split('\n').map((s) => s.trim()).filter(Boolean);
    setBusy(btn, true, 'Saving…');
    try {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: f });
      $('#product-dlg').close(); toast(id ? 'Product updated.' : 'Product created.', 'success'); loadProducts();
    } catch (x) { showFieldErrors(pf, x.errors || {}); $('#product-alert').innerHTML = err(x); }
    setBusy(btn, false);
  });

  /* ---------- users ---------- */
  async function loadUsers() {
    const body = $('#u-body');
    const p = new URLSearchParams({ page: st.u.page, limit: 15 });
    if ($('#u-q').value.trim()) p.set('q', $('#u-q').value.trim());
    try {
      const d = await api(`/api/admin/users?${p}`);
      body.innerHTML = d.users.length ? d.users.map((u) => `<tr>
        <td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="badge">Admin</span>' : ''}</td><td>${esc(u.email)}<div class="muted small">${esc(u.phone)}</div></td><td>${fmtDate(u.createdAt)}</td><td>${u.orderCount}</td><td>${money(u.totalSpent)}</td>
        <td><span class="badge ${u.isActive ? 'DELIVERED' : 'CANCELLED'}">${u.isActive ? 'Active' : 'Disabled'}</span></td>
        <td><div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-uorders="${esc(u._id)}" data-name="${esc(u.name)}">Orders</button>${u.role === 'admin' ? '' : `<button class="btn ghost sm" data-utoggle="${esc(u._id)}" data-active="${u.isActive}">${u.isActive ? 'Disable' : 'Enable'}</button>`}</div></td></tr>`).join('')
        : '<tr><td colspan="7" class="center muted" style="padding:2rem">No users found.</td></tr>';
      pager($('#u-pager'), d, 'u', loadUsers);
    } catch (e) { body.innerHTML = `<tr><td colspan="7">${err(e)}</td></tr>`; }
  }
  $('#u-q').addEventListener('input', debounce(() => { st.u.page = 1; loadUsers(); }));
  $('#u-body').addEventListener('click', async (e) => {
    const uo = e.target.closest('[data-uorders]');
    if (uo) { setUserFilter(uo.dataset.uorders, uo.dataset.name); st.o.page = 1; show('orders'); return; }
    const ut = e.target.closest('[data-utoggle]');
    if (ut) {
      const enable = ut.dataset.active !== 'true';
      if (!enable && !confirm('Disable this account? The user will be logged out immediately.')) return;
      try { await api(`/api/admin/users/${ut.dataset.utoggle}/status`, { method: 'PUT', body: { isActive: enable } }); toast(enable ? 'Account enabled.' : 'Account disabled.', 'success'); loadUsers(); }
      catch (x) { toast(x.message, 'error'); }
    }
  });

  /* ---------- realtime ---------- */
  const live = debounce(() => { if (st.tab === 'orders') loadOrders(); if (st.tab === 'dashboard') loadDashboard(); }, 400);
  window.addEventListener('order:new', live);
  window.addEventListener('order:updated', live);

  show(['dashboard', 'orders', 'products', 'users'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
})();
