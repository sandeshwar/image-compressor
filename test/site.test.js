import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = function (file) {
    return readFileSync(path.join(root, file), 'utf8');
};
const pages = ['index.html', 'privacy.html', '404.html'];

function localPath(reference) {
    const withoutQuery = reference.split('?')[0].split('#')[0];
    return withoutQuery.replace(/^\.\//, '').replace(/^\//, '');
}

test('pages declare language, viewport, and a strict CSP', function () {
    pages.forEach(function (page) {
        const html = read(page);
        assert.match(html, /<html lang="en">/);
        assert.match(html, /name="viewport"/);
        assert.match(html, /http-equiv="Content-Security-Policy"/);
        assert.match(html, /connect-src 'none'/);
        assert.match(html, /object-src 'none'/);
        assert.match(html, /base-uri 'none'/);
    });
});

test('pages avoid inline scripts, inline styles, and event handlers', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const withoutJsonLd = html.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
        assert.doesNotMatch(withoutJsonLd, /<script(?![^>]*\bsrc=)[^>]*>/i);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
        assert.doesNotMatch(html, /\sstyle\s*=/i);
    });
});

test('pages load no third-party scripts, styles, or images', function () {
    pages.forEach(function (page) {
        const html = read(page);
        assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["']https?:/i);
        assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']https?:/i);
        assert.doesNotMatch(html, /<img\b[^>]*\bsrc=["']https?:/i);
    });

    const css = read('styles.css');
    assert.doesNotMatch(css, /@import\s/i);
    assert.doesNotMatch(css, /url\(\s*["']?https?:/i);
});

test('CSS is flat and free of gradient functions', function () {
    const css = read('styles.css');
    assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i);
});

test('local references exist', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(function (match) {
            return match[1];
        });

        references.forEach(function (reference) {
            if (reference.startsWith(('http://'))) return;
            if (reference.startsWith(('https://'))) return;
            if (reference.startsWith(('#'))) return;
            if (reference.startsWith(('data:'))) return;
            if (reference.startsWith(('blob:'))) return;
            if (reference.startsWith(('mailto:'))) return;
            if (reference === './' || reference === '/') return;

            const file = localPath(reference);
            assert.ok(existsSync(path.join(root, file)), page + ' references missing ' + reference);
        });
    });
});

test('app script avoids HTML injection, network calls, and storage', function () {
    const script = read('script.js');
    assert.doesNotMatch(script, /\binnerHTML\b/);
    assert.doesNotMatch(script, /\bouterHTML\b/);
    assert.doesNotMatch(script, /insertAdjacentHTML/);
    assert.doesNotMatch(script, /document\.write/);
    assert.doesNotMatch(script, /\beval\s*\(/);
    assert.doesNotMatch(script, /\bfetch\s*\(/);
    assert.doesNotMatch(script, /XMLHttpRequest/);
    assert.doesNotMatch(script, /WebSocket/);
    assert.doesNotMatch(script, /localStorage/);
    assert.doesNotMatch(script, /sessionStorage/);
    assert.doesNotMatch(script, /https?:\/\//);
});

test('service worker precaches existing, version-matched assets', function () {
    const sw = read('sw.js');
    const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
    assert.ok(block, 'PRECACHE list is missing');
    const references = [...block[1].matchAll(/'([^']+)'/g)].map(function (match) {
        return match[1];
    });
    assert.ok(references.length >= 10, 'PRECACHE should include the app shell');

    references.forEach(function (reference) {
        const file = reference === './' ? 'index.html' : localPath(reference);
        assert.ok(existsSync(path.join(root, file)), 'service worker precache missing ' + reference);
    });

    assert.match(sw, /skipWaiting\(\)/);
    assert.match(sw, /clients\.claim\(\)/);
    assert.match(sw, /caches\.delete/);
});

test('manifest uses existing PNG icons and relative navigation', function () {
    const manifest = JSON.parse(read('manifest.json'));
    assert.ok(manifest.start_url.startsWith('./'));
    assert.ok(manifest.scope.startsWith('./'));
    assert.ok(manifest.icons.some(function (icon) { return icon.sizes === '192x192'; }));
    assert.ok(manifest.icons.some(function (icon) { return icon.sizes === '512x512'; }));
    assert.ok(manifest.icons.some(function (icon) { return icon.purpose === 'maskable'; }));

    manifest.icons.forEach(function (icon) {
        const file = path.join(root, localPath(icon.src));
        assert.ok(existsSync(file), 'manifest icon missing ' + icon.src);
        const bytes = readFileSync(file);
        assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    });
});

test('HTML asset versions match the service worker', function () {
    const html = read('index.html');
    const versionMatch = html.match(/script\.js\?v=([^"']+)/);
    assert.ok(versionMatch, 'versioned script.js is missing');
    const version = versionMatch[1];
    const script = read('script.js');
    const sw = read('sw.js');

    assert.match(script, new RegExp('lib\\.js\\?v=' + version));
    ['styles.css', 'script.js', 'lib.js', 'register-sw.js', 'secure.js'].forEach(function (asset) {
        assert.match(sw, new RegExp('./' + asset.replace('.', '\\.') + '\\?v=' + version));
    });
});

test('security and discovery metadata is present', function () {
    const headers = read('_headers');
    assert.match(headers, /Content-Security-Policy:/);
    assert.match(headers, /Strict-Transport-Security:/);
    assert.match(headers, /X-Content-Type-Options:/);
    assert.match(headers, /Referrer-Policy:/);
    assert.match(headers, /frame-ancestors 'none'/);

    assert.match(read('robots.txt'), /Sitemap: https:\/\/compress-image\.uk\/sitemap\.xml/);
    const sitemap = read('sitemap.xml');
    assert.match(sitemap, /https:\/\/compress-image\.uk\//);
    assert.match(sitemap, /2026-11-01/);
    assert.match(sitemap, /privacy\.html/);

    assert.ok(existsSync(path.join(root, 'og-image.png')));
    assert.ok(existsSync(path.join(root, 'favicon.svg')));
    assert.ok(existsSync(path.join(root, 'apple-touch-icon.png')));
    assert.ok(existsSync(path.join(root, 'LICENSE')));
    assert.ok(existsSync(path.join(root, 'SECURITY.md')));
});

test('advertising, analytics, and fake ratings are gone', function () {
    const html = read('index.html');
    const script = read('script.js');

    [html, script].forEach(function (source) {
        assert.doesNotMatch(source, /adsbygoogle/i);
        assert.doesNotMatch(source, /googlesyndication/i);
        assert.doesNotMatch(source, /google-analytics/i);
        assert.doesNotMatch(source, /googletagmanager/i);
        assert.doesNotMatch(source, /\bgtag\s*\(/i);
        assert.doesNotMatch(source, /fonts\.googleapis/i);
        assert.doesNotMatch(source, /cdn\.jsdelivr/i);
        assert.doesNotMatch(source, /cdnjs/i);
        assert.doesNotMatch(source, /aggregateRating/i);
    });

    assert.equal(existsSync(path.join(root, 'ads.txt')), false);
});

test('new-tab links use noopener', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const tags = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)].map(function (match) {
            return match[0];
        });
        tags.forEach(function (tag) {
            assert.match(tag, /rel=["'][^"']*noopener/);
        });
    });
});

test('each page has a single h1', function () {
    pages.forEach(function (page) {
        const matches = read(page).match(/<h1\b/gi) || [];
        assert.equal(matches.length, 1, page + ' should have exactly one h1');
    });
});
