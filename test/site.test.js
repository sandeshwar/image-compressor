import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = function (file) {
    return readFileSync(path.join(root, file), 'utf8');
};
const pages = ['index.html', 'guide.html', 'privacy.html', '404.html'];
const indexable = ['index.html', 'guide.html', 'privacy.html'];

function localPath(reference) {
    const withoutQuery = reference.split('?')[0].split('#')[0];
    return withoutQuery.replace(/^\.\//, '').replace(/^\//, '');
}

function pageTitle(html) {
    const start = html.indexOf('<title>');
    const end = html.indexOf('</title>');
    if (start === -1 || end === -1) return '';
    return html.slice(start + 7, end).replace(/&amp;/g, '&').trim();
}

function metaContent(html, name) {
    const match = html.match(new RegExp('<meta name="' + name + '" content="([^"]*)"'));
    return match ? match[1] : '';
}

function canonicalFor(html) {
    const match = html.match(/<link rel="canonical" href="([^"]+)"/);
    return match ? match[1] : '';
}

function stripJsonLd(html) {
    const marker = '<script type="application/ld+json">';
    let result = html;
    let start = result.indexOf(marker);
    while (start !== -1) {
        const end = result.indexOf('</script>', start);
        if (end === -1) break;
        result = result.slice(0, start) + result.slice(end + 9);
        start = result.indexOf(marker);
    }
    return result;
}

function jsonLdNodes(html) {
    const marker = '<script type="application/ld+json">';
    const nodes = [];
    let start = html.indexOf(marker);
    while (start !== -1) {
        const end = html.indexOf('</script>', start);
        if (end === -1) break;
        const raw = html.slice(start + marker.length, end);
        const data = JSON.parse(raw);
        if (data && Array.isArray(data['@graph'])) {
            nodes.push.apply(nodes, data['@graph']);
        } else if (data) {
            nodes.push(data);
        }
        start = html.indexOf(marker, end + 9);
    }
    return nodes;
}

function visibleText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function scriptTags(html) {
    return html.match(/<script[^>]*>/gi) || [];
}

test('pages declare language, viewport, CSP, and robots directives', function () {
    pages.forEach(function (page) {
        const html = read(page);
        assert.match(html, /<html lang="en-GB">/);
        assert.match(html, /name="viewport"/);
        assert.match(html, /http-equiv="Content-Security-Policy"/);
        assert.match(html, /connect-src 'none'/);
        assert.match(html, /object-src 'none'/);
        assert.match(html, /base-uri 'none'/);
        assert.ok(metaContent(html, 'robots').length > 0, page + ' has no robots meta');
    });
});

test('pages avoid inline scripts, inline styles, and event handlers', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const stripped = stripJsonLd(html);
        scriptTags(stripped).forEach(function (tag) {
            assert.ok(tag.toLowerCase().indexOf('src=') !== -1, page + ' has an inline script');
        });
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
        assert.doesNotMatch(html, /\sstyle\s*=/i);
    });
});

test('pages load no third-party scripts, styles, or images', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const tags = html.match(/<(?:script|link|img)\b[^>]*>/gi) || [];
        tags.forEach(function (tag) {
            const lower = tag.toLowerCase();
            if (lower.startsWith('<script') && (lower.indexOf('src="http') !== -1 || lower.indexOf("src='http") !== -1)) {
                assert.fail(page + ' loads a third-party script: ' + tag);
            }
            if (lower.startsWith('<link') && lower.indexOf('rel="stylesheet"') !== -1 &&
                (lower.indexOf('href="http') !== -1 || lower.indexOf("href='http") !== -1)) {
                assert.fail(page + ' loads a third-party stylesheet: ' + tag);
            }
            if (lower.startsWith('<img') && (lower.indexOf('src="http') !== -1 || lower.indexOf("src='http") !== -1)) {
                assert.fail(page + ' loads a third-party image: ' + tag);
            }
        });
    });

    const css = read('styles.css');
    assert.equal(css.includes('@import'), false);
    assert.equal(css.includes('url(http'), false);
    assert.equal(css.includes('url(https'), false);
});

