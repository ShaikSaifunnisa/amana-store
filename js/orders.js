(function () {
  const { api, esc, money, fmtDate, img, label, init, $, requireLogin } = App;
  init('orders');
  if (!requireLogin()) return;
  const state = { status: 'all', page: 1 };
  const TABS = [['all', 'All'], ['active', 'Active'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

  function tabs(counts) {
    $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${state.status === k ? 'on' : ''}" data-s="${k}" role="tab" aria-selected="${state.status === k}">${t}${counts ? ` (${counts[k] || 0})` : ''}</button>`).join('');
  }

  async function load() {
    const root = $('#orders-root');
    root.innerHTML = '<div class="skeleton" style="min-height:200px"></div>';
    try {
      const data = await api(`/api/orders?status=${state.status}&page=${state.page}&limit=8`);
      tabs(data.counts);
      root.innerHTML = data.orders.length ? data.orders.map((o) => `
        <a class="order-card" href="/order-details.html?id=${esc(o.orderId)}" data-oid="${esc(o.orderId)}">
          <div class="head"><div><b>${esc(o.orderId)}</b><div class="muted small">${fmtDate(o.createdAt)}</div></div>
            <div class="row"><span class="badge ${esc(o.paymentStatus)}">Payment: ${esc(label(o.paymentStatus))}</span><span class="badge ${esc(o.status)}" data-status>${esc(label(o.status))}</span></div></div>
          <div class="items">${o.items.slice(0, 4).map((i) => img(i.image, i.name)).join('')}
            <div style="flex:1;min-width:200px">${o.items.map((i) => `${esc(i.name)} × ${i.quantity}`).join(', ')}</div></div>
          <div class="foot"><span class="muted small">${o.items.reduce((a, i) => a + i.quantity, 0)} item(s) · ${o.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online payment'}</span><b>${money(o.totalAmount)}</b></div>
        </a>`).join('')
        : `<div class="empty"><h2>${state.status === 'all' ? 'No orders yet' : `No ${state.status} orders`}</h2><p class="muted">${state.status === 'all' ? 'When you place an order it shows up here, and stays here even if you cancel it.' : 'Nothing to show in this tab.'}</p><a class="btn" href="/products.html">Browse the shop</a></div>`;
      $('#pager').innerHTML = data.pages > 1 ? Array.from({ length: data.pages }, (_, i) => `<button class="${i + 1 === data.page ? 'on' : ''}" data-page="${i + 1}">${i + 1}</button>`).join('') : '';
    } catch (err) { root.innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  }

  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; state.status = b.dataset.s; state.page = 1; load(); });
  $('#pager').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (!b) return; state.page = Number(b.dataset.page); load(); });
  // A status change made by an admin refreshes the list without a page reload.
  window.addEventListener('order:updated', load);
  tabs(); load();
})();
