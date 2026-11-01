// PixelShrink app logic. Runs entirely on the device; there are no network calls here.
import {
    MAX_DIMENSION,
    buildZip,
    computeTargetSize,
    downloadName,
    formatBytes,
    formatLabel,
    isLossy,
    normalizeMime,
    percentSmaller,
    qualityRatio,
    resolveOutputType,
    uniqueFilename
} from './lib.js?v=20261103';

const EXTENSION_TYPES = new Map([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['gif', 'image/gif']
]);

const STATUS_LABELS = {
    queued: 'Queued',
    working: 'Compressing',
    done: 'Done',
    error: 'Failed'
};

const state = {
    items: [],
    rows: new Map(),
    compressing: false,
    preparingZip: false,
    cancelRequested: false,
    nextId: 1,
    dragDepth: 0,
    preview: null
};

let els = null;

function init() {
    els = {
        dropzone: document.getElementById('dropzone'),
        dropzoneTitle: document.getElementById('dropzone-title'),
        fileInput: document.getElementById('file-input'),
        workspace: document.getElementById('workspace'),
        settingsFieldset: document.getElementById('settings-fieldset'),
        quality: document.getElementById('quality'),
        qualityValue: document.getElementById('quality-value'),
        format: document.getElementById('format'),
        formatHint: document.getElementById('format-hint'),
        resize: document.getElementById('resize'),
        customSize: document.getElementById('custom-size'),
        customWidth: document.getElementById('custom-width'),
        customHeight: document.getElementById('custom-height'),
        compressButton: document.getElementById('compress-button'),
        cancelButton: document.getElementById('cancel-button'),
        clearButton: document.getElementById('clear-button'),
        addButton: document.getElementById('add-button'),
        queueCount: document.getElementById('queue-count'),
        queueNotice: document.getElementById('queue-notice'),
        progressRegion: document.getElementById('progress-region'),
        progressLabel: document.getElementById('progress-label'),
        progressCount: document.getElementById('progress-count'),
        progress: document.getElementById('progress'),
        status: document.getElementById('status'),
        summary: document.getElementById('summary'),
        summaryText: document.getElementById('summary-text'),
        summarySub: document.getElementById('summary-sub'),
        downloadAll: document.getElementById('download-all'),
        fileList: document.getElementById('file-list'),
        previewDialog: document.getElementById('preview-dialog'),
        previewTitle: document.getElementById('preview-title'),
        previewImage: document.getElementById('preview-image'),
        previewMeta: document.getElementById('preview-meta'),
        previewNote: document.getElementById('preview-note'),
        previewDownload: document.getElementById('preview-download'),
        rowTemplate: document.getElementById('file-row-template')
    };

    if (!els.dropzone || !els.fileInput || !els.workspace || !els.fileList || !els.rowTemplate) {
        return;
    }

    els.customWidth.max = String(MAX_DIMENSION);
    els.customHeight.max = String(MAX_DIMENSION);

    bindEvents();
    updateQualityLabel();
    updateFormatHint();
    updateResizeFields();
    updateUI();
}

function bindEvents() {
    els.dropzone.addEventListener('click', function () {
        els.fileInput.click();
    });

    els.addButton.addEventListener('click', function () {
        els.fileInput.click();
    });

    els.fileInput.addEventListener('change', function () {
        const files = els.fileInput.files ? Array.from(els.fileInput.files) : [];
        els.fileInput.value = '';
        addFiles(files);
    });

    els.quality.addEventListener('input', updateQualityLabel);
    els.format.addEventListener('change', updateFormatHint);
    els.resize.addEventListener('change', updateResizeFields);

    els.compressButton.addEventListener('click', startCompression);
    els.cancelButton.addEventListener('click', requestCancel);
    els.clearButton.addEventListener('click', clearAll);
    els.downloadAll.addEventListener('click', downloadAll);
    els.fileList.addEventListener('click', onFileListClick);

    if (els.previewDialog) {
        els.previewDialog.addEventListener('close', cleanupPreview);
        els.previewDialog.addEventListener('click', function (event) {
            if (event.target === els.previewDialog) {
                els.previewDialog.close();
            }
        });

        els.previewDialog.querySelectorAll('[data-close]').forEach(function (button) {
            button.addEventListener('click', function () {
                els.previewDialog.close();
            });
        });

        if (els.previewDownload) {
            els.previewDownload.addEventListener('click', function () {
                if (state.preview) {
                    downloadItem(state.preview.item);
                }
            });
        }
    }

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('paste', handlePaste);
    window.addEventListener('pagehide', handlePageHide);
}

