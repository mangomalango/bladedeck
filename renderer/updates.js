'use strict';
/* System, Updates (updater.js in main): which build this is, whether a newer one is out, every fix
   it brings, and an Update button that downloads it, puts it in place and restarts Bladedeck.
   Checked by itself a little after start and every six hours; a new build shows a toast in the
   menu, a system notification over games, and "Update ready" on the System item.
   System, Feedback and ideas (feedback.js in main): a box for what to fix and what to add, kept
   with the build it came from in Bladedeck/Feedback/feedback.md for the team to read.
   Uses S, api, esc, toast, save, openModal, closeModal and $ at call time; the System item reads label() when the menu draws. */
const Updates = (() => {
  const st = () => S.lib.settings;
  const repo = () => st().updateRepo || 'mangomalango/bladedeck';
  const channel = () => (st().updateChannel === 'nightly' ? 'nightly' : 'release');
  let result = null, checking = false, progress = null;
  const when = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  async function check(loud) {
    if (checking) return result;
    checking = true;
    try {
      const r = await api.updateCheck({ repo: repo(), channel: channel(), notify: !loud && !!(result === null || !result.newer) });
      if (!r) { result = { ok: false, error: 'Update checks are off in test copies.' }; return result; }
      result = r; st().lastUpdateCheck = Date.now(); save();
      if (!r.ok) { if (loud) toast(r.error, 'err'); return r; }
      const key = `${r.channel}:${r.latest}:${r.ahead || 0}`;
      if (r.newer && (loud || st().updateSeen !== key)) { st().updateSeen = key; save(); toast(`Bladedeck update ready: ${r.latest}${r.fixes.length ? `, ${r.fixes.length} fixes` : ''}. System, Updates.`, 'fun'); }
      else if (loud && !r.newer) toast(`You have the newest Bladedeck${r.channel === 'nightly' ? ' nightly' : ''} (${r.build.version}).`);

      return r;
    } finally { checking = false; }
  }

  // The System item's line: what is waiting, or which build this is.
  function label() {
    if (result?.ok && result.newer) return `Update ready: ${result.latest}${result.fixes.length ? ` · ${result.fixes.length} fixes` : ''}`;
    return 'Your version, what is new, and the Update button';
  }

  const fixRow = (f) => `<li><b>${esc(f.title)}</b><small> ${esc(f.sha)}${f.date ? ` · ${esc(when(f.date))}` : ''}</small></li>`;
  function body(info) {
    const r = result;
    const me = `${esc(info.version)}${info.commit ? ` · ${esc(info.commit.slice(0, 7))}` : ''}${info.date ? ` · built ${esc(when(info.date))}` : ''} · ${info.platform === 'win32' ? 'Windows' : info.platform === 'linux' ? 'Linux' : esc(info.platform)}${info.packaged ? '' : ' · running from source'}`;
    const opt = (v, n) => `<option value="${v}" ${channel() === v ? 'selected' : ''}>${n}</option>`;
    let status = '<p class="note">Checking…</p>', list = '';
    if (r && !r.ok) status = `<p class="note">${esc(r.error)}</p>`;
    else if (r && r.ok) {
      status = r.newer ? `<p class="up-new"><b>${esc(r.latest)} is ready</b>${r.fixes.length ? `: ${r.fixes.length} fixes and changes` : ''}.${r.why ? ` ${esc(r.why)}` : ''}</p>`
        : `<p class="note">You have the newest ${r.channel === 'nightly' ? 'nightly' : 'release'}${r.note ? ` (${esc(r.note)})` : ''}.</p>`;
      const fixes = r.newer ? r.fixes : [];
      if (fixes.length) list += `<h4 class="set-sub">What this update fixes and adds</h4><ul class="up-fixes">${fixes.slice(0, 60).map(fixRow).join('')}</ul>${fixes.length > 60 ? `<p class="note">And ${fixes.length - 60} more.</p>` : ''}`;
      if (r.newer && r.notes.length) list += `<h4 class="set-sub">Release notes</h4><ul class="up-fixes">${r.notes.slice(0, 40).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    }
    const bar = progress ? `<div class="up-bar"><i style="width:${progress.size ? Math.round(100 * progress.got / progress.size) : 0}%"></i></div><p class="note">${progress.done ? 'Installing; Bladedeck restarts in a moment.' : `Downloading ${(progress.got / 1048576).toFixed(0)} of ${((progress.size || 0) / 1048576).toFixed(0)} MB…`}</p>` : '';
    return `<p class="note">This is Bladedeck ${me}.</p>
      <label>Get updates from<select name="upChannel">${opt('release', 'Releases (tested)')}${opt('nightly', 'Nightly (newest, from bladedeck-nightly)')}</select></label>
      <div class="up-status">${status}</div>${bar}
      <div class="pl-acts"><button type="button" class="primary" data-up="install" ${r?.canInstall && !progress ? '' : 'disabled'}>Update now</button><button type="button" data-up="check">Check now</button>${r?.page ? '<button type="button" data-up="page">On GitHub</button>' : ''}</div>
      ${list}`;
  }

  async function open() {
    const info = await api.updateInfo().catch(() => ({ version: '?' }));
    let root = null;
    const draw = () => { const box = root && $('.up-box', root); if (box) box.innerHTML = body(info); };
    openModal({ title: 'Updates', wide: true, html: `<div class="up-box">${body(info)}</div>`, buttons: [{ label: 'Done', primary: true }],
      onOpen: (r) => {
        root = r;
        r.addEventListener('change', (ev) => { if (ev.target.name === 'upChannel') { st().updateChannel = ev.target.value; save(); result = null; draw(); check(true).then(draw); } });
        r.addEventListener('click', async (ev) => {
          const a = ev.target.closest('[data-up]')?.dataset.up; if (!a) return;
          if (a === 'check') { result = null; draw(); await check(true); draw(); }
          if (a === 'page' && result?.page) api.openLink(result.page);
          if (a === 'install') {
            progress = { got: 0, size: 0 }; draw();
            const x = await api.updateInstall();
            if (!x?.ok) { progress = null; draw(); toast(x?.error || 'The update did not finish.', 'err'); }
          }
        });
      } });
    api.onUpdateProgress?.((d) => { progress = d; draw(); });
    check(false).then(draw);
  }

  // A little after start, then every six hours.
  function boot() {
    if (st().updateRepo === undefined) { st().updateRepo = 'mangomalango/bladedeck'; save(); }
    if (st().updateCheck === false) return;
    setTimeout(() => check(false), 40000);
    setInterval(() => check(false), 6 * 3600 * 1000);
  }
  return { open, boot, check, label };
})();

const Feedback = (() => {
  const kindName = { fix: 'Something to fix', idea: 'An idea' };
  const row = (f) => `<div class="src-row"><i>${f.kind === 'fix' ? '🛠' : '💡'}</i><div class="src-t"><b>${esc(kindName[f.kind] || 'Note')} · ${esc(f.when)}${f.status && f.status !== 'new' ? ` · ${esc(f.status)}` : ''}</b><small>${esc(f.text).replace(/\n/g, '<br>')}</small></div></div>`;
  async function open(kind = 'fix') {
    const where = S.mode === 'console' ? `${S.blades?.[S.bi]?.name || 'menu'} blade` : 'PC mode';
    const l = await api.feedbackList().catch(() => []);
    openModal({ title: 'Feedback and ideas', wide: true,
      html: `<p class="note">Tell the team what to fix or what you would like. It is kept with this build's version in your Bladedeck folder (Feedback), and becomes a task.</p>
        <div class="pl-acts fb-kind"><button type="button" data-fb="fix" class="${kind === 'fix' ? 'primary' : ''}">🛠 Something to fix</button><button type="button" data-fb="idea" class="${kind === 'idea' ? 'primary' : ''}">💡 An idea</button></div>
        <label>What happened, or what you would like<textarea name="fbText" rows="5" placeholder="${kind === 'fix' ? 'What you did, what you saw, what you expected' : 'What it should do, and why you want it'}"></textarea></label>
        <div class="pl-acts"><button type="button" class="primary" data-fb="save">Save it</button><button type="button" data-fb="folder">Open the folder</button></div>
        <h4 class="set-sub">Saved so far</h4>${l.length ? l.map(row).join('') : '<p class="note">Nothing yet.</p>'}`,
      buttons: [{ label: 'Done' }],
      onOpen: (root) => {
        setTimeout(() => $('[name=fbText]', root)?.focus(), 50);
        root.addEventListener('click', async (ev) => {
          const a = ev.target.closest('[data-fb]')?.dataset.fb; if (!a) return;
          if (a === 'fix' || a === 'idea') { const t = $('[name=fbText]', root).value; closeModal(); await open(a); const box = document.querySelector('.modal.open [name=fbText], [name=fbText]'); if (box) box.value = t; return; }
          if (a === 'folder') { const d = await api.feedbackFolder(); if (d) api.fsOpen(d); return; }
          if (a === 'save') {
            const r = await api.feedbackAdd({ kind, text: $('[name=fbText]', root).value, where });
            if (!r?.ok) { toast(r?.error || 'It was not saved.', 'err'); return; }
            toast(kind === 'fix' ? 'Saved. The team will look at it.' : 'Idea saved. Thank you!', 'fun');
            closeModal(); open(kind);
          }
        });
      } });
  }
  return { open };
})();
