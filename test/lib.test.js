import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_AREA,
    MAX_DIMENSION,
    buildZip,
    computeTargetSize,
    crc32,
    dosDateTime,
    downloadName,
    extensionForMime,
    formatBytes,
    formatLabel,
    isLossy,
    normalizeMime,
    percentSmaller,
    qualityRatio,
    resolveOutputType,
    sanitizeFilename,
    uniqueFilename
} from '../lib.js';

test('formatBytes formats human-readable sizes', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(-1), '0 B');
    assert.equal(formatBytes(1023), '1023 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(10 * 1024), '10 KB');
    assert.equal(formatBytes(1024 * 1024), '1 MB');
    assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
    assert.equal(formatBytes('nope'), '0 B');
});

test('computeTargetSize keeps the original dimensions by default', () => {
    assert.deepEqual(computeTargetSize(4000, 3000), {
        width: 4000,
        height: 3000,
        limited: false
    });
});

test('computeTargetSize handles percentage resizing', () => {
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: '50' }), {
        width: 2000,
        height: 1500,
        limited: false
    });
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: '75' }), {
        width: 3000,
        height: 2250,
        limited: false
    });
});

test('computeTargetSize never returns a zero dimension', () => {
    assert.deepEqual(computeTargetSize(1, 1, { resize: '50' }), {
        width: 1,
        height: 1,
        limited: false
    });
    assert.deepEqual(computeTargetSize(3, 2, { resize: 'custom', customWidth: 0, customHeight: -5 }), {
        width: 3,
        height: 2,
        limited: false
    });
});

test('computeTargetSize uses custom dimensions as a bounding box', () => {
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: 'custom', customWidth: 1000 }), {
        width: 1000,
        height: 750,
        limited: false
    });
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: 'custom', customHeight: 750 }), {
        width: 1000,
        height: 750,
        limited: false
    });
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: 'custom', customWidth: 1000, customHeight: 1000 }), {
        width: 1000,
        height: 750,
        limited: false
    });
});

test('computeTargetSize never upscales', () => {
    assert.deepEqual(computeTargetSize(4000, 3000, { resize: 'custom', customWidth: 8000 }), {
        width: 4000,
        height: 3000,
        limited: false
    });
});

test('computeTargetSize limits enormous canvases', () => {
    const result = computeTargetSize(20000, 10000);
    assert.equal(result.limited, true);
    assert.ok(result.width <= MAX_DIMENSION);
    assert.ok(result.height <= MAX_DIMENSION);
    assert.ok(result.width * result.height <= MAX_AREA);

    const extreme = computeTargetSize(100000, 100);
    assert.equal(extreme.limited, true);
    assert.ok(extreme.width <= MAX_DIMENSION);
    assert.ok(extreme.height <= MAX_DIMENSION);
});

test('computeTargetSize rejects invalid source dimensions', () => {
    assert.throws(() => computeTargetSize(0, 100), RangeError);
    assert.throws(() => computeTargetSize(Number.NaN, 100), RangeError);
});

test('MIME helpers normalize and resolve formats', () => {
    assert.equal(normalizeMime('IMAGE/JPG'), 'image/jpeg');
    assert.equal(formatLabel('image/jpeg'), 'JPEG');
    assert.equal(formatLabel('image/webp'), 'WebP');
    assert.equal(formatLabel('image/unknown'), 'Image');
    assert.equal(extensionForMime('image/jpeg'), 'jpg');
    assert.equal(extensionForMime('image/webp'), 'webp');
    assert.equal(resolveOutputType('image/png', 'auto'), 'image/png');
    assert.equal(resolveOutputType('image/gif', 'auto'), 'image/png');
    assert.equal(resolveOutputType('image/jpeg', 'image/webp'), 'image/webp');
    assert.equal(isLossy('image/jpeg'), true);
    assert.equal(isLossy('image/png'), false);
});

test('qualityRatio clamps to a safe range', () => {
    assert.equal(qualityRatio(80), 0.8);
    assert.equal(qualityRatio(0), 0.01);
    assert.equal(qualityRatio(200), 1);
    assert.equal(qualityRatio('oops'), 0.8);
});

test('percentSmaller reports reductions and increases', () => {
    assert.equal(percentSmaller(1000, 250), 75);
    assert.equal(percentSmaller(1000, 1000), 0);
    assert.equal(percentSmaller(1000, 1250), -25);
    assert.equal(percentSmaller(0, 10), 0);
});

test('filenames are sanitized and made unique', () => {
    assert.equal(sanitizeFilename('a/b\\c?.png'), 'a-b-c-.png');
    assert.equal(sanitizeFilename('   .hidden   '), 'hidden');
    assert.equal(sanitizeFilename(''), 'image');
    assert.equal(downloadName('photo.jpeg', 'image/jpeg'), 'photo-compressed.jpg');
    assert.equal(downloadName('no-extension', 'image/png'), 'no-extension-compressed.png');

    const used = new Set();
    assert.equal(uniqueFilename('photo.jpg', used), 'photo.jpg');
    assert.equal(uniqueFilename('PHOTO.JPG', used), 'PHOTO-2.JPG');
    assert.equal(uniqueFilename('photo.jpg', used), 'photo-3.jpg');
});

test('crc32 matches known values', () => {
    const encoder = new TextEncoder();
    assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926);
    assert.equal(crc32(encoder.encode('hello')), 0x3610a686);
    assert.equal(crc32(new Uint8Array()), 0);
});

test('dosDateTime produces valid archive fields', () => {
    const { dosDate, dosTime } = dosDateTime(new Date(2026, 10, 1, 12, 34, 56));
    assert.equal((dosDate >> 9) + 1980, 2026);
    assert.equal((dosDate >> 5) & 0x0f, 11);
    assert.equal(dosDate & 0x1f, 1);
    assert.equal(dosTime >> 11, 12);
    assert.equal((dosTime >> 5) & 0x3f, 34);
    assert.equal((dosTime & 0x1f) * 2, 56);
});

test('buildZip creates a valid store-method archive', async () => {
    const zip = await buildZip([
        { name: 'one.txt', blob: new Blob(['hello']) },
        { name: 'two.txt', blob: new Blob(['world']) }
    ], new Date(2026, 10, 1, 12, 0, 0));

    assert.equal(zip.type, 'application/zip');
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    assert.equal(view.getUint32(0, true), 0x04034b50);
    assert.equal(view.getUint32(14, true), crc32(new TextEncoder().encode('hello')));
    assert.equal(view.getUint32(18, true), 5);

    const endOffset = bytes.length - 22;
    assert.equal(view.getUint32(endOffset, true), 0x06054b50);
    assert.equal(view.getUint16(endOffset + 10, true), 2);

    const decoder = new TextDecoder();
    assert.ok(decoder.decode(bytes).includes('one.txt'));
    assert.ok(decoder.decode(bytes).includes('two.txt'));
});

test('buildZip rejects unsafe names and missing blobs', async () => {
    await assert.rejects(
        () => buildZip([{ name: '../escape.png', blob: new Blob(['x']) }]),
        /plain file names/
    );
    await assert.rejects(
        () => buildZip([{ name: 'image.png', blob: 'not-a-blob' }]),
        TypeError
    );
});