function isBusy() {
    return state.compressing || state.preparingZip;
}

function nextFrame() {
    return new Promise(function (resolve) {
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(function () {
                resolve();
            });
        } else {
            window.setTimeout(resolve, 0);
        }
    });
}

function extensionOf(file) {
    const name = String(file.name || '');
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function resolveSourceType(file) {
    const type = normalizeMime(file.type);
    if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp' || type === 'image/gif') {
        return type;
    }
    return EXTENSION_TYPES.get(extensionOf(file)) || '';
}

function isImageFile(file) {
    const type = normalizeMime(file.type);
    if (type && type !== 'application/octet-stream' && type !== 'binary/octet-stream') {
        return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp' || type === 'image/gif';
    }
    return Boolean(resolveSourceType(file));
}

function setStatus(message, type) {
    if (!els || !els.status) return;
    els.status.textContent = message || '';
    if (message && type) {
        els.status.dataset.type = type;
    } else {
        els.status.removeAttribute('data-type');
    }
}

function setQueueNotice(files) {
    if (!els || !els.queueNotice) return;

    if (!files || !files.length) {
        els.queueNotice.hidden = true;
        els.queueNotice.textContent = '';
        return;
    }

    const names = files.slice(0, 3).map(function (file) {
        return file.name || 'file';
    });
    const extra = files.length > 3 ? ' and ' + (files.length - 3) + ' more' : '';

    els.queueNotice.textContent = 'Skipped ' + files.length + ' file' + (files.length === 1 ? '' : 's') +
        ': ' + names.join(', ') + extra + '. Use JPEG, PNG, WebP, or GIF.';
    els.queueNotice.hidden = false;
}

function updateQualityLabel() {
    els.qualityValue.textContent = els.quality.value + '%';
}

function updateFormatHint() {
    const value = els.format.value;
    if (value === 'image/png') {
        els.formatHint.textContent = 'PNG is lossless. The quality setting is ignored, and files can be larger.';
    } else if (value === 'image/jpeg') {
        els.formatHint.textContent = 'JPEG is small and widely supported. Transparency is filled with white.';
    } else if (value === 'image/webp') {
        els.formatHint.textContent = 'WebP is usually smaller and supports transparency. Quality applies.';
    } else {
        els.formatHint.textContent = 'Keeps the source format. GIFs are saved as PNG. Transparency is preserved unless you choose JPEG.';
    }
}

function updateResizeFields() {
    const isCustom = els.resize.value === 'custom';
    els.customSize.hidden = !isCustom;
}

function readSettings() {
    const dimension = function (value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
    };

    return {
        quality: Number(els.quality.value),
        format: els.format.value,
        resize: els.resize.value,
        customWidth: dimension(els.customWidth.value),
        customHeight: dimension(els.customHeight.value)
    };
}

