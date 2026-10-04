(async function () {
  const { api, esc, money, productCard, bindAddButtons, init, getConfig, $, toast } = App;
  init('home');
  $('#hero-search').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q').trim(); location.href = `/products.html${q ? `?q=${encodeURIComponent(q)}` : ''}`; });

  const known = {};
  bindAddButtons(document, (id) => known[id]);
  const grid = (el, products) => {
    products.forEach((p) => (known[p._id] = p));
    el.innerHTML = products.length ? products.map(productCard).join('') : '<div class="empty" style="grid-column:1/-1"><h3>No products yet</h3><p class="muted">Products added by the store admin will show up here.</p></div>';
  };

  try {
    const cfg = await getConfig();
    $('#perks').innerHTML = `
      <div class="perk"><b>Free delivery over ${money(cfg.freeDeliveryAbove)}</b><span class="muted small">Otherwise a flat ${money(cfg.deliveryCharge)}.</span></div>
      <div class="perk"><b>Live order tracking</b><span class="muted small">Status changes appear on your screen instantly.</span></div>
      <div class="perk"><b>Cancel while it is early</b><span class="muted small">Cancel before packing, stock and refund handled for you.</span></div>`;
    const [cats, top, fresh] = await Promise.all([
      api('/api/products/categories', { auth: false }),
      api('/api/products?sort=rating&limit=4', { auth: false }),
      api('/api/products?sort=newest&limit=8', { auth: false }),
    ]);
    $('#hero-chips').innerHTML = cats.categories.map((c) => `<a class="chip" href="/products.html?category=${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join('');
    grid($('#top-grid'), top.products);
    grid($('#new-grid'), fresh.products);
    $('#mosaic').innerHTML = top.products.slice(0, 3).map((p) => `<a href="/product.html?id=${esc(p._id)}">${App.img(p.images[0], p.name)}<span>${esc(p.name)}</span></a>`).join('');
    if (!top.products.length) $('#mosaic').style.display = 'none';
  } catch (err) {
    toast(err.message, 'error');
    $('#top-grid').innerHTML = `<div class="alert" style="grid-column:1/-1">${esc(err.message)}</div>`;
  }
})();
