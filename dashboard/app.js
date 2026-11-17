/* Local data only. The model and farm plans come from ../data.js; the page never regenerates plans. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows) || !Array.isArray(DATA.live)) {
    $('row-count').textContent = 'Snapshot unavailable. Open the generated dashboard beside its data.js file.';
    $('board').setAttribute('aria-busy', 'false');
    return;
  }

  const state = { q: '', category: '', chain: '', minTvl: 0, watch: false, sort: 'rank', dir: 1, tab: 'board', selected: null };
  const headers = Array.from(document.querySelectorAll('[data-sort]'));
  const rowIndex = new Map(DATA.rows.map(row => [row.slug, row]));
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let detailOrigin = null;

  function node(tag, attrs, ...children) {
    const element = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (key === 'text') element.textContent = value;
      else if (key === 'class') element.className = value;
      else element.setAttribute(key, String(value));
    });
    children.flat().forEach(child => { if (child !== null && child !== undefined) element.append(child); });
    return element;
  }
  const categoryOf = row => row.category || 'Other';
  function money(value, compact = true) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    if (compact) {
      if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
      if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
      if (Math.abs(value) >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
    }
    return usd.format(value);
  }
  const percent = value => value === null || value === undefined ? '—' : (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  const growthClass = value => value === null || value === undefined ? 'muted' : value >= 0 ? 'positive' : 'negative';
  const ageLabel = days => days === null ? 'Unknown' : days >= 365 ? (days / 365).toFixed(1) + 'y' : days + 'd';
  const multiplier = value => value.toFixed(4) + '×';
  const watchBadge = () => node('span', { class: 'badge', text: 'WATCHLIST' });

  function chainCell(row) {
    const chains = row.chains || [];
    return node('td', { class: 'chain-list', title: chains.join(', ') || 'No chain recorded' },
      chains.slice(0, 2).join(', ') || 'Unknown',
      chains.length > 2 ? node('span', { class: 'chain-more', text: '+' + (chains.length - 2) }) : null);
  }
  function moneyCell(value, extra) {
    return node('td', { class: 'numeric num' + (extra ? ' ' + extra : ''), text: money(value), title: money(value, false) });
  }
  function fillOptions(id, values) {
    const fragment = document.createDocumentFragment();
    Array.from(new Set(values)).sort().forEach(value => fragment.append(node('option', { value, text: value })));
    $(id).append(fragment);
  }

  function readHash() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.chain = params.get('chain') || '';
    state.minTvl = Math.max(0, Number(params.get('minTvl')) || 0);
    state.watch = params.get('watch') === '1';
    state.tab = params.get('view') === 'live' ? 'live' : 'board';
    state.sort = headers.some(button => button.dataset.sort === params.get('sort')) ? params.get('sort') : 'rank';
    state.dir = params.get('dir') === 'desc' ? -1 : 1;
    state.selected = rowIndex.has(params.get('p')) ? params.get('p') : null;
    if (state.selected) state.tab = 'board';
  }
  function saveHash() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.chain) params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.watch) params.set('watch', '1');
    if (state.tab === 'live') params.set('view', 'live');
    if (state.sort !== 'rank') params.set('sort', state.sort);
    if (state.dir === -1) params.set('dir', 'desc');
    if (state.selected) params.set('p', state.selected);
    // Some file:// hosts restrict history changes. The page works even without persisted filters.
    try { window.history.replaceState(null, '', '#' + params.toString()); } catch (_) { /* Optional navigation state. */ }
  }
  function syncControls() {
    $('search').value = state.q;
    $('category').value = state.category;
    $('chain').value = state.chain;
    if (!$('category').value) state.category = '';
    if (!$('chain').value) state.chain = '';
    $('min-tvl').value = String(state.minTvl);
    if (!$('min-tvl').value) { state.minTvl = 0; $('min-tvl').value = '0'; }
    $('watchlist-only').checked = state.watch;
  }
  function sortValue(row) {
    if (state.sort === 'chains') return row.chains.join(', ').toLowerCase();
    if (state.sort === 'name') return row.name.toLowerCase();
    if (state.sort === 'watchlist') return row.watchlist ? 1 : 0;
    return row[state.sort];
  }
  function filteredRows() {
    const query = state.q.trim().toLowerCase();
    return DATA.rows.filter(row => {
      const text = [row.name, row.slug, categoryOf(row), ...row.chains].join(' ').toLowerCase();
      return (!query || text.includes(query)) && (!state.category || categoryOf(row) === state.category)
        && (!state.chain || row.chains.includes(state.chain)) && (!state.watch || row.watchlist)
        && row.tvl_usd >= state.minTvl;
    }).sort((a, b) => {
      const av = sortValue(a), bv = sortValue(b);
      // Missing figures stay last in either direction; equal figures retain original model rank.
      if (av === null || av === undefined) return bv === null || bv === undefined ? a.rank - b.rank : 1;
      if (bv === null || bv === undefined) return -1;
      const comparison = av < bv ? -1 : av > bv ? 1 : 0;
      return comparison * state.dir || a.rank - b.rank;
    });
  }
  function renderBoard() {
    const rows = filteredRows();
    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = node('tr', { 'data-slug': row.slug, tabindex: '0' },
        node('td', { class: 'rank num', text: String(row.rank).padStart(3, '0') }),
        node('td', { class: 'protocol' }, node('button', { type: 'button', class: 'protocol-button', 'aria-label': 'Open ' + row.name + ' details and farm plan', text: row.name }), node('span', { class: 'category-label', text: categoryOf(row) })),
        chainCell(row), moneyCell(row.tvl_usd),
        node('td', { class: 'numeric num ' + growthClass(row.change_7d), text: percent(row.change_7d) }),
        node('td', { class: 'numeric num', text: ageLabel(row.age_days), title: row.age_days === null ? 'Unknown; model uses 365 days' : row.age_days + ' days since listing' }),
        moneyCell(row.implied_value_usd, 'implied'), moneyCell(row.expected_airdrop_usd, 'airdrop'),
        node('td', null, row.watchlist ? watchBadge() : node('span', { class: 'muted', text: '—' })));
      fragment.append(tr);
    });
    $('board-rows').replaceChildren(fragment);
    $('empty-state').hidden = rows.length !== 0;
    $('row-count').textContent = rows.length + ' of ' + DATA.board_size + ' protocols shown · ' + rows.filter(row => row.watchlist).length + ' watchlist';
    headers.forEach(button => {
      const active = button.dataset.sort === state.sort;
      if (active) button.parentElement.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      else button.parentElement.removeAttribute('aria-sort');
      button.querySelector('.sort-icon').textContent = active ? (state.dir === 1 ? '↑' : '↓') : '↕';
    });
  }
  function renderLive() {
    const fragment = document.createDocumentFragment();
    DATA.live.forEach(row => fragment.append(node('tr', { 'data-live-slug': row.slug },
      node('td', { class: 'protocol' }, node('strong', { text: row.name })),
      node('td', { class: 'muted', text: categoryOf(row) }), chainCell(row),
      moneyCell(row.tvl_usd), moneyCell(row.mcap_usd),
      node('td', { class: 'numeric num ' + growthClass(row.change_7d), text: percent(row.change_7d) }))));
    $('live-rows').replaceChildren(fragment);
  }
  function setView(tab, persist = true) {
    state.tab = tab;
    const live = tab === 'live';
    $('board-view').hidden = live;
    $('live-view').hidden = !live;
    $('model-link').hidden = live;
    $('board-tab').setAttribute('aria-selected', String(!live));
    $('live-tab').setAttribute('aria-selected', String(live));
    $('board-tab').tabIndex = live ? -1 : 0;
    $('live-tab').tabIndex = live ? 0 : -1;
    if (persist) saveHash();
  }
  function resetFilters() {
    state.q = ''; state.category = ''; state.chain = ''; state.minTvl = 0; state.watch = false;
    syncControls(); renderBoard(); saveHash();
  }
  function fact(label, value, className, wide) {
    return node('div', { class: wide ? 'wide' : '' }, node('dt', { text: label }), node('dd', { text: value, class: className || '' }));
  }
  function breakdown(label, value, note, result) {
    return node('div', { class: result ? 'result' : '' }, node('dt', null, label, note ? node('small', { text: note }) : null), node('dd', { text: value }));
  }
  function farmStep(text) {
    // Split only the trailing model-generated metadata, retaining the exact action and cost/time text.
    const match = /^(.*) Cost: (.*)\. Time: (.*)\.$/.exec(text);
    if (!match) return node('li', null, node('div', { class: 'step-action', text }));
    return node('li', null, node('div', null,
      node('p', { class: 'step-action', text: match[1] }),
      node('div', { class: 'step-meta' }, node('span', null, node('b', { text: 'Cost: ' }), match[2] + '.'), node('span', null, node('b', { text: 'Time: ' }), match[3] + '.'))));
  }
  function closeDetail() {
    state.selected = null;
    if (typeof $('detail').close === 'function') $('detail').close();
    else { $('detail').removeAttribute('open'); afterClose(); }
    saveHash();
  }
  function afterClose() {
    state.selected = null;
    saveHash();
    if (detailOrigin && detailOrigin.isConnected) detailOrigin.focus({ preventScroll: true });
    detailOrigin = null;
  }
  function openDetail(slug, origin) {
    const row = rowIndex.get(slug);
    if (!row) return;
    detailOrigin = origin || document.activeElement;
    state.selected = slug;
    const peers = row.category_peers ? row.category_peers + ' tokenized peers in ' + categoryOf(row) : 'Global median · ' + DATA.global_peers + ' tokenized peers';
    const probability = Math.round(row.launch_probability * 100) + '%';
    const close = node('button', { type: 'button', class: 'button', id: 'detail-close', text: 'Close', 'aria-label': 'Close protocol details' });
    close.addEventListener('click', closeDetail);
    $('detail-content').replaceChildren(
      node('header', { class: 'detail-head' }, node('div', null,
        node('span', { class: 'eyebrow', text: 'PRE-TOKEN / RANK ' + row.rank + ' OF ' + DATA.board_size }), row.watchlist ? watchBadge() : null,
        node('h2', { id: 'detail-title', text: row.name }), node('p', { text: categoryOf(row) + ' · ' + (row.chains.join(', ') || 'Unknown chain') })), close),
      node('section', { class: 'detail-section' }, node('h3', { text: 'Protocol facts' }),
        node('dl', { class: 'panel facts' },
          fact('TVL', money(row.tvl_usd, false), 'num'), fact('7d change', percent(row.change_7d), 'num ' + growthClass(row.change_7d)),
          fact('Age since listing', row.age_days === null ? 'Unknown (model: 365 days)' : row.age_days + ' days', 'num'),
          fact('First listed', row.listed_at || 'Unknown', 'num'), fact('Snapshot as of', DATA.as_of, 'num'), fact('Category', categoryOf(row)),
          fact('Slug', row.slug, 'num'), fact('Token status', 'Pre-token'), fact('Watchlist', row.watchlist ? 'Included' : 'Outside watchlist'),
          fact('Reported market cap', money(row.mcap_usd, false), 'num'), fact('CoinGecko ID', row.gecko_id || 'None reported'), fact('Symbol', row.symbol || 'None reported'),
          fact('All chains', row.chains.join(', ') || 'None recorded', '', true))),
      node('section', { class: 'detail-section' }, node('h3', { text: 'Implied FDV · model breakdown' }),
        node('div', { class: 'panel' }, node('dl', { class: 'breakdown' },
          breakdown('TVL', money(row.tvl_usd, false), 'Snapshot total value locked'),
          breakdown('× Category multiple', multiplier(row.category_multiple), peers),
          breakdown('× Growth multiplier', multiplier(row.growth_multiplier), '7d ' + percent(row.change_7d) + ' · clamp −60%…+120%, weight 0.5'),
          breakdown('× Maturity multiplier', multiplier(row.maturity_multiplier), '0.6 + min(age, 1,095) / 1,095 × 0.4; unknown age = 365'),
          breakdown('= Implied FDV', money(row.implied_value_usd, false), 'Rounded once, minimum $1', true)),
          node('p', { class: 'detail-equation', text: money(row.tvl_usd, false) + ' × ' + row.category_multiple.toFixed(4) + ' × ' + row.growth_multiplier.toFixed(4) + ' × ' + row.maturity_multiplier.toFixed(4) + ' ≈ ' + money(row.implied_value_usd, false) + '. Display factors rounded to 4 decimals; the model uses full precision.' }))),
      node('section', { class: 'detail-section' }, node('h3', { text: 'Launch probability & expected airdrop' }),
        node('div', { class: 'reward-grid' }, node('div', { class: 'panel reward' }, node('span', { text: 'Heuristic launch probability' }), node('strong', { text: probability })),
          node('div', { class: 'panel reward' }, node('span', { text: 'Expected airdrop · allocation proxy' }), node('strong', { title: money(row.expected_airdrop_usd, false), text: money(row.expected_airdrop_usd) }))),
        node('p', { class: 'detail-equation', text: 'round(' + money(row.implied_value_usd, false) + ' × 7.5% × ' + probability + ') = ' + money(row.expected_airdrop_usd, false) }),
        node('p', { text: 'Start at 25%; age ≥730 adds 25 points, else ≥365 adds 15. Growth ≥20% adds 15 points, else ≥0% adds 5; growth ≤−20% subtracts 15. Clamp to 5%…90%; unknown age uses 365 and unknown growth uses 0%.' }),
        node('p', { text: 'Typical-farmer proxy assuming a 7.5% community allocation spread across early users. No user count is supplied, so the proxy is undivided and is not an individual payout estimate. Actual shares depend on eligibility and the number of users.' })),
      node('section', { class: 'detail-section' }, node('h3', { text: 'Farm plan · ' + row.farm_steps.length + ' steps' }),
        node('p', { text: 'The same plan carried by the ranked board. Gas is estimated per action on the first recorded chain; product fees and settlement times vary. Confirm supported actions and reward rules on the protocol\'s own pages.' }),
        node('ol', { class: 'steps' }, row.farm_steps.map(farmStep)))
    );
    $('detail').scrollTop = 0;
    if (!$('detail').open) {
      if (typeof $('detail').showModal === 'function') $('detail').showModal();
      else $('detail').setAttribute('open', '');
    }
    close.focus({ preventScroll: true });
    saveHash();
  }

  $('as-of').textContent = DATA.as_of;
  $('as-of').setAttribute('datetime', DATA.as_of);
  $('version').textContent = DATA.model_version;
  $('ranked-count').textContent = DATA.board_size;
  $('universe-count').textContent = 'Of ' + DATA.protocol_count + ' snapshot protocols';
  $('watch-count').textContent = DATA.watchlist_covered + '/' + DATA.watchlist_size;
  $('floor-label').textContent = money(DATA.floor_usd) + ' watchlist floor';
  $('live-count').textContent = DATA.live_size;
  $('board-tab-count').textContent = DATA.board_size;
  $('live-tab-count').textContent = DATA.live_size;
  $('calibration-note').textContent = 'Global median: ' + multiplier(DATA.global_multiple) + ' / ' + DATA.global_peers + ' snapshot peers';
  $('source').textContent = DATA.source;
  fillOptions('category', DATA.rows.map(categoryOf));
  fillOptions('chain', DATA.rows.flatMap(row => row.chains));
  readHash(); syncControls(); renderBoard(); renderLive(); setView(state.tab, false);
  $('board').setAttribute('aria-busy', 'false');

  $('filters').addEventListener('submit', event => event.preventDefault());
  $('search').addEventListener('input', () => { state.q = $('search').value; renderBoard(); saveHash(); });
  ['category', 'chain', 'min-tvl', 'watchlist-only'].forEach(id => $(id).addEventListener('change', () => {
    state.category = $('category').value; state.chain = $('chain').value;
    state.minTvl = Number($('min-tvl').value); state.watch = $('watchlist-only').checked;
    renderBoard(); saveHash();
  }));
  $('reset-filters').addEventListener('click', resetFilters);
  $('empty-reset').addEventListener('click', resetFilters);
  headers.forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.sort;
    if (state.sort === key) state.dir *= -1;
    else { state.sort = key; state.dir = ['rank', 'name', 'chains'].includes(key) ? 1 : -1; }
    renderBoard(); saveHash();
  }));
  $('board-rows').addEventListener('click', event => {
    const row = event.target.closest('tr[data-slug]');
    if (row) openDetail(row.dataset.slug, row.querySelector('button'));
  });
  $('board-rows').addEventListener('keydown', event => {
    if (event.target.tagName === 'TR' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetail(event.target.dataset.slug, event.target); }
  });
  ['board', 'live'].forEach(tab => $(tab + '-tab').addEventListener('click', () => setView(tab)));
  document.querySelector('.tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === 'Home' ? 'board' : event.key === 'End' ? 'live' : state.tab === 'board' ? 'live' : 'board';
    setView(tab); $(tab + '-tab').focus();
  });
  $('model-link').addEventListener('click', event => { event.preventDefault(); $('model-explainer').open = true; $('model-explainer').scrollIntoView({ behavior: 'auto', block: 'start' }); });
  $('detail').addEventListener('close', afterClose);
  $('detail').addEventListener('click', event => { if (event.target === $('detail') && event.clientX < $('detail').getBoundingClientRect().left) closeDetail(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && $('detail').open && typeof $('detail').showModal !== 'function') closeDetail(); });
  window.addEventListener('hashchange', () => {
    readHash(); syncControls(); renderBoard(); setView(state.tab, false);
    if (state.selected) openDetail(state.selected);
    else if ($('detail').open) closeDetail();
  });
  if (state.selected) openDetail(state.selected);
})();
