'use strict';
/* Fewer ads in Bladedeck's own browser (the browser panel, Browse, web apps): requests to well-known
   ad, pop-under and tracking networks are dropped, and a page cannot open a pop-up to another site
   (the trick most download sites use for their ads). It is a short built-in list, not a full ad
   blocker; AdGuard DNS in Suggested extras catches far more. Suggested extras, AdGuard, "Block ads
   in Bladedeck's browser" turns it off; it is on by default. */
const { session } = require('electron');

const HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'criteo.com', 'criteo.net', 'amazon-adsystem.com', 'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'propellerclick.com', 'adsterra.com', 'adsterratools.com', 'exoclick.com',
  'exosrv.com', 'juicyads.com', 'trafficjunky.net', 'trafficstars.com', 'onclickads.net', 'onclkds.com', 'hilltopads.net',
  'a-ads.com', 'coinzilla.com', 'monetag.com', 'galaksion.com', 'clickadu.com', 'admaven.com', 'ad-maven.com', 'adcash.com',
  'yllix.com', 'bidvertiser.com', 'pushcrew.com', 'onesignal.com', 'pushwoosh.com', 'richpush.co', 'zeropark.com',
  'adskeeper.com', 'adskeeper.co.uk', 'servedby-buysellads.com', 'buysellads.com', 'carbonads.net', 'media.net', 'contextweb.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'smartadserver.com', 'yieldmo.com', 'sharethrough.com',
  'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mouseflow.com', 'adform.net', 'serving-sys.com', 'zedo.com',
  'clickaine.com', 'ero-advertising.com', 'plugrush.com', 'adspyglass.com', 'realsrv.com', 'tsyndicate.com', 'acint.net'
];
const blocked = (host) => { host = String(host || '').toLowerCase(); return HOSTS.some((h) => host === h || host.endsWith('.' + h)); };

let on = () => true;
function attach(ses) {
  if (ses.__bdAds) return; ses.__bdAds = true;
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    let host = ''; try { host = new URL(d.url).hostname; } catch { /* odd url */ }
    cb({ cancel: on() && d.resourceType !== 'mainFrame' && blocked(host) });
  });
}
// A pop-up to another site from a page in Bladedeck's browser: an ad, almost always.
function popupIsAd(fromUrl, toUrl) {
  if (!on()) return false;
  try {
    const a = new URL(fromUrl).hostname.replace(/^www\./, ''), b = new URL(toUrl).hostname.replace(/^www\./, '');
    return blocked(b) || (a && b && !b.endsWith(a) && !a.endsWith(b));
  } catch { return false; }
}

function register({ settings }) {
  // Read the setting at most every few seconds, not on every request a page makes.
  let val = true, at = 0;
  on = () => { if (Date.now() - at > 5000) { at = Date.now(); try { val = settings().adblock !== false; } catch { /* keep */ } } return val; };
  const { app } = require('electron');
  app.whenReady().then(() => attach(session.fromPartition('persist:webapps')));
}

module.exports = { register, popupIsAd, blocked };
