# PixelShrink

A local-first image compressor that runs entirely in the browser. No uploads, no accounts, no analytics, no ads, and no artificial file limits.

**Live site:** [compress-image.uk](https://compress-image.uk)

## What it does

- Accepts JPEG, PNG, WebP, and GIF input.
- Compresses with adjustable quality, resizing, and output format.
- Processes files on the device with the File API and Canvas.
- Supports drag and drop, file browsing, and clipboard paste.
- Shows per-file status, errors, dimensions, and savings.
- Downloads individual images or a ZIP of all results.
- Includes a local preview dialog, cancelable progress, and keyboard-friendly controls.
- Works offline after the first visit through a service worker.
- Has no third-party requests, no fonts or icons from CDNs, and no runtime dependencies.

If re-encoding would make a file larger and no resize or format change was requested, PixelShrink keeps the original bytes and labels the row **original kept**.

## Why it is built this way

The app is a static page. Image data never leaves the browser because there is no upload endpoint, no server-side processing, and no analytics or advertising code. The page has a strict Content Security Policy, uses no inline executable JavaScript or inline styles (the only inline script block is non-executable JSON-LD metadata), and contains no externally hosted resources.

The interface is intentionally flat: system fonts, solid surfaces, one accent color plus semantic warning and error colors, and no gradients. This keeps the page small and fast, and keeps the design focused on the tool.

Files that are not supported are skipped instead of silently disappearing: the queue shows a visible notice naming them. Files that cannot be decoded get their own failed row and do not stop the rest of the batch.

## Run locally

The app uses ES modules and a service worker, so serve it over HTTP rather than opening the files directly.

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Or:

```sh
npm run serve
```

## Tests

The test suite uses Node's built-in test runner and has no dependencies.

```sh
npm test
```

This runs syntax checks and the unit/site tests in `test/`. CI runs the same command on every push and pull request.

## Deployment

The production site is a static GitHub Pages deployment with a custom domain (`CNAME`).

1. Push `main` to the repository.
2. In GitHub Pages settings, deploy from the `main` branch at the repository root.
3. Enable **Enforce HTTPS** in GitHub Pages.
4. Optionally add a Cloudflare rule to redirect `www` to the apex domain.

The repository includes a defensive client-side HTTP-to-HTTPS upgrade in `secure.js`, but server/CDN enforcement is the correct fix and should stay enabled.

### Security headers

GitHub Pages does not allow custom response headers. The page-level CSP in each HTML file still applies. Production traffic already passes through Cloudflare, so apply the equivalent HSTS, CSP, frame-protection, and cross-origin headers with Cloudflare Transform Rules. Alternatively, deploy on Cloudflare Pages or Netlify, both of which can honor the included `_headers` file.

`_headers` is written for hosts that support that format. It is ignored by GitHub Pages.

## Project layout

```text
index.html          Compressor page
privacy.html        Privacy policy
404.html            Custom not-found page
styles.css          Flat responsive design system
script.js           UI state, file handling, compression flow
lib.js              Pure helpers: sizing, filenames, CRC32, ZIP writer
register-sw.js      Service worker registration
secure.js           Defensive HTTP -> HTTPS upgrade
sw.js              Offline app-shell cache
manifest.json       Web app manifest
test/               Node test runner tests
_headers            Optional security/caching headers
```

## Browser support

Current Chrome, Edge, Firefox, and Safari. The app uses ES modules, Canvas, `createImageBitmap` with an image-element fallback, `<dialog>` with a simple new-tab fallback, and an optional service worker. Older browsers may miss offline support or the preview dialog.

## Limitations

- The browser's memory and canvas limits are the only file limits. Extremely large images may be scaled down to fit; the result dimensions are shown in the queue.
- GIF and animated WebP input uses the first frame. GIFs are saved as PNG by default so the output is honest about being a still image.
- JPEG cannot store transparency, so transparent areas become white.
- If the browser cannot encode a requested output format, it may fall back to PNG; the UI displays the actual format written.
- Re-encoded images are produced by the browser's canvas encoder, which typically drops EXIF metadata. If the original is kept because it was already smaller, it stays byte-identical and may retain its metadata.
- There is no account, sync, history, or server-side storage.

## Privacy and security

See [privacy.html](privacy.html) and [SECURITY.md](SECURITY.md). In short: images stay local, the page makes no third-party requests, and the app stores nothing between visits. Hosting providers may process standard request logs as described in the privacy policy.

## License

MIT. See [LICENSE](LICENSE).
