(function () {
  const { api, esc, money, fmtDateTime, fmtDate, img, label, init, $, qs, toast, setBusy, requireLogin } = App;
  init('orders');
  if (!requireLogin()) return;
  const root = $('#order-root');
  const id = qs('id');
  const FLOW = [['PLACED', 'Order placed'], ['CONFIRMED', 'Confirmed'], ['PACKED', 'Packed'], ['SHIPPED', 'Shipped'], ['OUT_FOR_DELIVERY', 'Out for delivery'], ['DELIVERED', 'Delivered']];
  let order;

  function tracker(o) {
    const at = (s) => { const h = [...(o.statusHistory || [])].reverse().find((x) => x.status === s); return h ? h.at : null; };
    if (o.status === 'CANCELLED') {
      const reached = FLOW.filter(([s]) => at(s)).map(([s, t]) => [s, t]);
      return `<ol class="tracker" aria-label="Order progress">${reached.map(([s, t]) => `<li class="done"><span class="dot">✓</span><b>${t}</b><time>${fmtDateTime(at(s))}</time></li>`).join('')}
        <li class="cancelled"><span class="dot">✕</span><b>Cancelled${o.cancelledBy ? ` by ${o.cancelledBy === 'ADMIN' ? 'the store' : 'you'}` : ''}</b><time>${fmtDateTime(o.cancelledAt)}</time></li></ol>`;
    }
    const idx = FLOW.findIndex(([s]) => s === o.status);
    return `<ol class="tracker" aria-label="Order progress">${FLOW.map(([s, t], i) => {
      const cls = i < idx || (o.status === 'DELIVERED' && i === idx) ? 'done' : i === idx ? 'current' : 'todo';
      return `<li class="${cls}"><span class="dot">${cls === 'done' ? '✓' : cls === 'current' ? '●' : ''}</span><b>${t}</b><time>${at(s) ? fmtDateTime(at(s)) : 'Pending'}</time></li>`;
    }).join('')}</ol>`;
  }

  function render() {
    const o = order;
    const canCancel = ['PLACED', 'CONFIRMED'].includes(o.status);
    const needsPay = o.paymentMethod === 'ONLINE' && ['PENDING', 'FAILED'].includes(o.paymentStatus) && o.status !== 'CANCELLED';
    const a = o.shippingAddress || {};
    root.innerHTML = `
      ${qs('placed') ? `<div class="alert ok"><b>Thank you! Your order ${esc(o.orderId)} has been placed.</b> ${o.paymentMethod === 'COD' ? 'Pay in cash when it arrives.' : o.paymentStatus === 'PAID' ? 'Payment received.' : 'Payment is still pending.'}</div>` : ''}
      <div class="row between" style="margin-bottom:1rem"><div><a class="small" href="/orders.html">← All orders</a><h1 style="font-size:2rem;margin:.3rem 0 0">Order ${esc(o.orderId)}</h1><span class="muted small">Placed ${fmtDateTime(o.createdAt)}</span></div>
        <div class="row"><span class="badge ${esc(o.paymentStatus)}">Payment: ${esc(label(o.paymentStatus))}</span><span class="badge ${esc(o.status)}">${esc(label(o.status))}</span></div></div>
      ${needsPay ? `<div class="alert info row between"><span>This order is waiting for payment.</span><button class="btn sm" id="pay-now">Pay ${money(o.totalAmount)} now</button></div>` : ''}
      ${o.status === 'CANCELLED' && o.refundStatus === 'PENDING' ? '<div class="alert info">A refund for this cancelled order is being processed.</div>' : ''}
      <div class="two-col" style="padding-top:.5rem">
        <div class="stack">
          <section class="card"><h2 style="font-size:1.3rem"><span class="live-dot" aria-hidden="true"></span>Tracking</h2>${tracker(o)}
            ${o.status === 'CANCELLED' ? `<div class="card" style="background:var(--coral-soft);box-shadow:none;margin-top:.5rem"><b>Cancellation reason</b><p style="margin:.3rem 0 0">${esc(o.cancellationReason || '')}</p></div>` : ''}</section>
          <section class="card"><h2 style="font-size:1.3rem">Items</h2>${o.items.map((i) => `<div class="line" style="grid-template-columns:72px 1fr auto"><a href="/product.html?id=${esc(i.product)}">${img(i.image, i.name, '" style="width:72px;height:72px')}</a><div class="meta"><a href="/product.html?id=${esc(i.product)}">${esc(i.name)}</a><div class="muted small">${money(i.unitPrice)} × ${i.quantity}</div></div><b>${money(i.lineTotal)}</b></div>`).join('')}</section>
        </div>
        <aside class="stack">
          <section class="card"><h2 style="font-size:1.3rem">Summary</h2>
            <div class="sum-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
            ${o.discount ? `<div class="sum-row save"><span>Discount</span><span>−${money(o.discount)}</span></div>` : ''}
            <div class="sum-row"><span>Delivery</span><span>${o.deliveryCharge ? money(o.deliveryCharge) : 'Free'}</span></div>
            <div class="sum-row total"><span>Total</span><span>${money(o.totalAmount)}</span></div>
            <p class="small muted" style="margin:.8rem 0 0">${o.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online payment'}${o.payment && o.payment.paidAt ? ` · paid ${fmtDate(o.payment.paidAt)}` : ''}</p></section>
          <section class="card"><h2 style="font-size:1.3rem">Delivering to</h2><p style="margin:0">${esc(a.fullName)}<br>${esc(a.address)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}<br><span class="muted">${esc(a.phone)}</span></p></section>
          ${canCancel ? '<button class="btn danger block" id="cancel-open">Cancel order</button>' : o.status !== 'CANCELLED' && o.status !== 'DELIVERED' ? '<p class="small muted">This order has been packed or dispatched, so it can no longer be cancelled.</p>' : ''}
        </aside></div>`;
    const co = $('#cancel-open'); if (co) co.addEventListener('click', () => $('#cancel-dlg').showModal());
    const pn = $('#pay-now'); if (pn) pn.addEventListener('click', retryPayment);
  }

  async function load(silent) {
    try {
      order = (await api(`/api/orders/${encodeURIComponent(id)}`)).order;
      render();
    } catch (err) {
      if (!silent) root.innerHTML = `<div class="empty"><h2>${err.status === 404 ? 'Order not found' : 'Could not load this order'}</h2><p class="muted">${esc(err.message)}</p><a class="btn" href="/orders.html">Back to my orders</a></div>`;
    }
  }

  async function retryPayment(e) {
    setBusy(e.target, true, 'Opening…');
    try {
      const { payment, order: o } = await api(`/api/orders/${order._id}/retry-payment`, { method: 'POST' });
      await new Promise((resolve, reject) => { if (window.Razorpay) return resolve(); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the payment window.')); document.body.appendChild(s); });
      const rzp = new window.Razorpay({
        key: payment.keyId, amount: payment.amount, currency: payment.currency, name: payment.name, order_id: payment.gatewayOrderId, description: `Order ${o.orderId}`,
        prefill: { name: o.shippingAddress.fullName, email: o.customer.email, contact: o.customer.phone }, theme: { color: '#17402f' },
        handler: async (resp) => { try { await api(`/api/orders/${o._id}/verify-payment`, { method: 'POST', body: resp }); toast('Payment received. Thank you!', 'success'); } catch (err) { toast(err.message, 'error'); } load(true); },
      });
      rzp.open();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(e.target, false);
  }

  // cancellation dialog
  const sel = $('#reason-select');
  sel.addEventListener('change', () => { $('#other-wrap').hidden = sel.value !== 'other'; });
  $('#cancel-close').addEventListener('click', (e) => { e.preventDefault(); $('#cancel-dlg').close(); });
  $('#cancel-confirm').addEventListener('click', async (e) => {
    const reason = sel.value === 'other' ? $('#reason').value.trim() : sel.value;
    if (reason.length < 3) { toast('Please enter a reason.', 'error'); return; }
    setBusy(e.target, true, 'Cancelling…');
    try {
      const r = await api(`/api/orders/${order._id}/cancel`, { method: 'PUT', body: { reason } });
      order = r.order; $('#cancel-dlg').close(); render(); toast('Your order has been cancelled.', 'success');
    } catch (err) { toast(err.message, 'error'); load(true); $('#cancel-dlg').close(); }
    setBusy(e.target, false);
  });

  // Realtime: the admin changes a status and this page updates itself.
  window.addEventListener('order:updated', (e) => { if (order && (e.detail._id === order._id || e.detail.orderId === order.orderId)) load(true); });
  load();
})();