function addFiles(files) {
    if (isBusy()) {
        setStatus('Wait for the current task to finish before adding more.', 'warning');
        return;
    }

    const input = Array.from(files || []);
    if (!input.length) return;

    const accepted = [];
    const skipped = [];

    input.forEach(function (file) {
        if (isImageFile(file)) {
            accepted.push(file);
        } else {
            skipped.push(file);
        }
    });

    if (!accepted.length) {
        if (state.items.length) {
            setQueueNotice(skipped);
        }
        setStatus(
            'Skipped ' + skipped.length + ' unsupported file' + (skipped.length === 1 ? '' : 's') +
            '. Use JPEG, PNG, WebP, or GIF.',
            'warning'
        );
        return;
    }

    const wasEmpty = state.items.length === 0;
    const added = [];

    accepted.forEach(function (file) {
        let thumbUrl;
        try {
            thumbUrl = URL.createObjectURL(file);
        } catch (error) {
            skipped.push(file);
            return;
        }

        const sourceType = resolveSourceType(file);
        const item = {
            id: 'file-' + state.nextId,
            file: file,
            name: file.name || 'image',
            sourceType: sourceType,
            isGif: sourceType === 'image/gif',
            status: 'queued',
            result: null,
            error: '',
            thumbUrl: thumbUrl
        };

        state.nextId += 1;
        state.items.push(item);
        createRow(item);
        added.push(item);
    });

    if (!added.length) {
        setStatus('Those files could not be opened. Try different images.', 'error');
        return;
    }

    updateUI();

    const addedText = 'Added ' + added.length + ' image' + (added.length === 1 ? '' : 's') + '.';
    const skippedText = skipped.length
        ? ' Skipped ' + skipped.length + ' unsupported file' + (skipped.length === 1 ? '' : 's') +
          '. Use JPEG, PNG, WebP, or GIF.'
        : '';
    setStatus(addedText + skippedText, skipped.length ? 'warning' : 'success');
    setQueueNotice(skipped);

    if (wasEmpty) {
        window.requestAnimationFrame(function () {
            els.workspace.scrollIntoView({ block: 'start' });
        });
    } else {
        const last = added[added.length - 1];
        window.requestAnimationFrame(function () {
            const refs = state.rows.get(last.id);
            if (refs) refs.row.scrollIntoView({ block: 'nearest' });
        });
    }
}

function createRow(item) {
    const fragment = els.rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.file-row');
    const thumb = fragment.querySelector('.file-thumb');
    const placeholder = fragment.querySelector('.file-thumb-placeholder');
    const image = fragment.querySelector('.file-thumb img');
    const name = fragment.querySelector('.file-name');
    const status = fragment.querySelector('.file-status');
    const meta = fragment.querySelector('.file-meta');
    const error = fragment.querySelector('.file-error');
    const original = fragment.querySelector('.file-original');
    const result = fragment.querySelector('.file-result');
    const saving = fragment.querySelector('.file-saving');
    const preview = fragment.querySelector('[data-action="preview"]');
    const download = fragment.querySelector('[data-action="download"]');
    const remove = fragment.querySelector('[data-action="remove"]');

    const showThumbnailFallback = function () {
        image.hidden = true;
        if (placeholder) placeholder.hidden = false;
        if (thumb) thumb.classList.add('is-error');
    };

    row.dataset.id = item.id;
    image.addEventListener('error', showThumbnailFallback);
    if (item.thumbUrl) {
        image.src = item.thumbUrl;
    } else {
        showThumbnailFallback();
    }
    image.alt = '';
    image.title = item.name;
    name.textContent = item.name;
    name.title = item.name;
    meta.textContent = formatItemMeta(item);
    status.textContent = 'Queued';
    error.hidden = true;
    original.textContent = formatBytes(item.file.size);
    result.textContent = '—';
    saving.textContent = '';

    preview.setAttribute('aria-label', 'Preview ' + item.name);
    preview.title = 'Preview ' + item.name;
    download.setAttribute('aria-label', 'Download ' + item.name);
    download.title = 'Download ' + item.name;
    remove.setAttribute('aria-label', 'Remove ' + item.name);
    remove.title = 'Remove ' + item.name;

    preview.disabled = true;
    download.disabled = true;
    remove.disabled = isBusy();

    els.fileList.append(fragment);
    state.rows.set(item.id, {
        row: row,
        image: image,
        name: name,
        status: status,
        meta: meta,
        error: error,
        original: original,
        result: result,
        saving: saving,
        preview: preview,
        download: download,
        remove: remove
    });

    updateRow(item);
}

