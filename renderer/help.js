'use strict';
/* Help: "Confused? Start here." One place for everything that helps: the quick start, the tour by
   topic, the controls, the guide, voice control (on, off, and what to say), the browser, settings
   and the answers to the questions people ask most. Opens from ❓ in the top bar, System, or F1.
   Uses S, api, esc, toast, openModal, closeModal, save, Tour, Guide, Voice, Panels and $ at call time. */
const Help = (() => {
  const st = () => S.lib.settings;
  const FAQ = [
    ['How do I add my games?', 'Find everything looks for Steam, GOG, Heroic, Moonlight and store launchers in one go. A single program or game file: Add a game.', [['✦ Find everything', () => findEverything()], ['+ Add a game', () => editEntry()]]],
    ['How do I get back to Bladedeck from a game?', 'Hold the Xbox/PS button, press View + Start, or Ctrl+M on a keyboard. The game shrinks into a panel on the left; the same again goes back.', []],
    ['A game will not start, or starts and closes.', 'Open it in PC mode and press Edit: check the program it runs. Steam games: Steam may be waiting on a question (Cloud sync, an update); Bladedeck shows that window.', [['🎮 Gaming software settings', () => openSettingsAt('games')]]],
    ['My controller does nothing.', 'Press any button on it with Bladedeck in front. Controllers shows who is which player and lets you test rumble.', [['🕹 Controllers', () => openSettingsAt('pads')]]],
    ['Where did my download go?', 'Downloads shows every download, what kind of file it is, the folder it went to, and Extract for archives.', [['⬇ Downloads', () => WebDl.open()]]],
    ['How do I play with someone?', 'Split screen on one screen, a screen each, Nearby for other Bladedecks at home, and ROM sync between your own PCs.', [['👥 Split screen', () => SplitScreen.open()], ['📡 Nearby', () => Nearby.open()], ['🔄 ROM sync', () => RomSync.open()]]],
    ['Can other people see me on the network?', 'Only on your home network, unless you allow public networks. Network & sharing says which network this is and what is shared.', [['📶 Network & sharing', () => openSettingsAt('net')]]]
  ];
  const VOICE_SAYS = ['open Hades', 'open YouTube', "what's the weather", 'set a timer for 10 minutes', 'next song', 'take a screenshot'];

  function html() {
    const s = st();
    const chapters = Tour.chapters().map((c) => `<button type="button" class="hp-chap" data-chap="${c.id}"><i>${c.icon}</i><b>${esc(c.name)}</b><small>${c.count} card${c.count === 1 ? '' : 's'}</small></button>`).join('');
    return `<div class="hp">
      <p class="hp-lead">Confused? Start here. Everything that helps is on this page.</p>
      <div class="hp-big">
        <button type="button" data-h="quick" class="hp-tile primary"><i>⭐</i><b>Quick start</b><small>The 7 things to know, 2 minutes</small></button>
        <button type="button" data-h="controls" class="hp-tile"><i>🎮</i><b>Controls</b><small>Every button and key</small></button>
        <button type="button" data-h="guide" class="hp-tile"><i>❓</i><b>Ask the guide</b><small>Stuck in a game? Ask it</small></button>
        <button type="button" data-h="browser" class="hp-tile"><i>🌐</i><b>Browser</b><small>The web, inside Bladedeck</small></button>
        <button type="button" data-h="settings" class="hp-tile"><i>⚙</i><b>Settings</b><small>With a search to find any setting</small></button>
      </div>
      <div class="side-h">The tour, by topic</div>
      <div class="hp-chaps">${chapters}</div>
      <div class="side-h">Voice control</div>
      <div class="hp-voice">
        <label class="row"><span class="row-t"><b>Talk to Bladedeck</b><small>Tap 🎤 at the top, press View + LB, or Space, then say something short. Works out loud on this PC; nothing is sent anywhere.</small></span><input type="checkbox" data-v="voice" ${s.voice ? 'checked' : ''}></label>
        <label class="row"><span class="row-t"><b>Listen for "Hey Blade"</b><small>Say it first instead of pressing anything. Uses a little processor while on.</small></span><input type="checkbox" data-v="voiceWake" ${s.voiceWake ? 'checked' : ''}></label>
        <p class="note">Try saying: ${VOICE_SAYS.map((x) => `<span class="hp-say">“${esc(x)}”</span>`).join(' ')}</p>
        <div class="btns"><button type="button" data-h="voicetry" ${s.voice ? '' : 'disabled'}>🎤 Try it now</button></div>
      </div>
      <div class="side-h">Questions people ask</div>
      <div class="hp-faq">${FAQ.map(([q, a, acts], k) => `<details${k ? '' : ' open'}><summary>${esc(q)}</summary><p>${esc(a)}</p>${acts.length ? `<div class="btns">${acts.map(([l], j) => `<button type="button" data-faq="${k}:${j}">${esc(l)}</button>`).join('')}</div>` : ''}</details>`).join('')}</div>
    </div>`;
  }
  // Leave Help, then open the thing (after the modal has gone).
  const go = (fn) => { closeModal(); setTimeout(fn, 60); };
  function open() {
    openModal({
      title: '❓ Help', wide: true, className: 'help', html: html(), buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => {
        root.addEventListener('change', (ev) => {
          const v = ev.target.dataset.v; if (!v) return;
          st()[v] = ev.target.checked; save(); Voice.syncWake?.();
          $('[data-h=voicetry]', root).disabled = !st().voice;
          toast(v === 'voice' ? (st().voice ? 'Voice control is on. Tap 🎤 or press Space and talk.' : 'Voice control is off.') : (st().voiceWake ? 'Listening for "Hey Blade".' : 'Not listening for "Hey Blade".'));
        });
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-h], [data-chap], [data-faq]'); if (!b) return;
          if (b.dataset.chap) { go(() => Tour.chapter(b.dataset.chap)); return; }
          if (b.dataset.faq) { const [k, j] = b.dataset.faq.split(':').map(Number); go(FAQ[k][2][j][1]); return; }
          ({
            quick: () => go(() => Tour.chapter('start')),
            controls: () => go(openControls),
            guide: () => go(() => Guide.open('pad')),
            browser: () => go(() => Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url: 'https://duckduckgo.com' })),
            settings: () => go(() => { openSettings(); setTimeout(() => document.querySelector('.set-find')?.focus(), 200); }),
            voicetry: () => go(() => Voice.listen())
          })[b.dataset.h]?.();
        });
      }
    });
  }
  addEventListener('keydown', (ev) => { if (ev.key === 'F1') { ev.preventDefault(); if (S.modal) closeModal(); open(); } });
  document.getElementById('help-btn')?.addEventListener('click', () => { if (S.modal) closeModal(); open(); });
  return { open };
})();
