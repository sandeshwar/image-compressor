# Security

PixelShrink is a static, client-side application. Images are read with the File API, processed with Canvas, and downloaded as local blobs. There is no upload endpoint and no server-side image processing.

## Reporting a vulnerability

Please report security issues through the repository's GitHub issue tracker:

https://github.com/sandeshwar/image-compressor/issues

If GitHub's private vulnerability reporting is enabled for the repository, use that instead for sensitive reports. Do not include personal images or secrets in a public issue.

## Security properties

- Strict Content Security Policy with no third-party script, style, font, or image origins.
- No inline executable JavaScript or inline styles; all behavior lives in same-origin files. The only inline script block is non-executable JSON-LD metadata.
- No upload calls, analytics, advertising, cookies, or local storage.
- File names are rendered with `textContent` and attributes, never as HTML.
- Download filenames are sanitized, and ZIP entries are flat names.
- The service worker caches only this site's own app-shell files.

## Deployment notes

- Enable HTTPS enforcement at the hosting layer. `secure.js` is a client-side fallback, not a replacement for a server redirect.
- GitHub Pages cannot set custom response headers. Use Cloudflare or another host that supports the included `_headers` file for HSTS, frame protection, and the full CSP header.
- Keep the service worker cache version current when changing the app shell.

## Out of scope

Browser engine vulnerabilities, the device's local storage, and hosting-provider infrastructure are outside this application's code. Reports about those should go to the relevant vendor.
