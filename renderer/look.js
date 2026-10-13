'use strict';
/* Look: how the menus read. The font, letter style and size of menu text, and whether blade tabs
   show their name, an icon, or both. Every change previews live; Cancel puts it back.
   Uses S, api, esc, save, openModal, refresh, renderConsole, renderPc and $ at call time. */

const BLADE_ICONS = { home: '⌂', games: '🎮', steam: '♨', emu: '👾', pc: '🖥', apps: '◆', system: '⚙' };
const LETTERS = [['normal', 'As written'], ['upper', 'ALL CAPITALS'], ['lower', 'all lowercase'], ['caps', 'Small Capitals'], ['wide', 'S p a c e d']];

const Look = (() => {
  const css = document.getElementById('look-css');
  const cfg = () => (S.lib.settings.look = S.lib.settings.look || {});
  const iconOf = (b) => b.icon || BLADE_ICONS[b.id] || (b.special === 'system' ? '⚙' : b.name.trim()[0] || '•');

  function apply(l = cfg()) {
    const sel = '.tab-v, .title-h, .item b, .nav span, .side-h, .detail h3, #drawer h3, .cap b, .dlg h2';
    const t = { upper: 'text-transform: uppercase;', lower: 'text-transform: lowercase;', caps: 'font-variant: small-caps;', wide: 'letter-spacing: .14em;' }[l.letters] || '';
    css.textContent = [
      l.font ? `body, button, input, select, textarea { font-family: "${l.font.replace(/["\\]/g, '')}", var(--font) !important; }` : '',
      l.scale && l.scale !== 1 ? `html { zoom: ${l.scale}; }` : '',
      t ? `${sel} { ${t} }` : '',
      l.weight ? `.tab-v, .title-h, .item b, .detail h3 { font-weight: ${l.weight}; }` : ''
    ].join('\n');
    document.body.dataset.tabs = l.tabs || 'text';
  }

  // The inside of a blade tab and a PC side button; CSS picks what shows from body[data-tabs].
  const tab = (b) => `<i class="tab-ic">${esc(iconOf(b))}</i><span class="tab-tx">${esc(b.name)}</span>`;

  async function open() {
    const l = { ...cfg() };
    const blades = S.lib.settings.blades;
    const icons = blades.map(iconOf);
    const fonts = await api.fonts();
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === (cur || '') ? 'selected' : ''}>${esc(label)}</option>`;
    openModal({
      title: 'Look and menus', wide: true,
      html: `
        <label>Font<select name="font">${opt('', 'The theme\'s own font', l.font)}${fonts.map((f) => opt(f, f, l.font)).join('')}</select></label>
        <label>Letters<select name="letters">${LETTERS.map(([v, n]) => opt(v, n, l.letters || 'normal')).join('')}</select></label>
        <label>Weight<select name="weight">${[['', 'The theme\'s own'], ['200', 'Thin'], ['400', 'Regular'], ['600', 'Bold'], ['800', 'Heavy']].map(([v, n]) => opt(v, n, String(l.weight || ''))).join('')}</select></label>
        <label class="range-row">Size<input type="range" name="scale" min="0.85" max="1.3" step="0.05" value="${l.scale || 1}"></label>
        <label>Blade tabs<select name="tabs">${[['text', 'Names'], ['icons', 'Icons'], ['both', 'Icons and names']].map(([v, n]) => opt(v, n, l.tabs || 'text')).join('')}</select></label>
        <p class="note">Tab icons. Type or paste any emoji or symbol.</p>
        <div class="icon-grid">${blades.map((b, i) => `<label class="icon-cell"><input type="text" name="icon${i}" value="${esc(icons[i])}" maxlength="4"><span>${esc(b.name)}</span></label>`).join('')}</div>`,
      buttons: [
        { label: 'Reset', left: true, onClick: (root) => { Object.assign(l, { font: '', letters: 'normal', weight: '', scale: 1, tabs: 'text' }); blades.forEach((b, i) => { $(`[name=icon${i}]`, root).value = BLADE_ICONS[b.id] || iconOf({ ...b, icon: '' }); }); sync(root); return false; } },
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: (root) => { read(root); S.lib.settings.look = l; blades.forEach((b, i) => { b.icon = $(`[name=icon${i}]`, root).value.trim(); }); save(); apply(l); rerender(); } }
      ],
      onOpen: (root) => {
        root.addEventListener('input', () => { read(root); apply(l); });
        // However the dialog closes, what shows afterwards is what was saved.
        const mo = new MutationObserver(() => { if (!root.classList.contains('open')) { mo.disconnect(); apply(); } });
        mo.observe(root, { attributes: true, attributeFilter: ['class'] });
      }
    });
    function read(root) {
      Object.assign(l, { font: $('[name=font]', root).value, letters: $('[name=letters]', root).value, weight: $('[name=weight]', root).value,
        scale: +$('[name=scale]', root).value, tabs: $('[name=tabs]', root).value });
    }
    function sync(root) {
      for (const k of ['font', 'letters', 'weight', 'scale', 'tabs']) $(`[name=${k}]`, root).value = l[k] ?? '';
      apply(l);
    }
  }
  function rerender() { if (S.mode === 'console') renderConsole(); else renderPc(); }

  return { apply, open, tab, iconOf };
})();