function formatItemMeta(item) {
    const parts = [];
    if (item.result) {
        parts.push(item.result.width + ' × ' + item.result.height);
    }
    parts.push(formatLabel(item.result ? item.result.type : item.sourceType));
    if (item.result && item.result.keptOriginal) {
        parts.push('original kept');
    }
    if (item.isGif) {
        parts.push('first frame');
    }
    return parts.join(' · ');
}

function updateRow(item) {
    const refs = state.rows.get(item.id);
    if (!refs) return;

    const busy = isBusy();
    const label = STATUS_LABELS[item.status] || 'Queued';
    let statusClass = 'file-status';

    if (item.status === 'working') statusClass += ' is-working';
    if (item.status === 'done') statusClass += ' is-done';
    if (item.status === 'error') statusClass += ' is-error';

    refs.status.textContent = label;
    refs.status.className = statusClass;
    if (item.error) {
        refs.status.title = item.error;
    } else {
        refs.status.removeAttribute('title');
    }

    refs.meta.textContent = formatItemMeta(item);
    refs.original.textContent = formatBytes(item.file.size);
    refs.result.textContent = item.result ? formatBytes(item.result.size) : '—';
    refs.error.hidden = !item.error;
    refs.error.textContent = item.error || '';

    let savingText = '';
    let savingClass = 'file-saving';

    if (item.result) {
        const percent = percentSmaller(item.file.size, item.result.size);
        if (percent > 0) {
            savingText = percent + '% smaller';
            savingClass += ' is-smaller';
        } else if (percent < 0) {
            savingText = Math.abs(percent) + '% larger';
            savingClass += ' is-larger';
        } else {
            savingText = 'Same size';
        }
    }

    refs.saving.textContent = savingText;
    refs.saving.className = savingClass;
    refs.preview.disabled = !item.result || busy;
    refs.download.disabled = !item.result || busy;
    refs.remove.disabled = busy;
    refs.row.dataset.status = item.status;
    refs.row.setAttribute('aria-busy', String(item.status === 'working'));
}

function updateUI() {
    const count = state.items.length;
    const hasItems = count > 0;
    const busy = isBusy();
    const done = state.items.filter(function (item) {
        return item.status === 'done' && item.result;
    }).length;
    const failed = state.items.filter(function (item) {
        return item.status === 'error';
    }).length;
    const waiting = state.items.filter(function (item) {
        return item.status === 'queued';
    }).length;

    els.workspace.hidden = !hasItems;
    els.dropzone.classList.toggle('is-compact', hasItems);
    els.dropzoneTitle.textContent = hasItems ? 'Add more images' : 'Drop images here';

    els.dropzone.disabled = busy;
    els.addButton.disabled = busy;
    els.fileInput.disabled = busy;
    els.clearButton.disabled = !hasItems || busy;
    els.compressButton.disabled = !hasItems || busy;
    els.compressButton.textContent = state.compressing
        ? 'Compressing…'
        : 'Compress ' + count + ' image' + (count === 1 ? '' : 's');
    els.compressButton.setAttribute('aria-busy', String(state.compressing));

    els.cancelButton.hidden = !state.compressing;
    els.cancelButton.disabled = state.cancelRequested;
    els.cancelButton.textContent = state.cancelRequested ? 'Cancelling…' : 'Cancel';
    els.settingsFieldset.disabled = state.compressing;
    els.progressRegion.hidden = !state.compressing;
    els.fileList.setAttribute('aria-busy', String(busy));

    const countParts = [count + ' image' + (count === 1 ? '' : 's')];
    if (state.compressing) {
        countParts.push('compressing');
    } else if (state.preparingZip) {
        countParts.push('preparing ZIP');
    } else {
        if (done) countParts.push(done + ' done');
        if (failed) countParts.push(failed + ' failed');
        if (waiting) countParts.push(waiting + ' waiting');
    }
    els.queueCount.textContent = countParts.join(' · ');

    state.items.forEach(updateRow);
    updateSummary();
}

