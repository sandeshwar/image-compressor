// Defensive client-side HTTPS upgrade. The real fix is a server/CDN redirect.
(function () {
    if (location.protocol !== 'http:') return;

    var localHosts = ['localhost', '127.0.0.1', '[::1]'];
    if (localHosts.indexOf(location.hostname) !== -1) return;

    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
})();
