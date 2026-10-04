(function () {
  const { Cart, esc, money, img, init, $, $$, toast, Auth, unitPrice } = App;
  init('cart');
  const root = $('#cart-root');

  function render({ items, summary }) {
    if (!items.length) {
      root.innerHTML = '<div class="empty"><h2>Your cart is empty</h2><p class="muted">Add something you like and it will wait for you here, even after a refresh.</p><a class="btn" href="/products.html">Start shopping</a></div>';
      return;
    }
    const s = summary;
    const remaining = Math.max(0, s.freeDeliveryAbove - (s.subtotal - s.discount));
    root.innerHTML = `<div class="two-col">
      <div class="card">${items.map((i) => {
        const p = i.product; const pr = unitPrice(p);
        return `<div class="line" data-id="${esc(p._id)}">
          <a href="/product.html?id=${esc(p._id)}">${img(p.images[0], p.name)}</a>
          <div class="meta"><a href="/product.html?id=${esc(p._id)}">${esc(p.name)}</a>
            <div class="muted small">${money(pr)} each${pr < p.price ? ` <s>${money(p.price)}</s>` : ''}</div>
            ${i.lineProblem ? `<div class="problem">${esc(i.lineProblem)}</div>` : ''}
            <div class="row" style="margin-top:.5rem"><div class="qty"><button data-act="dec" aria-label="Decrease quantity">−</button><span>${i.quantity}</span><button data-act="inc" aria-label="Increase quantity">+</button></div>
            <button class="btn ghost sm" data-act="rm">Remove</button></div></div>
          <b>${money(pr * i.quantity)}</b></div>`; }).join('')}</div>
      <aside class="card" style="position:sticky;top:5.5rem"><h2 style="font-size:1.3rem">Order summary</h2>
        <div class="sum-row"><span>Subtotal (${s.itemCount} item${s.itemCount === 1 ? '' : 's'})</span><span>${money(s.subtotal)}</span></div>
        ${s.discount ? `<div class="sum-row save"><span>Discount</span><span>−${money(s.discount)}</span></div>` : ''}
        <div class="sum-row"><span>Delivery</span><span>${s.deliveryCharge ? money(s.deliveryCharge) : 'Free'}</span></div>
        <div class="sum-row total"><span>Total</span><span>${money(s.total)}</span></div>
        ${s.deliveryCharge && remaining ? `<p class="small muted" style="margin-top:.8rem">Add ${money(remaining)} more for free delivery.</p>` : ''}
        <button class="btn block" id="checkout" style="margin-top:1rem" ${s.itemCount ? '' : 'disabled'}>Proceed to checkout</button></aside></div>`;
  }

  async function run(fn) {
    try { render(await fn()); } catch (err) { toast(err.message, 'error'); try { render(await Cart.load()); } catch (e) { /* ignore */ } }
  }

  root.addEventListener('click', (e) => {
    const co = e.target.closest('#checkout');
    if (co) { location.href = Auth.loggedIn ? '/checkout.html' : '/login.html?next=/checkout.html'; return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.line');
    const id = row.dataset.id;
    const qty = Number($('.qty span', row).textContent);
    if (btn.dataset.act === 'inc') run(() => Cart.setQty(id, qty + 1));
    if (btn.dataset.act === 'dec') run(() => Cart.setQty(id, qty - 1));
    if (btn.dataset.act === 'rm') run(() => Cart.remove(id));
  });

  Cart.load().then(render).catch((err) => { root.innerHTML = `<div class="alert">${esc(err.message)}</div>`; });
})();