function updateSummary() {
    if (state.compressing) {
        els.summary.hidden = true;
        els.downloadAll.disabled = true;
        return;
    }

    const doneItems = state.items.filter(function (item) {
        return item.status === 'done' && item.result;
    });
    const failed = state.items.filter(function (item) {
        return item.status === 'error';
    }).length;
    const waiting = state.items.filter(function (item) {
        return item.status === 'queued';
    }).length;

    els.summary.classList.toggle('has-errors', failed > 0);
    els.summary.classList.toggle('has-pending', failed === 0 && waiting > 0);

    if (!doneItems.length) {
        els.summary.hidden = true;
        els.summaryText.textContent = '';
        els.summarySub.textContent = '';
        els.downloadAll.disabled = true;
        return;
    }

    const original = doneItems.reduce(function (total, item) {
        return total + item.file.size;
    }, 0);
    const compressed = doneItems.reduce(function (total, item) {
        return total + item.result.size;
    }, 0);
    const percent = percentSmaller(original, compressed);
    const saving = percent > 0
        ? percent + '% smaller'
        : percent < 0
            ? Math.abs(percent) + '% larger'
            : 'same size';

    const allDone = doneItems.length === state.items.length;
    const labelParts = [
        allDone
            ? doneItems.length + ' image' + (doneItems.length === 1 ? '' : 's') + ' compressed'
            : doneItems.length + ' of ' + state.items.length + ' compressed'
    ];
    if (failed) labelParts.push(failed + ' failed');
    if (waiting) labelParts.push(waiting + ' waiting');

    els.summaryText.textContent = labelParts.join(' · ');
    els.summarySub.textContent = formatBytes(original) + ' → ' + formatBytes(compressed) + ' · ' + saving;
    els.summary.hidden = false;
    els.downloadAll.disabled = isBusy() || doneItems.length === 0;
}

function requestCancel() {
    if (!state.compressing || state.cancelRequested) return;
    state.cancelRequested = true;
    els.cancelButton.disabled = true;
    els.cancelButton.textContent = 'Cancelling…';
    setStatus('Finishing the current image, then stopping.', 'info');
}

async function startCompression() {
    if (isBusy() || !state.items.length) return;

    const settings = readSettings();
    const items = state.items;
    const total = items.length;

    items.forEach(function (item) {
        item.result = null;
        item.error = '';
        item.status = 'queued';
    });

    state.compressing = true;
    state.cancelRequested = false;

    els.progress.max = total;
    els.progress.value = 0;
    els.progressLabel.textContent = 'Preparing…';
    els.progressLabel.removeAttribute('title');
    els.progressCount.textContent = '0 / ' + total;

    updateUI();
    setStatus('Compressing ' + total + ' image' + (total === 1 ? '' : 's') + ' on your device…', 'info');

    let completed = 0;
    let failed = 0;
    let cancelled = false;
    let unexpected = false;

    try {
        for (let index = 0; index < total; index += 1) {
            if (state.cancelRequested) {
                cancelled = true;
                break;
            }

            const item = items[index];
            item.status = 'working';
            item.error = '';
            updateRow(item);
            els.progressLabel.textContent = 'Compressing ' + item.name;
            els.progressLabel.title = item.name;
            els.progressCount.textContent = index + ' / ' + total;

            await nextFrame();

            try {
                const result = await compressFile(item.file, settings);
                item.result = result;
                item.status = 'done';
                completed += 1;
            } catch (error) {
                item.status = 'error';
                item.error = friendlyError(error);
                failed += 1;
            }

            updateRow(item);
            els.progress.value = index + 1;
            els.progressCount.textContent = (index + 1) + ' / ' + total;
            await nextFrame();
        }
    } catch (error) {
        unexpected = true;
    } finally {
        state.compressing = false;
        state.cancelRequested = false;
        state.items.forEach(function (item) {
            if (item.status === 'working') {
                item.status = 'queued';
            }
        });
        els.progressLabel.textContent = 'Compressing images…';
        els.progressLabel.removeAttribute('title');
        updateUI();
    }

    if (unexpected) {
        setStatus('Compression stopped unexpectedly. Try again or use a different image.', 'error');
    } else if (cancelled) {
        const finished = completed
            ? ' ' + completed + ' finished image' + (completed === 1 ? ' is' : 's are') + ' ready to download.'
            : '';
        setStatus('Compression cancelled.' + finished, 'warning');
    } else if (completed > 0 && failed > 0) {
        setStatus('Compressed ' + completed + ' of ' + total + '. ' + failed + ' failed.', 'warning');
    } else if (completed > 0) {
        setStatus('Compressed ' + completed + ' image' + (completed === 1 ? '' : 's') + '.', 'success');
    } else if (failed > 0) {
        setStatus('No images were compressed. Check the errors in the queue.', 'error');
    } else {
        setStatus('Nothing to compress.', 'info');
    }
}

