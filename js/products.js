(function () {
  const { api, esc, productCard, bindAddButtons, init, $, qs, toast } = App;
  init('products');
  const state = { q: qs('q') || '', category: qs('category') || 'all', sort: qs('sort') || 'newest', min: qs('min') || '', max: qs('max') || '', inStock: qs('inStock') === 'true', page: Number(qs('page')) || 1 };
  const known = {};
  bindAddButtons(document, (id) => known[id]);

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.sort !== 'newest') p.set('sort', state.sort);
    if (state.min) p.set('min', state.min);
    if (state.max) p.set('max', state.max);
    if (state.inStock) p.set('inStock', 'true');
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', `${location.pathname}${p.toString() ? '?' + p : ''}`);
  }

  async function loadCategories() {
    try {
      const { categories } = await api('/api/products/categories', { auth: false });
      const total = categories.reduce((a, c) => a + c.count, 0);
      const row = (name, label, n) => `<button class="opt ${state.category === name ? 'on' : ''}" data-cat="${esc(name)}"><span>${esc(label)}</span><span>${n}</span></button>`;
      $('#cat-list').innerHTML = row('all', 'All products', total) + categories.map((c) => row(c.name, c.name, c.count)).join('');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function load() {
    const grid = $('#grid');
    grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    const p = new URLSearchParams({ sort: state.sort, page: state.page, limit: 12 });
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.min) p.set('minPrice', state.min);
    if (state.max) p.set('maxPrice', state.max);
    if (state.inStock) p.set('inStock', 'true');
    try {
      const data = await api(`/api/products?${p}`, { auth: false });
      data.products.forEach((x) => (known[x._id] = x));
      $('#shop-title').textContent = state.q ? `Results for “${state.q}”` : state.category === 'all' ? 'All products' : state.category;
      $('#shop-count').textContent = `${data.total} product${data.total === 1 ? '' : 's'}`;
      grid.innerHTML = data.products.length ? data.products.map(productCard).join('') : '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches yet</h3><p class="muted">Try a different search or clear the filters.</p><button class="btn" id="empty-reset">Clear filters</button></div>';
      const er = $('#empty-reset'); if (er) er.addEventListener('click', reset);
      const pg = $('#pager');
      pg.innerHTML = data.pages > 1 ? Array.from({ length: data.pages }, (_, i) => `<button class="${i + 1 === data.page ? 'on' : ''}" data-page="${i + 1}" aria-label="Page ${i + 1}">${i + 1}</button>`).join('') : '';
      syncUrl();
    } catch (err) {
      grid.innerHTML = `<div class="alert" style="grid-column:1/-1">${esc(err.message)}</div>`;
    }
  }

  function reset() { Object.assign(state, { q: '', category: 'all', sort: 'newest', min: '', max: '', inStock: false, page: 1 }); fill(); loadCategories(); load(); }
  function fill() { $('#sort').value = state.sort; $('#min').value = state.min; $('#max').value = state.max; $('#instock').checked = state.inStock; }

  $('#cat-list').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; state.category = b.dataset.cat; state.page = 1; loadCategories(); load(); });
  $('#pager').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (!b) return; state.page = Number(b.dataset.page); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; load(); });
  $('#apply').addEventListener('click', () => { state.min = $('#min').value; state.max = $('#max').value; state.inStock = $('#instock').checked; state.page = 1; load(); });
  $('#reset').addEventListener('click', reset);
  fill(); loadCategories(); load();
})();
