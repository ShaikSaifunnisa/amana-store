(async function () {
  const { api, esc, money, stars, img, Cart, Auth, toast, init, $, $$, qs, fmtDate, setBusy, unitPrice } = App;
  init('products');
  const root = $('#detail');
  const id = qs('id');
  if (!id) { root.innerHTML = '<div class="empty" style="margin:2rem 0"><h2>No product selected</h2><a class="btn" href="/products.html">Browse the shop</a></div>'; return; }

  let product;
  try { product = (await api(`/api/products/${encodeURIComponent(id)}`, { auth: false })).product; }
  catch (err) { root.innerHTML = `<div class="empty" style="margin:2rem 0"><h2>${esc(err.status === 404 ? 'This product is not available' : 'Could not load product')}</h2><p class="muted">${esc(err.message)}</p><a class="btn" href="/products.html">Back to the shop</a></div>`; return; }

  document.title = `${product.name} · Grove Store`;
  const price = unitPrice(product);
  const pct = price < product.price ? Math.round((1 - price / product.price) * 100) : 0;
  const stockLine = product.stock < 1 ? '<span class="stock-out">Out of stock</span>' : product.stock <= 5 ? `<span class="stock-low">Only ${product.stock} left</span>` : '<span class="stock-ok">In stock</span>';
  let qty = 1;

  root.innerHTML = `<div class="pd">
    <div class="gallery"><div class="main" id="main-img">${img(product.images[0], product.name)}</div>
      <div class="thumbs">${product.images.length > 1 ? product.images.map((u, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}" aria-label="Image ${i + 1}">${img(u, '')}</button>`).join('') : ''}</div></div>
    <div>
      <p class="muted small" style="margin-bottom:.4rem"><a href="/products.html?category=${encodeURIComponent(product.category)}">${esc(product.category)}</a>${product.brand ? ' · ' + esc(product.brand) : ''} · ${esc(product.productId || '')}</p>
      <h1 style="font-size:clamp(1.8rem,3.5vw,2.6rem)">${esc(product.name)}</h1>
      ${stars(product.rating, product.numReviews)}
      <div class="big-price">${money(price)} ${pct ? `<s class="muted" style="font:500 1.1rem var(--body)">${money(product.price)}</s> <span class="badge" style="background:var(--coral-soft);color:#7a2410">${pct}% off</span>` : ''}</div>
      <p>${stockLine}</p>
      <p style="white-space:pre-line">${esc(product.description)}</p>
      <div class="row" style="margin:1.5rem 0">
        <div class="qty" ${product.stock < 1 ? 'hidden' : ''}><button id="dec" aria-label="Decrease quantity">−</button><span id="qty">1</span><button id="inc" aria-label="Increase quantity">+</button></div>
        <button class="btn" id="add" ${product.stock < 1 ? 'disabled' : ''}>Add to cart</button>
        <button class="btn alt" id="buy" ${product.stock < 1 ? 'disabled' : ''}>Buy now</button>
      </div>
    </div></div>
    <section class="section" id="reviews"><h2>Customer reviews</h2><div id="review-list" class="card"><p class="muted">Loading reviews…</p></div><div id="review-form-wrap"></div></section>`;

  $$('.thumbs button', root).forEach((b) => b.addEventListener('click', () => {
    $('#main-img').innerHTML = img(product.images[Number(b.dataset.i)], product.name);
    $$('.thumbs button', root).forEach((x) => x.classList.toggle('on', x === b));
  }));
  const setQty = (n) => { qty = Math.max(1, Math.min(product.stock, n)); $('#qty').textContent = qty; };
  $('#dec').addEventListener('click', () => setQty(qty - 1));
  $('#inc').addEventListener('click', () => { if (qty >= product.stock) toast(`Only ${product.stock} available`, 'error'); setQty(qty + 1); });
  $('#add').addEventListener('click', async (e) => {
    setBusy(e.target, true, 'Adding…');
    try { await Cart.add(product, qty); toast(`${qty} × ${product.name} added to cart`, 'success'); } catch (err) { toast(err.message, 'error'); }
    setBusy(e.target, false);
  });
  $('#buy').addEventListener('click', async (e) => {
    setBusy(e.target, true, 'Please wait…');
    try { await Cart.add(product, qty); location.href = '/checkout.html'; } catch (err) { toast(err.message, 'error'); setBusy(e.target, false); }
  });

  async function loadReviews() {
    try {
      const { reviews } = await api(`/api/products/${product._id}/reviews`, { auth: false });
      $('#review-list').innerHTML = reviews.length ? reviews.map((r) => `<div class="review"><div class="row between"><b>${esc(r.userName)}</b><span class="muted small">${fmtDate(r.createdAt)}</span></div>${stars(r.rating)}<p style="margin:.3rem 0 0">${esc(r.comment)}</p></div>`).join('') : '<p class="muted" style="margin:0">No reviews yet. Reviews can be left after an order containing this product is delivered.</p>';
    } catch (err) { $('#review-list').innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  }
  loadReviews();

  if (Auth.loggedIn) {
    $('#review-form-wrap').innerHTML = `<form class="card stack" id="review-form" style="margin-top:1rem"><h3>Write a review</h3><div id="rv-alert"></div>
      <div class="field" style="max-width:200px"><label for="rating">Rating</label><select id="rating"><option value="5">5 – Excellent</option><option value="4">4 – Good</option><option value="3">3 – Okay</option><option value="2">2 – Poor</option><option value="1">1 – Bad</option></select></div>
      <div class="field"><label for="comment">Comment</label><textarea id="comment" rows="3" maxlength="1000"></textarea></div><button class="btn" type="submit">Submit review</button></form>`;
    $('#review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true, 'Saving…');
      $('#rv-alert').innerHTML = '';
      try {
        await api(`/api/products/${product._id}/reviews`, { method: 'POST', body: { rating: Number($('#rating').value), comment: $('#comment').value } });
        toast('Thanks for your review!', 'success'); $('#comment').value = ''; loadReviews();
      } catch (err) { $('#rv-alert').innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
      setBusy(btn, false);
    });
  }
})();