async function compressFile(file, settings) {
    const sourceType = resolveSourceType(file) || 'image/png';
    const requestedType = resolveOutputType(sourceType, settings.format);
    const decoded = await decodeImage(file);
    let canvas = null;

    try {
        const target = computeTargetSize(decoded.width, decoded.height, settings);
        canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;

        const context = canvas.getContext('2d', { alpha: requestedType !== 'image/jpeg' });
        if (!context) {
            throw new Error('Canvas is unavailable.');
        }

        if (requestedType === 'image/jpeg') {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, target.width, target.height);
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, 0, 0, target.width, target.height);

        const quality = isLossy(requestedType) ? qualityRatio(settings.quality) : undefined;
        const blob = await encodeCanvas(canvas, requestedType, quality);
        const actualType = normalizeMime(blob.type || requestedType);
        const sameFormat = actualType === normalizeMime(sourceType);
        const sameDimensions = target.width === decoded.width && target.height === decoded.height;

        if (sameFormat && sameDimensions && blob.size >= file.size) {
            return {
                blob: file,
                size: file.size,
                width: target.width,
                height: target.height,
                type: normalizeMime(sourceType),
                requestedType: requestedType,
                limited: target.limited,
                keptOriginal: true
            };
        }

        return {
            blob: blob,
            size: blob.size,
            width: target.width,
            height: target.height,
            type: actualType,
            requestedType: requestedType,
            limited: target.limited,
            keptOriginal: false
        };
    } finally {
        try {
            decoded.close();
        } catch (error) {
            // Nothing to clean up.
        }
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
    }
}

async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            if (!bitmap.width || !bitmap.height) {
                bitmap.close();
                throw new Error('Image dimensions are invalid.');
            }
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                close: function () {
                    bitmap.close();
                }
            };
        } catch (error) {
            // Fall through to the image element path.
        }
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';

    try {
        if (typeof image.decode === 'function') {
            image.src = url;
            await image.decode();
        } else {
            await new Promise(function (resolve, reject) {
                image.onload = resolve;
                image.onerror = function () {
                    reject(new Error('Could not decode this image.'));
                };
                image.src = url;
            });
        }

        if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error('Image dimensions are invalid.');
        }

        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            close: function () {
                URL.revokeObjectURL(url);
            }
        };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw new Error('Could not decode this image.');
    }
}

function encodeCanvas(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
        if (typeof canvas.toBlob !== 'function') {
            reject(new Error('The browser cannot encode this image.'));
            return;
        }

        try {
            const callback = function (blob) {
                if (blob && blob.size > 0) {
                    resolve(blob);
                } else {
                    reject(new Error('The browser could not encode this image.'));
                }
            };

            if (quality === undefined) {
                canvas.toBlob(callback, type);
            } else {
                canvas.toBlob(callback, type, quality);
            }
        } catch (error) {
            reject(error);
        }
    });
}

