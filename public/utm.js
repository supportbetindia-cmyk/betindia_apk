/* BetIndia UTM / attribution tracker.
 * Add to the site with: <script src="https://admin.betindia.games/utm.js" async></script>
 * Captures first-touch + last-touch UTM source and beacons it to your dashboard.
 * When your site knows the logged-in user, call: window.biIdentify(userId)
 */
(function () {
  var ENDPOINT = 'https://admin.betindia.games/api/track/utm';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function currentUtms() {
    var p = new URLSearchParams(location.search), o = {}, has = false;
    UTM_KEYS.forEach(function (k) { var v = p.get(k); if (v) { o[k] = v; has = true; } });
    return has ? o : null;
  }

  function deviceId() {
    try {
      var id = localStorage.getItem('bi_device');
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : Date.now() + '-' + Math.random().toString(36).slice(2);
        localStorage.setItem('bi_device', id);
      }
      return id;
    } catch (e) { return null; }
  }

  function touch(utms) {
    var now = new Date().toISOString();
    var snap = { utm: utms, landing: location.href, referrer: document.referrer, at: now };
    try {
      if (utms && !localStorage.getItem('bi_utm_first')) localStorage.setItem('bi_utm_first', JSON.stringify(snap));
      if (utms) localStorage.setItem('bi_utm_last', JSON.stringify(snap));
    } catch (e) {}
  }

  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }

  function post(payload) {
    try {
      var s = JSON.stringify(payload);
      // text/plain avoids a CORS preflight; the server parses the JSON itself.
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([s], { type: 'text/plain' }));
      else fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: s, keepalive: true, mode: 'cors' });
    } catch (e) {}
  }

  function track() {
    touch(currentUtms());
    post({
      device_id: deviceId(),
      first: read('bi_utm_first'),
      last: read('bi_utm_last'),
      page: location.pathname,
      referrer: document.referrer,
    });
  }

  // Call this once your site exposes the logged-in user id, to attribute them.
  window.biIdentify = function (userId) {
    if (!userId) return;
    try { localStorage.setItem('bi_user', String(userId)); } catch (e) {}
    post({ device_id: deviceId(), user_id: String(userId), identify: true });
  };

  if (document.readyState !== 'loading') track();
  else document.addEventListener('DOMContentLoaded', track);
})();
