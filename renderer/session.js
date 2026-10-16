'use strict';
/* Player: you, across all your games. Playing earns XP and levels; playing on more days in a row
   builds a streak; every session can end with a quick check-in, so each game remembers where you
   got to and what you wanted to do next. That shows up when you pick the game, in the launch
   intro, and in the live panel while you play, with how long until the next reward, so there is
   always a reason to play a little longer.
   XP: 1 per minute played (up to 2 hours a session), +15 at 30 and at 60 minutes in one go,
   +25 a task, +50 a goal reached, +10 a check-in, and a daily bonus that grows with the streak.
   Uses S, save, esc, toast, openModal, closeModal, Sound, refreshQuiet, updateDetail and $ at call time. */

const MOODS = [['epic', '🤩', 'Epic'], ['fun', '😄', 'Fun'], ['okay', '😐', 'Okay'], ['tough', '😤', 'Tough'], ['meh', '😴', 'Meh']];
const NEXT_GOALS = ['Beat the next boss', 'Finish this chapter', 'Explore somewhere new', 'Level up', 'Find secrets', 'Get a new item', 'Just relax'];

const Player = (() => {
  const P = () => (S.lib.settings.player = S.lib.settings.player || { xp: 0, days: [], sessions: 0, goals: 0, checkins: 0, minutes: 0 });
  const levelOf = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;            // 60, 240, 540, 960… XP per level
  const xpFor = (lvl) => 60 * (lvl - 1) * (lvl - 1);
  const today = () => new Date().toDateString();

  function streak() {
    const days = new Set(P().days);
    let n = 0; const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // a streak survives until the day ends
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function header() {
    const p = P(), lvl = levelOf(p.xp), a = xpFor(lvl), b = xpFor(lvl + 1);
    const el = document.querySelector('.who span'); if (!el) return;
    const st = streak();
    el.innerHTML = `Level ${lvl}${st > 1 ? ` · 🔥 ${st} days` : ''}<i class="xp"><b style="width:${Math.round(100 * (p.xp - a) / (b - a))}%"></b></i>`;
    el.title = `${p.xp - a} of ${b - a} XP to level ${lvl + 1}`;
  }

  function xp(n, why) {
    if (!n) return;
    const p = P(), before = levelOf(p.xp);
    p.xp += Math.round(n); save();
    const after = levelOf(p.xp);
    header();
    // Settings, Home (or Your profile) can turn these pop-ups off; the XP still counts.
    if (S.lib.settings.xpToasts === false) return;
    if (after > before) { setTimeout(() => { toast(`Level up! You are level ${after}.`, 'fun'); Sound.play('fixed'); }, 600); }
    else if (why) toast(`+${Math.round(n)} XP · ${why}`);
  }

  // A session ended: XP for the time, bonuses, the streak, then the check-in.
  function sessionOver(e, seconds) {
    const p = P(), mins = Math.floor(seconds / 60);
    if (mins < 1) return;
    const firstToday = !p.days.includes(today());
    if (firstToday) { p.days.push(today()); if (p.days.length > 400) p.days.shift(); }
    p.sessions++; p.minutes += mins;
    let gain = Math.min(mins, 120);
    if (mins >= 30) gain += 15;
    if (mins >= 60) gain += 15;
    if (firstToday) gain += Math.min(100, 20 * streak());
    xp(gain, `${mins} minutes in ${e.title}${firstToday && streak() > 1 ? `, ${streak()}-day streak` : ''}`);
    if (seconds >= 300 && S.lib.settings.checkin !== false) whenFree(() => checkin(e, mins));
  }
  // Wait until the player is back in Bladedeck and nothing else is open.
  function whenFree(fn) {
    const t = setInterval(() => { if (document.hasFocus() && !S.modal && !Tour.isOpen() && !Intro.playing()) { clearInterval(t); setTimeout(fn, 700); } }, 800);
    setTimeout(() => clearInterval(t), 30 * 60000);
  }

  /* -------------------------------------------------------------- check-in */
  function checkin(e, mins) {
    const goal = e.goal;
    const ans = { done: null, mood: '', note: '', next: '' };
    const chip = (name, v, label, on) => `<button type="button" class="ck-chip ${on ? 'primary' : ''}" data-k="${name}" data-v="${esc(v)}">${label}</button>`;
    const body = () => `
      <p class="ck-lead">${esc(e.title)} · ${mins} minute${mins === 1 ? '' : 's'}</p>
      ${goal ? `<div class="ck-q"><b>Your goal was: ${esc(goal)}</b><div class="ck-row">${chip('done', 'yes', '✅ Done it!', ans.done === true)}${chip('done', 'no', 'Not yet', ans.done === false)}</div></div>` : ''}
      <div class="ck-q"><b>How did it feel?</b><div class="ck-row">${MOODS.map(([v, ic, n]) => chip('mood', v, `${ic} ${n}`, ans.mood === v)).join('')}</div></div>
      <label class="ck-q"><b>Where are you up to?</b><input type="text" name="ck-note" value="${esc(ans.note)}" placeholder="e.g. Just reached the second castle"></label>
      <div class="ck-q"><b>Next time I want to…</b><div class="ck-row">${NEXT_GOALS.map((g) => chip('next', g, esc(g), ans.next === g)).join('')}</div>
        <input type="text" name="ck-next" value="${esc(NEXT_GOALS.includes(ans.next) ? '' : ans.next)}" placeholder="…or write your own goal"></div>`;
    openModal({
      title: 'How was that?', wide: true, html: `<div class="ck">${body()}</div>`,
      buttons: [{ label: 'Skip' }, { label: 'Save (+10 XP)', primary: true, onClick: (root) => {
        ans.note = $('[name=ck-note]', root).value.trim();
        const own = $('[name=ck-next]', root).value.trim(); if (own) ans.next = own;
        e.journal = e.journal || [];
        e.journal.push({ t: Date.now(), mins, mood: ans.mood, note: ans.note, goal: goal || '', done: ans.done, next: ans.next });
        if (e.journal.length > 50) e.journal.shift();
        if (ans.done === true) { P().goals++; e.goalsDone = (e.goalsDone || 0) + 1; }
        e.goal = ans.next || (ans.done === false ? goal : '');
        P().checkins++; save();
        xp(10 + (ans.done === true ? 50 : 0), ans.done === true ? `goal reached in ${e.title}` : 'check-in');
        if (ans.done === true) Sound.play('secret');
        refreshQuiet(); updateDetail();
      } }],
      onOpen: (root) => root.addEventListener('click', (ev) => {
        const c = ev.target.closest('.ck-chip'); if (!c) return;
        const k = c.dataset.k, v = c.dataset.v;
        ans.note = $('[name=ck-note]', root).value; ans.next = $('[name=ck-next]', root).value || ans.next;
        if (k === 'done') ans.done = v === 'yes';
        if (k === 'mood') ans.mood = ans.mood === v ? '' : v;
        if (k === 'next') { ans.next = ans.next === v ? '' : v; }
        $('.ck', root).innerHTML = body();
        Sound.play('tick');
        PadNav.mark($(`.ck-chip[data-k="${k}"][data-v="${CSS.escape(v)}"]`, root));
      })
    });
  }

  /* -------------------------------------------------------------- showing it back */
  const ago = (t) => { const d = Math.round((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  function detailHtml(e) {
    const last = (e.journal || [])[e.journal?.length - 1];
    const mood = last && MOODS.find((m) => m[0] === last.mood);
    return `${e.goal ? `<p class="stat goal">🎯 Goal: ${esc(e.goal)}</p>` : ''}
      ${last ? `<p class="stat last">Last time, ${ago(last.t)}: ${last.mins} min${mood ? ` ${mood[1]}` : ''}${last.note ? ` · “${esc(last.note)}”` : ''}</p>` : ''}`;
  }
  // While playing: how far to the next reward.
  function nextReward(mins) {
    if (mins < 30) return `${30 - mins} min to the 30-minute bonus`;
    if (mins < 60) return `${60 - mins} min to the hour bonus`;
    return `next fish flake in ${5 - (mins % 5)} min`;
  }

  /* -------------------------------------------------------------- profile */
  function profile() {
    const p = P(), lvl = levelOf(p.xp), a = xpFor(lvl), b = xpFor(lvl + 1);
    const games = S.lib.entries.filter((e) => e.playtime).sort((x, y) => y.playtime - x.playtime).slice(0, 5);
    const journal = S.lib.entries.flatMap((e) => (e.journal || []).map((j) => ({ ...j, e }))).sort((x, y) => y.t - x.t).slice(0, 8);
    const goals = S.lib.entries.filter((e) => e.goal);
    const hrs = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
    openModal({
      title: S.lib.settings.playerName || 'Your profile', wide: true,
      html: `<div class="pf">
        <div class="pf-top"><div class="pf-lvl"><b>${lvl}</b><span>Level</span></div>
          <div class="pf-bar"><i style="width:${Math.round(100 * (p.xp - a) / (b - a))}%"></i></div><small>${p.xp - a} / ${b - a} XP to level ${lvl + 1}</small></div>
        <div class="pf-stats"><div><b>🔥 ${streak()}</b><span>day streak</span></div><div><b>${hrs(p.minutes)}</b><span>played here</span></div>
          <div><b>${p.sessions}</b><span>sessions</span></div><div><b>${p.goals}</b><span>goals reached</span></div></div>
        ${goals.length ? `<div class="side-h">Your goals</div>${goals.map((e) => `<p class="pf-line">🎯 <b>${esc(e.title)}</b>: ${esc(e.goal)}</p>`).join('')}` : ''}
        ${games.length ? `<div class="side-h">Most played</div>${games.map((e) => `<p class="pf-line"><b>${esc(e.title)}</b> · ${hrs(Math.round(e.playtime / 60))}${e.goalsDone ? ` · ${e.goalsDone} goal${e.goalsDone === 1 ? '' : 's'}` : ''}</p>`).join('')}` : ''}
        ${journal.length ? `<div class="side-h">Journal</div>${journal.map((j) => { const m = MOODS.find((x) => x[0] === j.mood); return `<p class="pf-line"><span class="dim">${ago(j.t)}</span> · <b>${esc(j.e.title)}</b> · ${j.mins} min ${m ? m[1] : ''}${j.done === true ? ' · ✅ goal' : ''}${j.note ? ` · “${esc(j.note)}”` : ''}</p>`; }).join('')}` : '<p class="note">Finish a session of 5 minutes or more and Bladedeck asks how it went. Your answers build this journal.</p>'}
        <div class="checks"><label><input type="checkbox" class="pf-ck" ${S.lib.settings.checkin !== false ? 'checked' : ''}> Ask how my session went</label><label><input type="checkbox" class="pf-xp" ${S.lib.settings.xpToasts !== false ? 'checked' : ''}> Pop-ups for XP and level-ups</label></div>
      </div>`,
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => root.addEventListener('change', (ev) => { if (ev.target.classList.contains('pf-ck')) { S.lib.settings.checkin = ev.target.checked; save(); } if (ev.target.classList.contains('pf-xp')) { S.lib.settings.xpToasts = ev.target.checked; save(); } })
    });
  }

  return { xp, sessionOver, checkin, detailHtml, nextReward, profile, header, levelOf, streak };
})();
