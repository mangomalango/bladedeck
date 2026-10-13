'use strict';
/* Before a build: move the current AppImage aside instead of letting the build overwrite it.
   A running AppImage reads its own file the whole time it runs; overwriting that file crashes
   it (SIGBUS). A renamed file stays intact for the copy that is running, and the build writes a
   fresh one. Only the two newest old copies are kept. */
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const old = path.join(dist, 'previous');
try {
  for (const f of fs.readdirSync(dist).filter((n) => /\.AppImage$/.test(n))) {
    fs.mkdirSync(old, { recursive: true });
    const stamp = new Date(fs.statSync(path.join(dist, f)).mtimeMs).toISOString().replace(/[:.]/g, '-');
    fs.renameSync(path.join(dist, f), path.join(old, f.replace(/\.AppImage$/, `-${stamp}.AppImage`)));
  }
  const kept = fs.existsSync(old) ? fs.readdirSync(old).filter((n) => n.endsWith('.AppImage')).sort().reverse() : [];
  for (const f of kept.slice(2)) fs.rmSync(path.join(old, f), { force: true });
} catch (err) { if (err.code !== 'ENOENT') console.warn('predist:', err.message); }
