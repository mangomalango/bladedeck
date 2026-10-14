'use strict';
/* Achievement clips: when you unlock an achievement, the moment is kept as a clip, from 30
   seconds before it to a few seconds after, and the game shows it behind its menu (b-roll).
   Steam games: Steam writes the unlock to its stats file and Bladedeck sees it at once.
   Emulated games: RetroAchievements is asked every 15 seconds while the game runs (it needs your
   name and web API key in Settings, Online). The replay keeps the last minute while a game runs,
   so even an unlock noticed a little late is still inside it.
   Uses S, api, toast, Notify, Capture, entryById and Ach at call time. */

const AchClips = (() => {
  const on = () => S.lib.settings.achClips !== false;
  let ses = null, raTimer = 0, seenRa = new Set(), pending = [];

  // A game started (or ended, with null).
  function session(s, e) {
    clearInterval(raTimer); api.steamAchWatch(null);
    ses = s && e ? { id: e.id, t: s.t || Date.now(), e } : null;
    if (!ses) return;
    if (e.type === 'steam' && e.appid) api.steamAchWatch(e.appid);
    else if (e.type === 'rom' && Ach.on()) { seenRa = new Set(); pollRa(true); raTimer = setInterval(() => pollRa(false), 15000); }
  }
  async function pollRa(first) {
    if (!ses) return;
    const r = await api.ra('GetUserRecentAchievements', { u: S.lib.settings.raUser, m: 15 }, true);
    if (!r.ok || !Array.isArray(r.data)) return;
    for (const a of r.data) {
      const id = `${a.AchievementID}`, at = Date.parse(String(a.Date).replace(' ', 'T') + 'Z');
      if (seenRa.has(id)) continue;
      seenRa.add(id);
      // The first look only learns what was already unlocked; and nothing from before this game.
      if (first || !at || at < ses.t - 5000) continue;
      unlocked({ kind: 'ra', title: a.Title, desc: a.Description, icon: a.BadgeName ? `https://media.retroachievements.org/Badge/${a.BadgeName}.png` : '', at });
    }
  }
  window.bladedeck.onAchievement((a) => unlocked(a));

  async function unlocked(a) {
    const e = ses ? entryById(ses.id) || ses.e : null;
    toast(`🏆 ${a.title}${a.desc ? `: ${a.desc}` : ''}`, 'fun');
    if (!on() || !e) return;
    const st = await api.captureStatus().catch(() => ({}));
    if (!(st.running && st.mode === 'replay')) return; // no replay running: nothing to cut from
    // A few seconds after the unlock, so the clip shows what followed too.
    setTimeout(async () => {
      pending.push({ at: a.at, savedAt: Date.now(), title: a.title, icon: a.icon, entryId: e.id });
      await api.captureSave();
    }, Math.max(0, a.at + 6000 - Date.now()));
  }

  /* A replay just landed in Videos/Bladedeck. If it was saved for an achievement, cut it down to
     the moment and hand back what to attach. Otherwise null, and it is an ordinary clip. */
  async function take(d) {
    if (d.kind !== 'replay') return null;
    pending = pending.filter((p) => Date.now() - p.savedAt < 90000);
    const p = pending.shift(); if (!p) return null;
    const r = await api.achClipTrim({ file: d.file, unlockAt: p.at, savedAt: p.savedAt, title: p.title });
    return { ...p, file: r.ok ? r.file : d.file, secs: r.ok ? r.secs : d.secs, cut: r.ok };
  }

  return { session, take, on };
})();