function friendlyError(error) {
    const message = String(error && error.message ? error.message : error).toLowerCase();
    if (message.indexOf('decode') !== -1 || message.indexOf('read') !== -1) {
        return 'Could not read this image.';
    }
    if (message.indexOf('encode') !== -1 || message.indexOf('canvas') !== -1 || message.indexOf('blob') !== -1) {
        return 'Could not compress this image.';
    }
    if (message.indexOf('too large') !== -1 || message.indexOf('memory') !== -1) {
        return 'This image is too large for the browser to process.';
    }
    return 'Could not process this image.';
}

function downloadItem(item) {
    if (!item || !item.result) return;
    const name = downloadName(item.file.name, item.result.type);
    downloadBlob(item.result.blob, name);
    setStatus('Download started.', 'success');
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 60000);
}

function dateStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
}

async function downloadAll() {
    if (isBusy()) return;

    const doneItems = state.items.filter(function (item) {
        return item.status === 'done' && item.result;
    });
    if (!doneItems.length) return;

    state.preparingZip = true;
    updateUI();
    setStatus('Building the ZIP on your device…', 'info');

    try {
        const used = new Set();
        const entries = doneItems.map(function (item) {
            return {
                name: uniqueFilename(downloadName(item.file.name, item.result.type), used),
                blob: item.result.blob
            };
        });
        const zip = await buildZip(entries);
        downloadBlob(zip, 'pixelshrink-images-' + dateStamp() + '.zip');
        setStatus('Downloaded a ZIP with ' + entries.length + ' image' + (entries.length === 1 ? '' : 's') + '.', 'success');
    } catch (error) {
        setStatus('Could not create the ZIP. Try downloading images individually.', 'error');
    } finally {
        state.preparingZip = false;
        updateUI();
    }
}

function onFileListClick(event) {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const row = button.closest('.file-row');
    if (!row) return;

    const item = state.items.find(function (candidate) {
        return candidate.id === row.dataset.id;
    });
    if (!item) return;

    const action = button.dataset.action;
    if (action === 'remove') {
        removeItem(item.id);
    } else if (action === 'download') {
        downloadItem(item);
    } else if (action === 'preview') {
        openPreview(item);
    }
}

function removeItem(id) {
    if (isBusy()) return;

    const index = state.items.findIndex(function (item) {
        return item.id === id;
    });
    if (index === -1) return;

    const item = state.items[index];

    if (state.preview && state.preview.item.id === id && els.previewDialog && els.previewDialog.open) {
        els.previewDialog.close();
    }

    URL.revokeObjectURL(item.thumbUrl);

    const refs = state.rows.get(item.id);
    if (refs) {
        refs.row.remove();
    }
    state.rows.delete(item.id);
    state.items.splice(index, 1);

    updateUI();
    setStatus('Image removed.', 'info');

    const next = state.items[index] || state.items[index - 1];
    if (next) {
        const nextRefs = state.rows.get(next.id);
        if (nextRefs) nextRefs.remove.focus();
    } else {
        els.dropzone.focus();
    }
}

function clearAll() {
    if (isBusy()) return;

    if (els.previewDialog && els.previewDialog.open) {
        els.previewDialog.close();
    }

    state.items.forEach(function (item) {
        URL.revokeObjectURL(item.thumbUrl);
    });

    state.items = [];
    state.rows.clear();
    els.fileList.replaceChildren();
    els.fileInput.value = '';
    setQueueNotice(null);

    updateUI();
    setStatus('All images cleared.', 'info');
    els.dropzone.focus();
}

