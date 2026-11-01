// Registers the app-shell service worker on secure origins. No network data is sent.
(function () {
    if (!('serviceWorker' in navigator)) return;

    var localHosts = ['localhost', '127.0.0.1', '[::1]'];
    var isSecure = location.protocol === 'https:' || localHosts.indexOf(location.hostname) !== -1;

    if (!isSecure) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {
            // The app works without the service worker; offline support is optional.
        });
    }, { once: true });
})();
