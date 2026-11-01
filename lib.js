// Pure helpers shared by the browser app and the Node test suite.
// No DOM and no network access live in this file.

export const MAX_DIMENSION = 16384;
export const MAX_AREA = 64_000_000;
export const MIN_DIMENSION = 1;

const MIME_EXTENSIONS = new Map([
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/avif', 'avif']
]);

const MIME_LABELS = new Map([
    ['image/jpeg', 'JPEG'],
    ['image/jpg', 'JPEG'],
    ['image/png', 'PNG'],
    ['image/webp', 'WebP'],
    ['image/gif', 'GIF'],
    ['image/avif', 'AVIF']
]);

const AUTO_OUTPUT = new Map([
    ['image/jpeg', 'image/jpeg'],
    ['image/jpg', 'image/jpeg'],
    ['image/png', 'image/png'],
    ['image/webp', 'image/webp'],
    ['image/gif', 'image/png'],
    ['image/avif', 'image/png']
]);

export function normalizeMime(type) {
    return String(type || '').toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : String(type || '').toLowerCase();
}

export function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024) return `${Math.round(value)} B`;

    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }

    const digits = size < 10 ? 1 : 0;
    return `${size.toFixed(digits).replace(/\.0$/, '')} ${units[unit]}`;
}

export function formatLabel(type) {
    return MIME_LABELS.get(normalizeMime(type)) || 'Image';
}

export function extensionForMime(type) {
    return MIME_EXTENSIONS.get(normalizeMime(type)) || 'png';
}

export function resolveOutputType(sourceType, requestedType) {
    if (requestedType && requestedType !== 'auto') {
        return normalizeMime(requestedType);
    }
    return AUTO_OUTPUT.get(normalizeMime(sourceType)) || 'image/png';
}

export function isLossy(type) {
    const normalized = normalizeMime(type);
    return normalized === 'image/jpeg' || normalized === 'image/webp';
}

export function qualityRatio(quality) {
    const value = Number(quality);
    if (!Number.isFinite(value)) return 0.8;
    return Math.min(1, Math.max(0.01, value / 100));
}

export function percentSmaller(originalSize, compressedSize) {
    const original = Number(originalSize);
    const compressed = Number(compressedSize);
    if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(compressed)) {
        return 0;
    }
    return Math.round((1 - compressed / original) * 100);
}

function positiveInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Math.floor(number);
}

export function computeTargetSize(sourceWidth, sourceHeight, options = {}) {
    const width = Number(sourceWidth);
    const height = Number(sourceHeight);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        throw new RangeError('Image dimensions are invalid.');
    }

    const resize = options.resize || 'original';
    const customWidth = positiveInteger(options.customWidth);
    const customHeight = positiveInteger(options.customHeight);
    let scale = 1;

    if (resize === '75') {
        scale = 0.75;
    } else if (resize === '50') {
        scale = 0.5;
    } else if (resize === 'custom') {
        if (customWidth && customHeight) {
            // Both values act as a bounding box, never a crop.
            scale = Math.min(customWidth / width, customHeight / height);
        } else if (customWidth) {
            scale = customWidth / width;
        } else if (customHeight) {
            scale = customHeight / height;
        }
    }

    scale = Math.min(1, Math.max(0, scale));

    let targetWidth = Math.max(MIN_DIMENSION, Math.round(width * scale));
    let targetHeight = Math.max(MIN_DIMENSION, Math.round(height * scale));
    let limited = false;

    const maxByDimension = Math.min(MAX_DIMENSION / targetWidth, MAX_DIMENSION / targetHeight);
    const maxByArea = Math.sqrt(MAX_AREA / (targetWidth * targetHeight));
    const cap = Math.min(1, maxByDimension, maxByArea);

    if (cap < 1) {
        limited = true;
        targetWidth = Math.max(MIN_DIMENSION, Math.floor(targetWidth * cap));
        targetHeight = Math.max(MIN_DIMENSION, Math.floor(targetHeight * cap));

        // Rounding can leave us a few pixels over the area cap.
        let guard = 0;
        while (targetWidth * targetHeight > MAX_AREA && guard < 1000) {
            if (targetWidth >= targetHeight) {
                targetWidth = Math.max(MIN_DIMENSION, targetWidth - 1);
            } else {
                targetHeight = Math.max(MIN_DIMENSION, targetHeight - 1);
            }
            guard += 1;
        }
    }

    return { width: targetWidth, height: targetHeight, limited };
}

export function sanitizeFilename(name) {
    const cleaned = String(name || '')
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .replace(/^[.\s-]+|[.\s-]+$/g, '')
        .slice(0, 120);

    return cleaned || 'image';
}

export function baseName(name) {
    const cleaned = sanitizeFilename(name);
    const dot = cleaned.lastIndexOf('.');
    if (dot > 0 && dot < cleaned.length - 1) {
        return cleaned.slice(0, dot) || 'image';
    }
    return cleaned;
}

export function downloadName(originalName, mimeType, suffix = '-compressed') {
    return `${baseName(originalName)}${suffix}.${extensionForMime(mimeType)}`;
}

export function uniqueFilename(name, used) {
    const seen = used instanceof Set ? used : new Set();
    let candidate = name;
    let index = 2;

    while (seen.has(candidate.toLowerCase())) {
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        candidate = `${stem}-${index}${extension}`;
        index += 1;
    }

    seen.add(candidate.toLowerCase());
    return candidate;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let checksum = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
        checksum = CRC_TABLE[(checksum ^ bytes[index]) & 0xff] ^ (checksum >>> 8);
    }
    return (checksum ^ 0xffffffff) >>> 0;
}

export function dosDateTime(date = new Date()) {
    const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const year = Math.min(2107, Math.max(1980, source.getFullYear()));
    const dosDate = ((year - 1980) << 9) | ((source.getMonth() + 1) << 5) | source.getDate();
    const dosTime = (source.getHours() << 11) | (source.getMinutes() << 5) | Math.floor(source.getSeconds() / 2);
    return { dosDate, dosTime };
}

export async function buildZip(entries, now = new Date()) {
    const encoder = new TextEncoder();
    const { dosDate, dosTime } = dosDateTime(now);
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const name = String(entry.name || '');
        if (!name || /[\\/]/.test(name)) {
            throw new Error('Archive entries must use plain file names.');
        }

        const blob = entry.blob;
        if (!(blob instanceof Blob)) {
            throw new TypeError('Archive entries must include a Blob.');
        }

        const data = new Uint8Array(await blob.arrayBuffer());
        const nameBytes = encoder.encode(name);
        const checksum = crc32(data);

        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, dosTime, true);
        localView.setUint16(12, dosDate, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, data.length, true);
        localView.setUint32(22, data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        fileParts.push(local, data);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, dosTime, true);
        centralView.setUint16(14, dosDate, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, data.length, true);
        centralView.setUint32(24, data.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        central.set(nameBytes, 46);
        centralParts.push(central);

        offset += local.length + data.length;
    }

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const centralOffset = offset;
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, centralOffset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...fileParts, ...centralParts, end], { type: 'application/zip' });
}
