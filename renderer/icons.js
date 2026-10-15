'use strict';
/* Icon packs (Look and menus): Bladedeck's own line icons for the blade tabs and the System menu,
   drawn here so they are free to use. "Line" shows them as they are; "Aero orbs" puts them on
   glossy glass bubbles. "Emoji" keeps the emoji. Anything without an icon here keeps its emoji.
   Uses S at call time. */
const Icons = (() => {
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    games: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="18" cy="13.5" r=".9"/>',
    steam: '<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.5"/><circle cx="8.5" cy="15" r="2"/><path d="M10.3 14 13.2 11"/>',
    emu: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 4v-1.5M12 4v-1.5M16 4v-1.5M8 21.5V20M12 21.5V20M16 21.5V20M4 8H2.5M4 12H2.5M4 16H2.5M21.5 8H20M21.5 12H20M21.5 16H20"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    system: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    lib: '<path d="M4 4.5h4v15H4zM10 4.5h4v15h-4z"/><path d="m16 5.2 3.8-1 3 14.6-3.8 1z" transform="translate(-1.5 0)"/>',
    soft: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v5.5M12 15v5.5"/>',
    play: '<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c.5-3.5 2.8-5.5 5.5-5.5S13.5 15.5 14 19M13.5 15.2c.8-.9 1.6-1.3 2.5-1.3 2.3 0 4 1.8 4.5 5.1"/>',
    cap: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
    info: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 12l2.5-3 2.5 2 3-4 2 2"/>',
    look: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><circle cx="12" cy="17" r=".6"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    backup: '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8.5h18M6.5 6.3h.01M9 6.3h.01"/>',
    exit: '<path d="M12 3v8"/><path d="M7.5 6.2a7.5 7.5 0 1 0 9 0"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
    pick: '<path d="M14 4 20 10M14 4 4 14l6 6L20 10M9 9l6 6"/>',
    puzzle: '<path d="M9 4h3a2 2 0 1 1 4 0h0v4h0a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4V4z"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 3l4 3 4-3M8 21h8"/>',
    pads: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M14.5 12.5h4"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r=".8"/>',
    friend: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6"/>',
    rec: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    resume: '<rect x="3" y="5" width="8" height="6" rx="1.5"/><rect x="13" y="5" width="8" height="6" rx="1.5"/><rect x="3" y="13" width="8" height="6" rx="1.5"/><rect x="13" y="13" width="8" height="6" rx="1.5"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    send: '<path d="M4 12 20 4l-5 16-3-7z"/><path d="m12 13 8-9"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    wallpaper: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
    letters: '<path d="M4 18 8.5 6 13 18M5.8 14h5.4M15 14.5a2.5 2.5 0 1 0 5 0v-3M20 18v-6.5a2.5 2.5 0 0 0-4.5-1.5"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    fish: '<path d="M3 12c3-4.5 9-5.5 13 0-4 5.5-10 4.5-13 0z"/><path d="M16 12l5-3.5v7z"/><circle cx="7.5" cy="11.2" r=".7"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>',
    keys: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
    flap: '<path d="M14 3h6v18h-6"/><path d="M14 12H4M8 8l-4 4 4 4"/>',
    video: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="m10 8.5 4.5 2.5L10 13.5z"/><path d="M8 20h8"/>',
    back: '<path d="M15 5 8 12l7 7"/>'
  };
  // Which icon each blade and System item uses.
  const FOR = {
    home: 'home', games: 'games', steam: 'steam', emu: 'emu', pc: 'pc', apps: 'apps', system: 'system',
    'grp-lib': 'lib', 'grp-soft': 'soft', 'grp-play': 'play', 'grp-cap': 'cap', 'grp-pc': 'info', 'grp-look': 'look', 'grp-help': 'help',
    'sys-set': 'settings', 'sys-backup': 'backup', 'sys-pc': 'window', 'sys-exit': 'exit', 'sys-up': 'back',
    'sys-quick': 'search', 'sys-add': 'plus', 'sys-romfile': 'disc', 'sys-get': 'download', 'sys-browse': 'search', 'sys-sources': 'compass', 'sys-steam': 'steam', 'sys-gog': 'games', 'sys-art': 'image', 'sys-dl': 'download',
    'sys-emu': 'emu', 'sys-consoles': 'pads', 'sys-hdmi': 'tv', 'sys-emuget': 'download', 'sys-mc': 'pick', 'sys-cf': 'puzzle', 'sys-store': 'apps', 'sys-extras': 'plus', 'sys-softset': 'settings',
    'sys-split': 'play', 'sys-multi': 'tv', 'sys-pads': 'pads', 'sys-near': 'wifi', 'sys-fr': 'friend',
    'sys-cap': 'cap', 'sys-rec': 'rec', 'sys-recset': 'settings',
    'sys-pc2': 'info', 'sys-vol': 'sound', 'sys-qr': 'resume', 'sys-nc': 'bell', 'sys-phone': 'phone', 'sys-xfer': 'send', 'sys-storage': 'backup', 'sys-storage-lib': 'backup', 'sys-voice': 'mic',
    'sys-theme': 'theme', 'sys-wall': 'wallpaper', 'sys-look': 'letters', 'sys-mu': 'music', 'sys-aq': 'fish', 'sys-me': 'star',
    'sys-tour': 'compass', 'sys-ctl': 'keys', 'sys-guide': 'flap', 'sys-pip': 'video', 'home-all': 'apps'
  };
  const pack = () => S.lib?.settings.look?.icons || 'emoji';
  const svg = (name) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
  // The icon for a blade or a System item, or null to keep its emoji.
  function of(key) { if (pack() === 'emoji') return null; const n = FOR[key]; return n && P[n] ? svg(n) : null; }
  const PACKS = [['emoji', 'Emoji'], ['line', 'Line icons'], ['orbs', 'Aero orbs']];
  return { of, pack, PACKS };
})();