test('CSS is flat and free of gradient functions', function () {
    const css = read('styles.css');
    assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i);
});

test('local references exist', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(function (match) {
            return match[1];
        });

        references.forEach(function (reference) {
            if (reference.startsWith('http://')) return;
            if (reference.startsWith('https://')) return;
            if (reference.startsWith('#')) return;
            if (reference.startsWith('data:')) return;
            if (reference.startsWith('blob:')) return;
            if (reference.startsWith('mailto:')) return;
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
    assert.equal(script.includes('insertAdjacentHTML'), false);
    assert.equal(script.includes('document.write'), false);
    assert.doesNotMatch(script, /\beval\s*\(/);
    assert.doesNotMatch(script, /\bfetch\s*\(/);
    assert.equal(script.includes('XMLHttpRequest'), false);
    assert.equal(script.includes('WebSocket'), false);
    assert.equal(script.includes('localStorage'), false);
    assert.equal(script.includes('sessionStorage'), false);
    assert.equal(script.includes('https://'), false);
});

test('service worker precaches existing, version-matched assets', function () {
    const sw = read('sw.js');
    const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
    assert.ok(block, 'PRECACHE list is missing');
    const references = [...block[1].matchAll(/'([^']+)'/g)].map(function (match) {
        return match[1];
    });
    assert.ok(references.length >= 10, 'PRECACHE should include the app shell');
    assert.ok(references.indexOf('./guide.html') !== -1, 'PRECACHE should include the guide');

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

test('HTML asset versions match across pages and the service worker', function () {
    const html = read('index.html');
    const versionMatch = html.match(/script\.js\?v=([^"']+)/);
    assert.ok(versionMatch, 'versioned script.js is missing');
    const version = versionMatch[1];

    pages.forEach(function (page) {
        const pageHtml = read(page);
        ['styles.css', 'secure.js', 'register-sw.js'].forEach(function (asset) {
            assert.ok(pageHtml.includes(asset + '?v=' + version), page + ' has a stale ' + asset + ' version');
        });
    });

    const script = read('script.js');
    const sw = read('sw.js');
    assert.ok(script.includes('lib.js?v=' + version), 'lib version does not match script version');
    ['styles.css', 'script.js', 'lib.js', 'register-sw.js', 'secure.js'].forEach(function (asset) {
        assert.ok(sw.includes('./' + asset + '?v=' + version), 'service worker has a stale ' + asset + ' version');
    });
});

test('search metadata is unique and complete', function () {
    const titles = new Set();
    const descriptions = new Set();

    indexable.forEach(function (page) {
        const html = read(page);
        const title = pageTitle(html);
        const description = metaContent(html, 'description');
        const canonical = canonicalFor(html);
        const robots = metaContent(html, 'robots');

        assert.ok(title.length >= 20 && title.length <= 65, page + ' title length is ' + title.length);
        assert.ok(description.length >= 50 && description.length <= 170, page + ' description length is ' + description.length);
        assert.equal(titles.has(title.toLowerCase()), false, 'duplicate title: ' + title);
        assert.equal(descriptions.has(description.toLowerCase()), false, 'duplicate description on ' + page);
        titles.add(title.toLowerCase());
        descriptions.add(description.toLowerCase());
        assert.ok(canonical.startsWith('https://compress-image.uk/'), page + ' canonical is missing or relative');
        assert.ok(robots.indexOf('index') !== -1, page + ' is not indexable');
        assert.ok(robots.indexOf('max-image-preview:large') !== -1, page + ' is missing max-image-preview');
        assert.ok(html.includes('property="og:image"'), page + ' is missing og:image');
        assert.ok(html.includes('og:image:alt'), page + ' is missing og:image:alt');
        assert.ok(html.includes('twitter:image:alt'), page + ' is missing twitter:image:alt');
        assert.ok(html.includes('og:locale'), page + ' is missing og:locale');
        assert.ok((html.split('hreflang=').length - 1) >= 2, page + ' is missing hreflang links');
    });

    assert.equal(canonicalFor(read('404.html')), '', '404 page should not have a canonical URL');
    assert.match(metaContent(read('404.html'), 'robots'), /noindex/);
    assert.ok(read('404.html').includes('noindex, follow'));
});

test('structured data is valid, aligned to visible content, and has no fake ratings', function () {
    pages.forEach(function (page) {
        const html = read(page);
        const nodes = jsonLdNodes(html);
        assert.equal(html.includes('aggregateRating'), false, page + ' contains an aggregateRating');
        if (page === '404.html') {
            assert.equal(nodes.length, 0, '404 page should not have structured data');
            return;
        }

        const types = nodes.map(function (node) { return node['@type']; });
        assert.ok(types.length > 0, page + ' has no structured data');

        const text = visibleText(html);
        nodes.filter(function (node) { return node['@type'] === 'FAQPage'; }).forEach(function (faq) {
            faq.mainEntity.forEach(function (question) {
                assert.ok(text.indexOf(question.name) !== -1, page + ' FAQ question is not visible: ' + question.name);
                assert.ok(question.acceptedAnswer.text.length > 20, 'FAQ answer is too short');
            });
        });

        nodes.filter(function (node) { return node['@type'] === 'WebPage' && node.speakable; }).forEach(function (webpage) {
            webpage.speakable.cssSelector.forEach(function (selector) {
                const id = selector.replace('#', '');
                assert.ok(html.includes('id="' + id + '"'), page + ' speakable target is missing: ' + selector);
            });
        });
    });

    const homeTypes = jsonLdNodes(read('index.html')).map(function (node) { return node['@type']; });
    assert.ok(homeTypes.indexOf('WebApplication') !== -1);
    assert.ok(homeTypes.indexOf('HowTo') !== -1);
    assert.ok(homeTypes.indexOf('FAQPage') !== -1);

    const guideTypes = jsonLdNodes(read('guide.html')).map(function (node) { return node['@type']; });
    assert.ok(guideTypes.indexOf('TechArticle') !== -1);
    assert.ok(guideTypes.indexOf('BreadcrumbList') !== -1);
    assert.ok(guideTypes.indexOf('FAQPage') !== -1);

    const privacyTypes = jsonLdNodes(read('privacy.html')).map(function (node) { return node['@type']; });
    assert.ok(privacyTypes.indexOf('WebPage') !== -1);
    assert.ok(privacyTypes.indexOf('BreadcrumbList') !== -1);

    const howTo = jsonLdNodes(read('index.html')).find(function (node) { return node['@type'] === 'HowTo'; });
    assert.equal(howTo.step.length, 3);
});

test('guide and internal links support search, answer engines, and users', function () {
    const home = read('index.html');
    const guide = read('guide.html');
    const privacy = read('privacy.html');

    assert.ok(home.includes('href="./guide.html"'), 'home does not link to the guide');
    assert.ok(guide.includes('href="./"'), 'guide does not link back to the compressor');
    assert.ok(guide.includes('href="./privacy.html"'), 'guide does not link to privacy');
    assert.ok(guide.includes('class="breadcrumbs"'), 'guide is missing visible breadcrumbs');
    assert.ok(privacy.includes('class="breadcrumbs"'), 'privacy is missing visible breadcrumbs');
    assert.ok(guide.includes('id="quick-answer"'), 'guide is missing its answer block');
    assert.ok(guide.includes('rel="noopener noreferrer"'), 'guide external links are missing rel safeguards');
    assert.ok(guide.includes('id="sources"'), 'guide is missing its sources section');
    assert.ok(guide.includes('Suggested citation:'), 'guide is missing a citation line');
});

test('llms.txt, robots.txt, and sitemap expose the search and AI discovery layer', function () {
    const llms = read('llms.txt');
    assert.ok(llms.includes('https://compress-image.uk/'));
    assert.ok(llms.includes('never uploaded'));
    assert.ok(llms.includes('JPEG, PNG, WebP, GIF'));
    assert.ok(llms.includes('GitHub'));
    assert.ok(llms.includes('Last updated'));
    assert.ok(llms.includes('guide.html'));

    const robots = read('robots.txt');
    assert.ok(robots.includes('Sitemap: https://compress-image.uk/sitemap.xml'));
    assert.ok(robots.includes('llms.txt'));
    assert.ok(robots.includes('OAI-SearchBot'));
    assert.ok(robots.includes('PerplexityBot'));
    assert.ok(robots.includes('Google-Extended'));
    assert.ok(robots.includes('GPTBot'));

    const sitemap = read('sitemap.xml');
    assert.ok(sitemap.includes('https://compress-image.uk/'));
    assert.ok(sitemap.includes('https://compress-image.uk/guide.html'));
    assert.ok(sitemap.includes('https://compress-image.uk/privacy.html'));
    const locs = sitemap.split('<loc>').slice(1).map(function (part) {
        return part.split('</loc>')[0].trim();
    });
    locs.forEach(function (loc) {
        const file = loc === 'https://compress-image.uk/' ? 'index.html' : loc.replace('https://compress-image.uk/', '');
        assert.ok(existsSync(path.join(root, file)), 'sitemap URL has no file: ' + loc);
    });
    assert.ok(sitemap.includes('2026-11-01'));
});

test('security and discovery assets are present', function () {
    const headers = read('_headers');
    assert.match(headers, /Content-Security-Policy:/);
    assert.match(headers, /Strict-Transport-Security:/);
    assert.match(headers, /X-Content-Type-Options:/);
    assert.match(headers, /Referrer-Policy:/);
    assert.match(headers, /frame-ancestors 'none'/);

    ['og-image.png', 'favicon.svg', 'apple-touch-icon.png', 'LICENSE', 'SECURITY.md', 'llms.txt'].forEach(function (file) {
        assert.ok(existsSync(path.join(root, file)), file + ' is missing');
    });
    assert.ok(read('index.html').includes('property="og:image:width" content="1200"'));
    assert.ok(read('index.html').includes('property="og:image:height" content="630"'));
});

test('advertising, analytics, and fake ratings are gone', function () {
    const sources = [read('index.html'), read('guide.html'), read('script.js')];
    sources.forEach(function (source) {
        assert.equal(source.includes('adsbygoogle'), false);
        assert.equal(source.includes('googlesyndication'), false);
        assert.equal(source.includes('google-analytics'), false);
        assert.equal(source.includes('googletagmanager'), false);
        assert.equal(source.includes('fonts.googleapis'), false);
        assert.equal(source.includes('cdn.jsdelivr'), false);
        assert.equal(source.includes('cdnjs'), false);
        assert.equal(source.includes('aggregateRating'), false);
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

test('primary controls pair icons with visible text labels', function () {
    const html = read('index.html');
    const css = read('styles.css');

    ['compress-button-label', 'cancel-button-label', 'status-text', 'queue-notice-text', 'summary-text'].forEach(function (id) {
        assert.ok(html.includes('id="' + id + '"'), 'missing text label ' + id);
    });
    assert.equal((html.match(/class="action-label"/g) || []).length, 3);
    assert.ok(html.includes('class="icon file-status-icon"'));
    assert.ok(html.includes('class="status-label"'));
    assert.ok(html.includes('class="icon panel-icon"'));
    assert.ok(html.includes('class="icon label-icon"'));
    assert.ok(css.includes('.file-actions .action-label'));
    assert.ok(css.includes('.file-actions .icon-btn'));
    assert.ok(css.includes('@media (max-width: 760px)'));

    const script = read('script.js');
    assert.ok(script.includes("els.summaryIcon.setAttribute('href', '#icon-'"), 'summary icon states are not wired');
    assert.ok(script.includes("refs.statusIcon.setAttribute('href', '#icon-'"), 'row status icons are not wired');
    assert.ok(script.includes("refs.statusLabel.textContent = label"), 'row status labels are not wired');
});

test('each page has a single h1', function () {
    pages.forEach(function (page) {
        const matches = read(page).match(/<h1\b/gi) || [];
        assert.equal(matches.length, 1, page + ' should have exactly one h1');
    });
});