function openPreview(item) {
    if (!item || !item.result) return;
    if (!els.previewDialog) return;
    if (els.previewDialog.open) return;

    cleanupPreview();

    const result = item.result;
    const percent = percentSmaller(item.file.size, result.size);
    const saving = percent > 0
        ? percent + '% smaller'
        : percent < 0
            ? Math.abs(percent) + '% larger'
            : 'same size';

    const url = URL.createObjectURL(result.blob);

    if (typeof els.previewDialog.showModal !== 'function') {
        openInNewTab(url);
        return;
    }

    els.previewTitle.textContent = item.name;
    els.previewImage.alt = item.name;
    els.previewImage.src = url;
    els.previewMeta.textContent = formatBytes(result.size) + ' · ' +
        result.width + ' × ' + result.height + ' · ' +
        formatLabel(result.type) + ' · ' + saving;

    const notes = [];
    if (result.keptOriginal) {
        notes.push('This file was already smaller, so the original was kept.');
    }
    if (item.isGif) {
        notes.push('GIF input is processed from its first frame.');
    }
    if (result.type === 'image/jpeg' &&
        (item.sourceType === 'image/png' || item.sourceType === 'image/webp' || item.sourceType === 'image/gif')) {
        notes.push('JPEG output does not support transparency; any transparent areas were filled with white.');
    }
    if (result.limited) {
        notes.push('This image was scaled down to fit the browser\'s canvas limits.');
    }
    els.previewNote.textContent = notes.join(' ');
    els.previewNote.hidden = notes.length === 0;
    els.previewDownload.setAttribute('aria-label', 'Download ' + item.name);

    state.preview = { item: item, url: url };
    els.previewDialog.showModal();
}

function cleanupPreview() {
    if (state.preview) {
        URL.revokeObjectURL(state.preview.url);
        state.preview = null;
    }
    if (!els) return;
    if (els.previewImage) {
        els.previewImage.removeAttribute('src');
        els.previewImage.alt = '';
    }
    if (els.previewTitle) els.previewTitle.textContent = 'Preview';
    if (els.previewMeta) els.previewMeta.textContent = '';
    if (els.previewNote) {
        els.previewNote.textContent = '';
        els.previewNote.hidden = true;
    }
    if (els.previewDownload) els.previewDownload.removeAttribute('aria-label');
}

function openInNewTab(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 60000);
}

function handleDragEnter(event) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    state.dragDepth += 1;
    els.dropzone.classList.add('is-dragover');
}

function handleDragOver(event) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
    els.dropzone.classList.add('is-dragover');
}

function handleDragLeave() {
    if (!state.dragDepth && !els.dropzone.classList.contains('is-dragover')) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (!state.dragDepth) {
        els.dropzone.classList.remove('is-dragover');
    }
}

function handleDrop(event) {
    const files = event.dataTransfer && event.dataTransfer.files
        ? Array.from(event.dataTransfer.files)
        : [];

    state.dragDepth = 0;
    els.dropzone.classList.remove('is-dragover');

    if (!files.length) return;
    event.preventDefault();

    if (isBusy()) {
        setStatus('Wait for the current task to finish before adding more.', 'warning');
        return;
    }

    addFiles(files);
}

function handlePaste(event) {
    if (isEditableTarget(event.target)) return;

    const files = event.clipboardData && event.clipboardData.files
        ? Array.from(event.clipboardData.files)
        : [];

    if (!files.length) return;
    event.preventDefault();

    if (isBusy()) {
        setStatus('Wait for the current task to finish before adding more.', 'warning');
        return;
    }

    addFiles(files);
}

function hasFileDrag(event) {
    if (!event.dataTransfer || !event.dataTransfer.types) return false;
    return Array.from(event.dataTransfer.types).indexOf('Files') !== -1;
}

function isEditableTarget(target) {
    return target instanceof Element &&
        Boolean(target.closest('input, textarea, select, [contenteditable]'));
}

function handlePageHide(event) {
    if (event.persisted) return;
    state.items.forEach(function (item) {
        URL.revokeObjectURL(item.thumbUrl);
    });
    if (state.preview) {
        URL.revokeObjectURL(state.preview.url);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
