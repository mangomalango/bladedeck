'use strict';
/* Send files: to your own phone, or to a friend's Bladedeck nearby.
   To the phone: a copy goes into Bladedeck/To phone, which paired phones can download from (Files
   tab in the phone app); what the phone sends lands in Bladedeck/From phone.
   To a friend: their Bladedeck asks them first, and only then fetches that one file, straight
   from this PC over the home network; it lands in their Bladedeck/From friends.
   Only files in folders Bladedeck may use (or ones you pick yourself) can be sent, and every send
   asks you to confirm who gets what. Open it from System, Send files, or X on a file in Files.
   Uses S, api, esc, toast, openModal, closeModal, Sound, Nearby, Notify and $ at call time. */

const Transfer = (() => {
  const size = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const base = (p) => String(p).split(/[\\/]/).pop();

  async function open(file) {
    const peers = Nearby.peers();
    const shared = await api.xferPhoneList();
    const phones = (await api.companionInfo()).devices || [];
    openModal({
      title: file ? `Send ${base(file)}` : 'Send files', wide: true,
      html: `<div class="xf">
        ${file ? `<p class="xf-file">📄 <b>${esc(base(file))}</b></p>` : '<button type="button" class="xf-pick" data-xf="pick">Choose a file…</button><p class="xf-file" hidden></p>'}
        <div class="side-h">To</div>
        <div class="xf-to">
          <button type="button" data-xf="phone"><b>📱 My phone</b><small>${phones.length ? `${phones.length} paired · it shows in the phone app's Files tab` : 'No phone paired yet (System, Phone app)'}</small></button>
          ${peers.map((p) => `<button type="button" data-xf="peer" data-id="${esc(p.id)}"><b>🤝 ${esc(p.name)}</b><small>Nearby${p.pc ? ` · ${esc(p.pc)}` : ''} · they are asked first</small></button>`).join('')}
          ${peers.length ? '' : '<p class="note">Friends\' Bladedecks on this Wi-Fi show up here (Nearby).</p>'}
        </div>
        ${shared.length ? `<div class="side-h">Your phone can download</div>${shared.map((f) => `<div class="ph-dev"><b>${esc(f.name)}</b><span>${size(f.size)}</span><button type="button" data-xf="unshare" data-name="${esc(f.name)}">Stop sharing</button></div>`).join('')}` : ''}
        <p class="note">Files from your phone go to Bladedeck/From phone, and from friends to Bladedeck/From friends. Open them in Files.</p></div>`,
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-xf]'); if (!b) return;
        const a = b.dataset.xf;
        if (a === 'pick') { const f = await api.pick({ kind: 'file' }); if (f) { file = f; const p = $('.xf-file', root); p.hidden = false; p.innerHTML = `📄 <b>${esc(base(f))}</b>`; } return; }
        if (a === 'unshare') { if (await api.xferUnshare(b.dataset.name)) { b.closest('.ph-dev').remove(); toast('Your phone can no longer download it.'); } return; }
        if (!file) { toast('Choose a file first.', 'err'); return; }
        if (a === 'phone') confirmSend(file, 'your paired phones', async () => { const r = await api.xferToPhone(file); toast(r.ok ? `Sent. Open Files in the phone app to save ${r.name}.` : r.error, r.ok ? 'fun' : 'err'); });
        if (a === 'peer') { const p = peers.find((x) => x.id === b.dataset.id); confirmSend(file, p.name, async () => { const r = await api.lanOffer(p.id, file); toast(r.ok ? `Offered to ${p.name}. It goes once they accept.` : r.error, r.ok ? 'fun' : 'err'); }); }
      })
    });
  }

  // Every send says plainly who will get what, and needs a second, deliberate press.
  function confirmSend(file, who, go) {
    closeModal();
    setTimeout(() => openModal({
      title: 'Send this file?',
      html: `<p>Send <b>${esc(base(file))}</b> to <b>${esc(who)}</b>?</p><p class="note">Only this one file is sent. Nothing else on this PC is shared.</p>`,
      buttons: [{ label: 'Cancel' }, { label: 'Send it', primary: true, onClick: () => { go(); Sound.play('go'); } }]
    }), 0);
  }

  // From the phone.
  window.bladedeck.onCompanionReceived(({ name, size: n, from }) => { toast(`📲 ${from} sent ${name} (${size(n)}). It is in Bladedeck/From phone.`, 'fun'); Sound.play('pop'); });
  // From friends: ask first.
  window.bladedeck.onLanEvent(async (ev) => {
    if (ev.kind === 'got') { toast(`🤝 ${ev.from} got ${ev.name}.`, 'fun'); return; }
    if (ev.kind === 'sending') { toast(`🤝 ${ev.to} accepted. Sending ${ev.name}…`); return; }
    if (ev.kind === 'unanswered') { toast(`${ev.to} has not answered about ${ev.name}. If no question showed on their screen, their firewall may be blocking Bladedeck (their Nearby says how to fix it). The offer stays open 10 minutes.`, 'err'); return; }
    if (ev.kind === 'progress') { const s = $('.xf-prog'); if (s) s.textContent = `${ev.pct}%`; return; }
    if (ev.kind !== 'offer') return;
    Sound.play('secret');
    const ask = () => openModal({
      title: `${ev.from} wants to send you a file`,
      html: `<p class="xf-file">📄 <b>${esc(ev.file.name)}</b> · ${size(ev.file.size)}</p><p class="note">It will go into Bladedeck/From friends. Only accept files from people you know. Bladedeck never opens or runs it by itself.</p><p class="xf-prog"></p>`,
      buttons: [{ label: 'No thanks', onClick: () => { api.lanAccept(ev.oid, false); } }, { label: 'Accept', primary: true, onClick: async (root, btn) => {
        btn.disabled = true; btn.textContent = 'Receiving…';
        const r = await api.lanAccept(ev.oid, true);
        toast(r.ok ? `Got ${r.name}. It is in Bladedeck/From friends.` : r.error, r.ok ? 'fun' : 'err');
        return true;
      } }]
    });
    if (S.modal) toast(`🤝 ${ev.from} wants to send you ${ev.file.name}. Close this to answer.`, 'fun');
    const wait = setInterval(() => { if (!S.modal) { clearInterval(wait); ask(); } }, 500);
  });

  return { open };
})();
