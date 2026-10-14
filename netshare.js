'use strict';
/* Network & sharing: Bladedeck shows itself to other Bladedecks (Nearby, and ROM sync, which
   rides on it) only on home networks, unless the player turns on "Also share on public networks".
   - A home network: one Windows calls Private, or one the player marked as home (its Wi-Fi or
     connection name, kept in settings.homeNets). The first network Bladedeck sees after this
     arrived is marked home by the page, so nothing changes for someone already using Nearby.
   - On any other network Nearby stops; it comes back by itself on a home one (checked every 30 s).
   - The firewall: on Windows, Bladedeck's inbound rule can be set to Private only, or Private and
     Public, to match; Windows asks the player first (its own UAC prompt). On Linux ufw's rule is
     shown with the line to run, since only the player can change it (sudo). */
const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const LAN = require('./lan');

let settings = () => ({}), cur = null, last = null;
const ps = (cmd, cb, timeout = 20000) => execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { timeout, windowsHide: true }, cb);

/* The network this PC is on now: its name, on Windows Private or Public, and its router's
   hardware address. Names alone are not enough: Windows calls every wired network "Network" and
   Linux "Wired connection 1", so a café's would pass for home. A home network is remembered as
   name@router, and a bare name only counts when it is not one of those generic ones. */
const GENERIC = /^(network( \d+)?|unidentified network|ethernet( \d+)?|wired connection \d+|)$/i;
const idOf = (n) => (n.router ? `${n.name}@${n.router}` : n.name);
function router() {
  return new Promise((res) => {
    if (process.platform === 'win32') {
      ps("$g = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop; if ($g) { (Get-NetNeighbor -IPAddress $g -ErrorAction SilentlyContinue | Select-Object -First 1).LinkLayerAddress }", (err, out) => res(String(out || '').trim().toLowerCase().replace(/-/g, ':')));
      return;
    }
    execFile('ip', ['route', 'show', 'default'], { timeout: 5000 }, (err, out) => {
      const gw = (String(out || '').match(/via (\S+)/) || [])[1]; if (!gw) return res('');
      execFile('ip', ['neigh', 'show', gw], { timeout: 5000 }, (e2, o2) => res(((String(o2 || '').match(/lladdr (\S+)/) || [])[1] || '').toLowerCase()));
    });
  });
}
function look() {
  const named = new Promise((res) => {
    if (process.platform === 'win32') {
      ps("Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Tailscale|Loopback' } | Select-Object Name,NetworkCategory | ConvertTo-Json", (err, out) => {
        let l = []; try { l = [].concat(JSON.parse(out || '[]')); } catch { /* none */ }
        const n = l[0]; res(n ? { name: String(n.Name || ''), category: ['Public', 'Private', 'DomainAuthenticated'][+n.NetworkCategory] || String(n.NetworkCategory || '') } : null);
      });
      return;
    }
    execFile('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show', '--active'], { timeout: 8000 }, (err, out) => {
      const l = String(out || '').trim().split('\n').map((x) => x.replace(/\\:/g, '\u0000').split(':').map((y) => y.replace(/\u0000/g, ':')));
      const n = l.find(([, t]) => /wireless|ethernet/.test(t || ''));
      res(n ? { name: n[0], category: '' } : null);
    });
  });
  return Promise.all([named, router().catch(() => '')]).then(([n, r]) => (n ? { ...n, router: /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(r) && r !== '00:00:00:00:00:00' ? r : '', generic: GENERIC.test(n.name) } : null)).then((n) => (n ? { ...n, id: idOf(n) } : null));
}
const isHome = (n, homes) => !!n && (homes.includes(n.id) || (!n.generic && homes.includes(n.name)));
// Home, or sharing everywhere: Nearby may run. Unknown (no network tool, nothing marked yet) is home.
function allowed() {
  const st = settings();
  if (st.publicNetworks === true || !cur || !Array.isArray(st.homeNets)) return true;
  if (cur.category === 'Private' || cur.category === 'DomainAuthenticated') return true;
  return isHome(cur, st.homeNets);
}
function summary() {
  const home = !!cur && (cur.category === 'Private' || cur.category === 'DomainAuthenticated' || isHome(cur, settings().homeNets || []));
  return { network: cur, home, sharing: allowed() };
}
async function refresh() {
  cur = await look().catch(() => null);
  const ok = allowed();
  if (ok !== last) { last = ok; LAN.apply?.(); }
  return summary();
}

// Windows Firewall: Bladedeck's inbound rules and the network kinds they cover.
const RULES = "Get-NetFirewallRule -Direction Inbound -Enabled True | Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -match 'bladedeck' }";
function winRules() {
  return new Promise((res) => ps(`${RULES} | Select-Object DisplayName,Profile,Action | ConvertTo-Json`, (err, out) => {
    let l = []; try { l = [].concat(JSON.parse(out || '[]')); } catch { /* none */ }
    // Profile flags: 1 Domain, 2 Private, 4 Public.
    res(l.filter(Boolean).map((r) => ({ name: r.DisplayName, private: !!(+r.Profile & 2) || +r.Profile === 0, public: !!(+r.Profile & 4) || +r.Profile === 0, allow: +r.Action !== 4 })));
  }, 40000));
}
// Set them to Private, or Private and Public. Runs elevated: Windows shows its own prompt.
function winSet(pub) {
  const inner = `${RULES} | Set-NetFirewallRule -Profile ${pub ? 'Private,Public' : 'Private'}`;
  const enc = Buffer.from(inner, 'utf16le').toString('base64');
  return new Promise((res) => ps(`try { Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${enc}'; 'ok' } catch { 'no' }`, (err, out) => res(String(out || '').trim() === 'ok'), 120000));
}

function register({ getSettings }) {
  settings = getSettings || settings;
  LAN.setGate?.(allowed);
  refresh();
  setInterval(refresh, 30000).unref?.();
  // Quick: what is known now (looked up every 30 s); the firewall, slow on Windows, on its own.
  ipcMain.handle('netshare-status', async () => ({ ...(cur ? summary() : await refresh()), platform: process.platform }));
  ipcMain.handle('netshare-rules', async () => (process.platform === 'win32' ? { kind: 'windows', rules: await winRules() } : { kind: 'linux', ufw: LAN.firewall?.() || null }));
  ipcMain.handle('netshare-firewall', async (_e, pub) => (process.platform === 'win32' ? { ok: await winSet(!!pub), rules: await winRules() } : { ok: false }));
  ipcMain.handle('netshare-apply', () => refresh());
}

module.exports = { register, allowed, look };
