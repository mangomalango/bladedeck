'use strict';
/* Storage map: a visual map and ranked breakdown of what takes space on this PC,
   from most to least space:
     - Steam games, PC ports, emulated ROMs, native games, media/clips, and caches.
     - Interactive proportional map bar and category filters.
     - Quick actions to play, reveal in folder, share, or clean up space.
   Uses S, api, esc, toast, openModal, closeModal, Sound, PadNav, Transfer, launch and $ at call time. */

const StorageMap = (() => {
  let cacheData = null;
  let curFilter = 'all';
  let curSort = 'desc'; // 'desc' (largest first) or 'asc' (smallest first)

  const FILTERS = [
    ['all', 'All'],
    ['steam', 'Steam'],
    ['recomp', 'PC Ports'],
    ['rom', 'Emulation'],
    ['pc', 'Other PC'],
    ['media', 'Clips & Media'],
    ['cache', 'Cache & Downloads']
  ];

  async function open() {
    openModal({
      title: 'Storage map', wide: true,
      html: '<div class="sm-wrap"><div class="sm-loading"><p class="note">Mapping storage space across games, media and caches…</p></div></div>',
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => {
        root.__lbrb = (dir) => {
          const keys = FILTERS.map((f) => f[0]);
          const idx = keys.indexOf(curFilter);
          const next = dir === 'rb' ? (idx + 1) % keys.length : (idx - 1 + keys.length) % keys.length;
          curFilter = keys[next];
          render();
        };
      }
    });

    try {
      const res = await api.storageMap(S.lib?.entries || []);
      if (!res || !res.ok) {
        const root = $('#modal');
        if (root) $('.sm-wrap', root).innerHTML = '<p class="note">Could not read storage information.</p>';
        return;
      }
      cacheData = res;
      render();
    } catch (err) {
      const root = $('#modal');
      if (root) $('.sm-wrap', root).innerHTML = `<p class="note">Error reading storage: ${esc(err.message || err)}</p>`;
    }
  }

  function filterItems(items) {
    if (curFilter === 'all') return items;
    if (curFilter === 'cache') return items.filter((x) => x.category === 'cache' || x.category === 'downloads');
    return items.filter((x) => x.category === curFilter);
  }

  function render() {
    const root = $('#modal');
    if (!root || !cacheData) return;
    const body = $('.sm-wrap', root);
    if (!body) return;

    const { drives = [], categories = {}, totalAccounted = 0, formattedTotal = '0 B', items = [] } = cacheData;
    const filtered = filterItems(items);
    if (curSort === 'asc') filtered.sort((a, b) => a.size - b.size);
    else filtered.sort((a, b) => b.size - a.size);

    const maxItem = filtered.length ? Math.max(...filtered.map((x) => x.size)) : 1;

    // Build the visual storage bar segments
    const catKeys = ['steam', 'recomp', 'rom', 'pc', 'media', 'cache', 'downloads'];
    const barSegments = catKeys.map((k) => {
      const c = categories[k];
      if (!c || c.size <= 0) return '';
      const pct = totalAccounted > 0 ? (c.size / totalAccounted) * 100 : 0;
      return `<div class="sm-bar-seg" style="width:${pct.toFixed(2)}%;background:${c.color}" title="${esc(c.label)}: ${esc(fmt(c.size))} (${pct.toFixed(1)}%)"></div>`;
    }).join('');

    // Drive status summary
    const driveInfo = drives.map((d) => `<b>${esc(d.label)}:</b> ${fmt(d.free)} free of ${fmt(d.total)}`).join(' · ');

    const html = `
      <div class="sm-head">
        <div class="sm-drives">${driveInfo || 'Storage distribution'}</div>
        <div class="sm-total-badge">Tracked space: <b>${esc(formattedTotal)}</b></div>
      </div>

      <!-- Proportional Map Bar -->
      <div class="sm-bar-box">
        <div class="sm-bar">${barSegments || '<div class="sm-bar-empty"></div>'}</div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="sm-tabs">
        ${FILTERS.map(([k, label]) => {
          let count = 0, sz = 0;
          if (k === 'all') { count = items.length; sz = totalAccounted; }
          else if (k === 'cache') {
            sz = (categories.cache?.size || 0) + (categories.downloads?.size || 0);
            count = (categories.cache?.count || 0) + (categories.downloads?.count || 0);
          } else {
            sz = categories[k]?.size || 0;
            count = categories[k]?.count || 0;
          }
          const active = k === curFilter ? 'on' : '';
          return `<button type="button" class="sm-tab ${active}" data-sm-filter="${k}">
            <b>${esc(label)}</b>
            <small>${count ? `${count} · ` : ''}${fmt(sz)}</small>
          </button>`;
        }).join('')}
      </div>

      <!-- Sort control & header -->
      <div class="sm-list-head">
        <span class="dim">Showing ${filtered.length} item${filtered.length === 1 ? '' : 's'} (${curSort === 'desc' ? 'largest to smallest' : 'smallest to largest'})</span>
        <button type="button" class="sm-sort-btn" data-sm-sort="${curSort === 'desc' ? 'asc' : 'desc'}">
          ${curSort === 'desc' ? 'Sort: Largest first ▼' : 'Sort: Smallest first ▲'}
        </button>
      </div>

      <!-- Ranked List of Items: Most to Least Space -->
      <div class="sm-list">
        ${filtered.length ? filtered.map((it, idx) => {
          const rankNum = curSort === 'desc' ? idx + 1 : filtered.length - idx;
          const isTop = curSort === 'desc' && rankNum <= 3;
          const topClass = isTop ? `top-${rankNum}` : '';
          const barPct = Math.max(3, Math.round((it.size / maxItem) * 100));
          const color = categories[it.category]?.color || '#00d2c4';
          const canPlay = it.entry && (it.entry.type === 'steam' || it.entry.type === 'rom' || it.entry.type === 'recomp' || it.entry.type === 'exe');
          const canShare = it.entry && ['rom', 'recomp'].includes(it.entry.type);

          return `<div class="sm-item" data-sm-id="${esc(it.id)}" tabindex="0">
            <div class="sm-rank ${topClass}">#${rankNum}</div>
            <div class="sm-info">
              <div class="sm-title-row">
                <span class="sm-cat-pill" style="--cat-color:${color}">${esc(it.typeLabel)}</span>
                <b class="sm-title">${esc(it.title)}</b>
              </div>
              <div class="sm-sub-row">
                <span class="dim">${esc(it.sub || it.path)}</span>
              </div>
              <div class="sm-mini-bar">
                <div class="sm-mini-fill" style="width:${barPct}%;background:${color}"></div>
              </div>
            </div>
            <div class="sm-size-box">
              <b class="sm-size">${esc(it.formatted)}</b>
              <small class="dim">${it.pct ? `${it.pct}%` : ''}</small>
            </div>
            <div class="sm-acts">
              ${canPlay ? `<button type="button" data-sm-act="play" data-id="${esc(it.id)}" title="Launch game">▶ Play</button>` : ''}
              ${canShare ? `<button type="button" data-sm-act="share" data-id="${esc(it.id)}" title="Share with phone or friend">📤 Share</button>` : ''}
              ${it.path ? `<button type="button" data-sm-act="reveal" data-path="${esc(it.path)}" title="Show in folder">📁 Show</button>` : ''}
              ${it.type === 'capture' ? `<button type="button" data-sm-act="del-cap" data-path="${esc(it.path)}" title="Delete recording">✕</button>` : ''}
              ${it.id === 'cache:online-media' ? `<button type="button" data-sm-act="clear-om" title="Clear online media cache">🧹 Clear</button>` : ''}
            </div>
          </div>`;
        }).join('') : '<p class="note" style="padding:24px;text-align:center">No items found in this category.</p>'}
      </div>
      <div class="sm-hints note">
        <span>LB / RB: Filter category</span> · <span>A: Play or open</span> · <span>Y: Share game</span> · <span>X: Show in folder</span>
      </div>
    `;

    body.innerHTML = html;
  }

  function fmt(n) {
    if (!n || n <= 0) return '0 B';
    if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
    if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    return `${Math.round(n / 1024)} KB`;
  }

  // Handle click events within modal
  document.addEventListener('click', async (ev) => {
    const modal = $('#modal');
    if (!modal || !modal.contains(ev.target)) return;

    // Filter tab clicks
    const tab = ev.target.closest('[data-sm-filter]');
    if (tab) {
      curFilter = tab.dataset.smFilter;
      Sound?.play?.('tick');
      render();
      return;
    }

    // Sort button click
    const sort = ev.target.closest('[data-sm-sort]');
    if (sort) {
      curSort = sort.dataset.smSort;
      Sound?.play?.('tick');
      render();
      return;
    }

    // Action button clicks
    const actBtn = ev.target.closest('[data-sm-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.smAct;

    if (act === 'play') {
      const it = (cacheData?.items || []).find((x) => x.id === actBtn.dataset.id);
      if (it?.entry) {
        closeModal();
        S.sel = it.entry;
        launch(it.entry);
      }
      return;
    }

    if (act === 'share') {
      const it = (cacheData?.items || []).find((x) => x.id === actBtn.dataset.id);
      if (it?.entry) {
        Transfer.openGame(it.entry);
      }
      return;
    }

    if (act === 'reveal') {
      const p = actBtn.dataset.path;
      if (p) {
        api.fsReveal(p);
        toast('Shown in your file manager.');
      }
      return;
    }

    if (act === 'del-cap') {
      const p = actBtn.dataset.path;
      if (p && await confirmAsk({ title: `Delete ${base(p)}?`, text: 'This recording will be permanently deleted from your PC.', yes: 'Delete recording', danger: true })) {
        const ok = await api.captureDelete(p);
        if (ok) {
          toast('Capture removed.');
          open();
        } else {
          toast('Could not delete capture.', 'err');
        }
      }
      return;
    }

    if (act === 'clear-om') {
      if (await confirmAsk({ title: 'Clear preview clips and music?', text: 'Online preview clips and theme music will be removed from your cache. New ones will download when you browse games.', yes: 'Clear cache' })) {
        await api.onlineMediaClear();
        toast('Online media cache cleared.');
        setTimeout(open, 500);
      }
      return;
    }
  });

  const base = (p) => String(p || '').split(/[\\/]/).pop();

  return { open };
})();
