(async function () {
  const { api, Cart, Auth, esc, money, img, init, $, toast, setBusy, showFieldErrors, getConfig, requireLogin, unitPrice } = App;
  init('cart');
  if (!requireLogin()) return;

  const form = $('#checkout-form');
  const summaryEl = $('#summary');
  let cart;

  const user = (await App.refreshUser()) || Auth.user || {};
  Object.entries({ fullName: user.name, phone: user.phone, email: user.email, address: user.address, city: user.city, state: user.state, pincode: user.pincode })
    .forEach(([k, val]) => { if (form.elements[k] && val) form.elements[k].value = val; });

  const cfg = await getConfig();
  if (!cfg.onlinePaymentEnabled) {
    $('#online-opt').classList.add('disabled');
    $('#online-opt input').disabled = true;
    $('#online-note').textContent = 'Online payment is not enabled on this store yet. Cash on Delivery is available.';
  }

  function renderSummary() {
    const s = cart.summary;
    summaryEl.innerHTML = `<h2 style="font-size:1.3rem">Your order</h2>
      ${cart.items.map((i) => `<div class="row" style="flex-wrap:nowrap;margin-bottom:.7rem">${img(i.product.images[0], i.product.name, '" style="width:52px;height:52px;border-radius:10px;object-fit:cover')}<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:.92rem">${esc(i.product.name)}</div><div class="muted small">Qty ${i.quantity}${i.lineProblem ? ` · <span style="color:var(--coral)">${esc(i.lineProblem)}</span>` : ''}</div></div><b>${money(unitPrice(i.product) * i.quantity)}</b></div>`).join('')}
      <div class="sum-row"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
      ${s.discount ? `<div class="sum-row save"><span>Discount</span><span>−${money(s.discount)}</span></div>` : ''}
      <div class="sum-row"><span>Delivery</span><span>${s.deliveryCharge ? money(s.deliveryCharge) : 'Free'}</span></div>
      <div class="sum-row total"><span>Total</span><span>${money(s.total)}</span></div>
      <button class="btn block" id="place" type="submit" form="checkout-form" style="margin-top:1rem">Place order</button>
      <p class="small muted center" style="margin:.8rem 0 0">Stock is re-checked when you place the order.</p>`;
  }

  async function loadCart() {
    cart = await Cart.load();
    if (!cart.items.length) { location.replace('/cart.html'); return false; }
    renderSummary();
    return true;
  }
  try { if (!(await loadCart())) return; } catch (err) { summaryEl.innerHTML = `<div class="alert">${esc(err.message)}</div>`; return; }

  function loadRazorpay() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve();
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the payment window. Check your connection and retry from My orders.'));
      document.body.appendChild(s);
    });
  }

  async function payOnline(order, pay) {
    await loadRazorpay();
    return new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: pay.keyId, amount: pay.amount, currency: pay.currency, name: pay.name, description: `Order ${order.orderId}`, order_id: pay.gatewayOrderId,
        prefill: { name: order.shippingAddress.fullName, email: order.customer.email, contact: order.customer.phone },
        theme: { color: '#17402f' },
        handler: async (resp) => {
          try { await api(`/api/orders/${order._id}/verify-payment`, { method: 'POST', body: resp }); resolve({ paid: true }); }
          catch (err) { resolve({ paid: false, message: err.message }); }
        },
        modal: { ondismiss: () => resolve({ paid: false, message: 'Payment was not completed. Your order is saved; you can pay again from the order page.' }) },
      });
      rzp.on('payment.failed', async () => { try { await api(`/api/orders/${order._id}/payment-failed`, { method: 'POST' }); } catch (e) { /* noop */ } });
      rzp.open();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#place');
    $('#form-alert').innerHTML = '';
    const body = Object.fromEntries(new FormData(form));
    const local = {};
    if (!body.fullName.trim()) local.fullName = 'Enter the recipient\'s full name.';
    if (!/^\+?\d{10,13}$/.test(body.phone.replace(/[\s-]/g, ''))) local.phone = 'Enter a valid phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) local.email = 'Enter a valid email address.';
    if (body.address.trim().length < 5) local.address = 'Enter the full delivery address.';
    if (!body.city.trim()) local.city = 'Enter the city.';
    if (!body.state.trim()) local.state = 'Enter the state.';
    if (!/^\d{6}$/.test(body.pincode)) local.pincode = 'Enter a valid 6-digit pincode.';
    showFieldErrors(form, local);
    if (Object.keys(local).length) { form.elements[Object.keys(local)[0]].focus(); return; }

    setBusy(btn, true, 'Placing order…');
    try {
      const { order, payment } = await api('/api/orders', { method: 'POST', body });
      Cart.load().catch(() => {});
      if (payment) {
        const result = await payOnline(order, payment).catch((err) => ({ paid: false, message: err.message }));
        if (!result.paid) sessionStorage.setItem('grove_flash', result.message);
      }
      location.href = `/order-details.html?id=${encodeURIComponent(order.orderId)}&placed=1`;
    } catch (err) {
      showFieldErrors(form, err.errors && !err.errors.stock ? err.errors : {});
      $('#form-alert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (err.status === 409) { try { await loadCart(); } catch (x) { /* ignore */ } }
      setBusy(btn, false);
    }
  });
})();
