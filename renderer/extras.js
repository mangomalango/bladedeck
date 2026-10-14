'use strict';
/* Extras: optional things that make Bladedeck better, suggested once after setup instead of left
   for people to discover. Each card says what it does, whether it is already on here, how it
   works with the others, and has one button to turn it on or set it up. Always in System,
   Suggested extras. Nothing here signs anyone in to anything; each service keeps its own login.
   Also runs the two background jobs these turn on: weekly save backups and the update check.
   Uses S, api, esc, save, toast, openModal, closeModal, Dock, Voice, Companion, Capture,
   openSettingsAt, fromPreset and $ at call time. */

const Extras = (() => {
  const st = () => S.lib.settings;
  const DAY = 864e5;
  const ago = (stamp) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)$/.exec(stamp || ''); if (!m) return '';
    const days = Math.floor((Date.now() - new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) / DAY);
    return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  };

  async function cards() {
    const [x, cap, dns] = await Promise.all([api.extrasStatus().catch(() => ({})), api.captureStatus().catch(() => ({})), api.dnsStatus().catch(() => ({}))]);
    const sys = dns.system;
    const ts = x.tailscale || {}, b = x.backups || {}, s = st();
    const discord = (s.dock?.slots || []).some((sl) => sl.pick === 'discord');
    return [
      { id: 'tailscale', icon: '🛰', name: 'Tailscale', what: 'A private network between your own devices and friends, wherever they are.',
        state: !ts.installed ? 'Not installed' : ts.up ? `On · ${ts.ip}` : 'Installed, signed out', on: !!ts.up,
        with: 'Lets the phone app and Nearby work away from home, and shows friends\' Bladedecks.',
        btn: !ts.installed ? 'Get Tailscale' : ts.up ? '' : 'How to sign in', act: () => {
          if (!ts.installed) { api.openLink('https://tailscale.com/download'); toast('Opened the Tailscale download page in your browser.'); }
          else toast('Open the Tailscale app, or run "tailscale up" once, and sign in. Bladedeck picks it up by itself.');
        } },
      { id: 'adguard', icon: '🛡', name: 'AdGuard DNS', what: 'Blocks ad and tracker addresses before they load, by looking names up through AdGuard.',
        state: [s.adguardApp ? 'On in Bladedeck' : '', sys?.adguard ? `On for this PC (${sys.connection})` : ''].filter(Boolean).join(' · ') || 'Off', on: !!(s.adguardApp || sys?.adguard),
        with: 'Bladedeck only covers its browser panels and web apps. This PC covers everything on the current Wi-Fi. For your phone, add the same servers in Tailscale\'s DNS settings.',
        btn: '', act: () => {},
        extra: `<label class="ex-tog"><input type="checkbox" data-ex="adblock" ${s.adblock !== false ? 'checked' : ''}> Block ads and pop-ups in Bladedeck's browser (a built-in list, no DNS change)</label><label class="ex-tog"><input type="checkbox" data-ex="dnsApp" ${s.adguardApp ? 'checked' : ''}> In Bladedeck (its browser and web apps)</label>${sys ? `<label class="ex-tog"><input type="checkbox" data-ex="dnsSys" ${sys.adguard ? 'checked' : ''}> For this whole PC (${esc(sys.connection)})</label>` : ''}` },
      { id: 'discord', icon: '💬', name: 'Discord', what: 'Your chats one press away in the dock, and Rich Presence to show what you play.',
        state: [discord ? 'In your dock' : 'Not in your dock', s.discordRpc === true && s.discordClientId ? 'sharing what you play' : ''].filter(Boolean).join(' · '), on: discord,
        with: 'To show what you play on your Discord profile: make an application at discord.com/developers/applications (New Application, call it Bladedeck), copy its Application ID here, and tick the box. Off until you do.',
        btn: discord ? '' : 'Add to the dock', act: () => { const d = (st().dock = st().dock || { on: true, slots: [] }); d.slots.push(fromPreset('discord')); save(); Dock.draw(); toast('Discord is in the dock.'); },
        extra: `<label class="ex-tog">Discord Application ID<input type="text" data-ex="discordClientId" value="${esc(s.discordClientId || '')}" placeholder="from discord.com/developers/applications" autocomplete="off"></label><label class="ex-tog"><input type="checkbox" data-ex="discordRpc" ${s.discordRpc === true ? 'checked' : ''}> Share what I'm playing on my Discord profile</label>` },
      { id: 'ra', icon: '🏆', name: 'RetroAchievements', what: 'Achievements and progress for games you play in emulators.',
        state: s.raUser && s.raKey ? `Signed in as ${s.raUser}` : 'Not set up', on: !!(s.raUser && s.raKey),
        with: 'Progress shows on each emulated game, and counts toward its tasks.',
        btn: s.raUser && s.raKey ? '' : 'Add my account', act: () => openSettingsAt('online') },
      { id: 'backup', icon: '🛟', name: 'Save backups', what: `Copies your emulator saves${b.sources?.length ? ` (${b.sources.join(', ')})` : ''} and your library into Bladedeck/Backups. The newest 5 are kept.`,
        state: b.count ? `Last backup ${ago(b.last)} · ${s.backupWeekly ? 'every week' : 'by hand'}` : s.backupWeekly ? 'Every week, none yet' : 'Off', on: !!s.backupWeekly,
        with: 'Steam games keep their own saves in Steam Cloud. Point a sync app or cloud drive at Bladedeck/Backups to keep copies off this PC.',
        btn: 'Back up now', act: backupNow,
        extra: `<label class="ex-tog"><input type="checkbox" data-ex="weekly" ${s.backupWeekly ? 'checked' : ''}> Every week, by itself</label>` },
      { id: 'update', icon: '⬆', name: 'Update checks', what: 'Tells you when a new Bladedeck is out, with the page to get it. It never downloads or installs anything by itself.',
        state: s.updateRepo ? (s.updateCheck ? `Checking ${s.updateRepo}` : `Set to ${s.updateRepo}, off`) : 'Waiting for a release page', on: !!(s.updateRepo && s.updateCheck),
        with: 'Needs the GitHub repository Bladedeck\'s releases are published from.',
        btn: s.updateRepo ? 'Check now' : '', act: () => checkUpdate(true),
        extra: `<label class="ex-field">GitHub repository (owner/name)<input type="text" data-ex="repo" value="${esc(s.updateRepo || '')}" placeholder="owner/bladedeck"></label><label class="ex-tog"><input type="checkbox" data-ex="check" ${s.updateCheck ? 'checked' : ''}> Check once a day</label>` },
      { id: 'replay', icon: '🎬', name: 'Instant replay', what: 'Keeps the last 30 seconds of a game ready to save (View + RB), recorded on the graphics card.',
        state: cap.available ? 'GPU Screen Recorder is installed' : x.platform === 'linux' ? 'Not installed' : 'Uses Bladedeck\'s own recorder here', on: !!cap.available,
        with: 'Clips play behind your games in the menu and count for the "Roll camera" task.',
        btn: 'Recording settings', act: () => openSettingsAt('rec') },
      { id: 'voice', icon: '🎙', name: 'Voice commands', what: 'Say "open Hades", "next song" or "timer for 10 minutes". Worked out on this PC; nothing is sent anywhere.',
        state: s.voice ? 'On' : 'Off', on: !!s.voice,
        with: 'Timers and alarms also ring on a paired phone.',
        btn: s.voice ? '' : 'Turn on', act: () => { closeModal(); Voice.listen(); } },
      { id: 'phone', icon: '📱', name: 'Phone app', what: 'A remote, your library, clips and the sound card on your phone.',
        state: 'Pair from the Phone app screen', on: false,
        with: 'Works with Tailscale away from home, and gets your alarms.',
        btn: 'Set up', act: () => { closeModal(); Companion.open(); } },
      ...(x.platform === 'linux' ? [{ id: 'gamemode', icon: '🚀', name: 'GameMode', what: 'Asks the system for full speed while a game Bladedeck started is running.',
        state: !x.gamemode ? 'Not installed' : s.gamemode ? 'On' : 'Installed, off', on: !!(x.gamemode && s.gamemode),
        with: 'Install the "gamemode" package first; Steam games can use it from their launch options.',
        btn: x.gamemode && !s.gamemode ? 'Turn on' : '', act: () => { st().gamemode = true; save(); toast('Games Bladedeck starts now run with GameMode.'); } }] : [])
    ];
  }

  // Help lists every extra too, so any of them can be set up at any time.
  async function list() { return (await cards()).map(({ id, icon, name, what, on, state }) => ({ id, icon, name, what, on, state })); }
  async function open(focus) {
    const list = await cards();
    const html = `<p class="note">Optional extras that make Bladedeck better. Each one is off until you turn it on, and you can change your mind any time here (System, Suggested extras).</p>
      <div class="ex-grid">${list.map((c) => `<div class="ex-card ${c.on ? 'on' : ''}" data-id="${c.id}">
        <div class="ex-top"><i>${c.icon}</i><b>${esc(c.name)}</b><span class="ex-state">${c.on ? '✓ ' : ''}${esc(c.state)}</span></div>
        <p>${esc(c.what)}</p><small>${esc(c.with)}</small>${c.extra || ''}
        ${c.btn ? `<button type="button" data-go="${c.id}">${esc(c.btn)}</button>` : ''}</div>`).join('')}</div>`;
    openModal({
      title: 'Suggested extras', wide: true, html,
      buttons: [{ label: 'Done', primary: true, onClick: (root) => { read(root); } }],
      onOpen: (root) => {
        root.querySelector('.dlg').classList.add('extras');
        // Opened for one extra (from Help): that card, in view and lit up.
        const card = focus && root.querySelector(`.ex-card[data-id="${focus}"]`);
        if (card) { card.classList.add('ex-focus'); setTimeout(() => card.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); card.querySelector('input, button')?.focus(); }
        root.addEventListener('change', async (ev) => {
          const k = ev.target.dataset.ex;
          if (k === 'adblock') { st().adblock = ev.target.checked; save(); toast(ev.target.checked ? 'Ads and pop-ups are blocked in Bladedeck\'s browser.' : 'Bladedeck\'s browser shows ads again.'); }
          if (k === 'dnsApp') { st().adguardApp = ev.target.checked; save(); await api.dnsApp(ev.target.checked); toast(ev.target.checked ? 'Bladedeck looks names up through AdGuard now.' : 'Bladedeck uses your normal DNS again.'); }
          if (k === 'dnsSys') {
            const want = ev.target.checked;
            if (want && !(await confirmAsk({ title: 'AdGuard DNS for this PC?', text: 'Your current Wi-Fi or Ethernet connection will use AdGuard\'s DNS servers. Everything on this PC stops loading most ads and trackers. Turn it off here any time.', yes: 'Use AdGuard' }))) { open(); return; }
            const r = await api.dnsSystem(want);
            toast(r.ok ? (want ? `This PC uses AdGuard DNS on ${r.connection}.` : `${r.connection} uses its own DNS again.`) : r.error, r.ok ? 'fun' : 'err');
            open();
          }
        });
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-go]'); if (!b) return;
          read(root);
          list.find((c) => c.id === b.dataset.go)?.act();
        });
      }
    });
    st().extrasSeen = true; save();
  }
  // The few settings typed or ticked on the cards themselves.
  function read(root) {
    const s = st(), q = (k) => root.querySelector(`[data-ex="${k}"]`);
    if (q('weekly')) s.backupWeekly = q('weekly').checked;
    if (q('discordClientId')) { const id = q('discordClientId').value.trim(); s.discordClientId = /^\d{15,22}$/.test(id) ? id : ''; if (id && !s.discordClientId) toast('A Discord Application ID is a long number.', 'err'); }
    if (q('discordRpc')) { s.discordRpc = q('discordRpc').checked; if (s.discordRpc && !s.discordClientId) toast('Add your Discord Application ID first.', 'err'); if (!s.discordRpc) api.discordClear?.(); }
    if (q('repo')) { const r = q('repo').value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, ''); s.updateRepo = /^[\w.-]+\/[\w.-]+$/.test(r) ? r : ''; if (r && !s.updateRepo) toast('The repository is written as owner/name, like nate/bladedeck.', 'err'); }
    if (q('check')) s.updateCheck = q('check').checked;
    save();
  }

  async function backupNow(quiet) {
    if (!quiet) toast('Backing up your saves…');
    const r = await api.extrasBackup();
    if (!r.ok) { toast(`The backup did not finish: ${r.error}`, 'err'); return; }
    st().lastBackup = Date.now(); save();
    toast(`Saves backed up${r.done.length ? `: ${r.done.join(', ')}` : ''}.${r.skipped.length ? ` Skipped ${r.skipped.join(', ')}.` : ''}`, quiet ? 'ok' : 'fun');
  }
  async function checkUpdate(loud) {
    const s = st(); if (!s.updateRepo) { if (loud) toast('Set the GitHub repository first.', 'err'); return; }
    const r = await api.extrasUpdate(s.updateRepo);
    s.lastUpdateCheck = Date.now(); save();
    if (!r.ok) { if (loud) toast(r.error, 'err'); return; }
    if (r.newer) toast(`Bladedeck ${r.latest} is out (you have ${r.mine}). Open System, Suggested extras, Update checks, or get it from ${r.page}`, 'fun');
    else if (loud) toast(`You have the newest Bladedeck (${r.mine}).`);
  }

  // At start: offer the extras once after setup, and run the jobs that are due.
  function boot() {
    const s = st();
    if (!s.extrasSeen && (s.tourSeen || 0) > 0) setTimeout(() => { if (!S.modal) open(); }, 6000);
    if (s.backupWeekly && Date.now() - (s.lastBackup || 0) > 7 * DAY) setTimeout(() => backupNow(true), 60000);
    if (s.updateRepo === undefined) { s.updateRepo = 'mangomalango/bladedeck'; s.updateCheck = true; save(); }
    if (s.updateRepo && s.updateCheck && Date.now() - (s.lastUpdateCheck || 0) > DAY) setTimeout(() => checkUpdate(false), 30000);
  }

  return { open, list, boot, backupNow, checkUpdate };
})();
