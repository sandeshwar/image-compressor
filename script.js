class ImageCompressor {
    constructor() {
        this.images = [];
        this.compressedImages = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.trackPageView();
    }

    // Analytics tracking functions
    trackPageView() {
        if (typeof gtag !== 'undefined') {
            gtag('config', 'G-LZ3449CZV0', {
                page_title: 'Image Compressor',
                page_location: window.location.href
            });
        }
    }

    trackEvent(eventName, category, label) {
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                event_category: category,
                event_label: label
            });
        }
    }

    setupEventListeners() {
        // File input
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

        // Quality slider
        const qualitySlider = document.getElementById('qualitySlider');
        const qualityValue = document.getElementById('qualityValue');
        qualitySlider.addEventListener('input', (e) => {
            qualityValue.textContent = `${e.target.value}%`;
        });

        // Resize select
        const resizeSelect = document.getElementById('resizeSelect');
        const customSizeSection = document.getElementById('customSizeSection');
        resizeSelect.addEventListener('change', (e) => {
            customSizeSection.classList.toggle('hidden', e.target.value !== 'custom');
        });

        // Buttons
        document.getElementById('compressBtn').addEventListener('click', () => this.compressImages());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('downloadAllBtn').addEventListener('click', () => this.downloadAll());
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            this.handleFileSelect(e.dataTransfer.files);
        });
    }

    handleFileSelect(files) {
        const validFiles = Array.from(files).filter(file => {
            if (!file.type.startsWith('image/')) {
                this.showToast(`${file.name} is not an image file`, 'error');
                return false;
            }
            if (file.size > 10 * 1024 * 1024) {
                this.showToast(`${file.name} is larger than 10MB`, 'error');
                return false;
            }
            return true;
        });

        if (validFiles.length > 0) {
            this.images = validFiles;
            this.showSettings();
            this.showToast(`${validFiles.length} image(s) loaded successfully`);
            this.trackEvent('file_upload', 'engagement', `${validFiles.length}_images`);
        }
    }

    showSettings() {
        document.getElementById('settingsSection').classList.remove('hidden');
        document.getElementById('settingsSection').style.animation = 'bounce-in 0.6s ease-out';
        this.showImagePreviews();
    }

    showImagePreviews() {
        const previewSection = document.getElementById('imagePreviewSection');
        const thumbnailContainer = document.getElementById('thumbnailContainer');
        
        if (this.images.length > 0) {
            previewSection.classList.remove('hidden');
            previewSection.style.animation = 'slideInFromTop 0.4s ease-out';
            
            thumbnailContainer.innerHTML = '';
            
            this.images.forEach((image, index) => {
                const thumbnail = this.createThumbnail(image, index);
                thumbnailContainer.appendChild(thumbnail);
            });
        } else {
            previewSection.classList.add('hidden');
        }
    }

    createThumbnail(image, index) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail-item';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            thumbnail.innerHTML = `
                <img src="${e.target.result}" alt="${image.name}">
                <div class="remove-btn" onclick="imageCompressor.removeImage(${index})">
                    <i class="fas fa-times"></i>
                </div>
                <div class="file-info">
                    <div class="truncate">${image.name}</div>
                    <div class="text-xs opacity-80">${this.formatFileSize(image.size)}</div>
                </div>
            `;
        };
        reader.readAsDataURL(image);
        
        return thumbnail;
    }

    removeImage(index) {
        this.images.splice(index, 1);
        this.showImagePreviews();
        
        if (this.images.length === 0) {
            document.getElementById('settingsSection').classList.add('hidden');
            document.getElementById('resultsSection').classList.add('hidden');
        }
        
        this.showToast('Image removed');
    }

    async compressImages() {
        if (this.images.length === 0) return;

        this.compressedImages = [];
        const settings = this.getCompressionSettings();
        
        // Show loading state and progress
        const compressBtn = document.getElementById('compressBtn');
        const originalText = compressBtn.innerHTML;
        compressBtn.innerHTML = '<div class="spinner mr-2"></div> Compressing...';
        compressBtn.disabled = true;

        // Show progress bar
        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        progressContainer.classList.remove('hidden');
        progressContainer.style.animation = 'slideInFromTop 0.4s ease-out';

        try {
            for (let i = 0; i < this.images.length; i++) {
                const compressedImage = await this.compressImage(this.images[i], settings);
                this.compressedImages.push(compressedImage);
                
                // Update progress
                const progress = Math.round(((i + 1) / this.images.length) * 100);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${progress}%`;
                
                // Add delay for visual effect
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Hide progress and show results
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                this.showResults();
                this.showToast('Images compressed successfully!');
                
                // Track compression event
                const totalOriginalSize = this.compressedImages.reduce((sum, img) => sum + img.originalSize, 0);
                const totalCompressedSize = this.compressedImages.reduce((sum, img) => sum + img.compressedSize, 0);
                const savingsPercent = Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100);
                
                this.trackEvent('image_compress', 'engagement', `${this.images.length}_images_${savingsPercent}%_savings`);
            }, 500);
            
        } catch (error) {
            this.showToast('Error compressing images', 'error');
            console.error(error);
            progressContainer.classList.add('hidden');
        } finally {
            compressBtn.innerHTML = originalText;
            compressBtn.disabled = false;
        }
    }

    async compressImage(file, settings) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Calculate new dimensions
                    let { width, height } = this.calculateDimensions(img.width, img.height, settings);
                    
                    canvas.width = width;
                    canvas.height = height;

                    // Draw and compress
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to blob
                    const outputFormat = settings.format === 'original' ? file.type : `image/${settings.format}`;
                    const quality = settings.quality / 100;

                    canvas.toBlob((blob) => {
                        resolve({
                            blob,
                            url: URL.createObjectURL(blob),
                            originalSize: file.size,
                            compressedSize: blob.size,
                            originalName: file.name,
                            originalFormat: file.type,
                            compressedFormat: outputFormat,
                            width,
                            height,
                            originalWidth: img.width,
                            originalHeight: img.height
                        });
                    }, outputFormat, quality);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    calculateDimensions(originalWidth, originalHeight, settings) {
        let width = originalWidth;
        let height = originalHeight;

        if (settings.resize === '50') {
            width = Math.floor(originalWidth * 0.5);
            height = Math.floor(originalHeight * 0.5);
        } else if (settings.resize === '75') {
            width = Math.floor(originalWidth * 0.75);
            height = Math.floor(originalHeight * 0.75);
        } else if (settings.resize === 'custom') {
            width = settings.customWidth || width;
            height = settings.customHeight || height;
            
            // Maintain aspect ratio if only one dimension is provided
            if (settings.customWidth && !settings.customHeight) {
                height = Math.floor((originalHeight / originalWidth) * width);
            } else if (!settings.customWidth && settings.customHeight) {
                width = Math.floor((originalWidth / originalHeight) * height);
            }
        }

        return { width, height };
    }

    getCompressionSettings() {
        const resizeSelect = document.getElementById('resizeSelect');
        const customWidth = document.getElementById('customWidth').value;
        const customHeight = document.getElementById('customHeight').value;

        return {
            quality: parseInt(document.getElementById('qualitySlider').value),
            resize: resizeSelect.value,
            customWidth: customWidth ? parseInt(customWidth) : null,
            customHeight: customHeight ? parseInt(customHeight) : null,
            format: document.getElementById('formatSelect').value
        };
    }

    showResults() {
        const resultsSection = document.getElementById('resultsSection');
        const imageGrid = document.getElementById('imageGrid');
        
        resultsSection.classList.remove('hidden');
        resultsSection.style.animation = 'bounce-in 0.6s ease-out';
        
        imageGrid.innerHTML = '';
        
        this.compressedImages.forEach((image, index) => {
            const card = this.createImageCard(image, index);
            imageGrid.appendChild(card);
            
            // Stagger animation for cards
            setTimeout(() => {
                card.style.animation = 'slideInFromBottom 0.5s ease-out';
            }, index * 150);
        });
    }

    createImageCard(image, index) {
        const card = document.createElement('div');
        card.className = 'card-unique';
        
        const sizeDifference = image.originalSize - image.compressedSize;
        const reductionPercent = Math.round((sizeDifference / image.originalSize) * 100);
        
        // Handle cases where compressed file is larger
        let displayText, badgeClass;
        if (reductionPercent > 0) {
            displayText = `${reductionPercent}% Smaller`;
            badgeClass = 'bg-gradient-to-r from-green-400 to-emerald-400';
        } else if (reductionPercent < 0) {
            displayText = `${Math.abs(reductionPercent)}% Larger`;
            badgeClass = 'bg-gradient-to-r from-orange-400 to-red-400';
        } else {
            displayText = 'Same Size';
            badgeClass = 'bg-gradient-to-r from-gray-400 to-gray-500';
        }
        
        card.innerHTML = `
            <div class="relative">
                <img src="${image.url}" alt="${image.originalName}" class="w-full h-48 object-cover cursor-pointer" onclick="imageCompressor.previewImage(${index})">
                <div class="absolute top-4 right-4 ${badgeClass} text-white px-4 py-2 rounded-full text-sm font-bold">
                    ${displayText}
                </div>
                <div class="absolute top-4 left-4 bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-white/30 transition-all" onclick="imageCompressor.previewImage(${index})">
                    <i class="fas fa-eye mr-1"></i>
                    Preview
                </div>
            </div>
            <div class="p-6">
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <div class="text-white/70 text-sm mb-1">Original</div>
                        <div class="text-white font-semibold">${this.formatFileSize(image.originalSize)}</div>
                    </div>
                    <div>
                        <div class="text-white/70 text-sm mb-1">Compressed</div>
                        <div class="${reductionPercent > 0 ? 'text-green-400' : reductionPercent < 0 ? 'text-orange-400' : 'text-gray-400'} font-semibold">${this.formatFileSize(image.compressedSize)}</div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <div class="text-white/70 text-sm mb-1">Dimensions</div>
                        <div class="text-white font-semibold">${image.width}×${image.height}</div>
                    </div>
                    <div>
                        <div class="text-white/70 text-sm mb-1">Format</div>
                        <div class="text-white font-semibold">${image.compressedFormat.split('/')[1].toUpperCase()}</div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <button onclick="imageCompressor.previewImage(${index})" class="px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/20 transition-all">
                        <i class="fas fa-eye mr-2"></i>
                        Preview
                    </button>
                    <button onclick="imageCompressor.downloadImage(${index})" class="btn-glow">
                        <i class="fas fa-download mr-2"></i>
                        Download
                    </button>
                </div>
            </div>
        `;

        return card;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    downloadImage(index) {
        const image = this.compressedImages[index];
        const link = document.createElement('a');
        link.href = image.url;
        
        // Generate new filename
        const originalName = image.originalName;
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
        const extension = image.compressedFormat.split('/')[1];
        link.download = `${nameWithoutExt}_compressed.${extension}`;
        
        link.click();
        this.showToast('Image downloaded successfully!');
        this.trackEvent('download', 'engagement', `${image.compressedFormat.split('/')[1]}_${this.formatFileSize(image.compressedSize)}`);
    }

    downloadAll() {
        this.compressedImages.forEach((image, index) => {
            setTimeout(() => this.downloadImage(index), index * 100);
        });
    }

    reset() {
        this.images = [];
        this.compressedImages = [];
        document.getElementById('fileInput').value = '';
        document.getElementById('settingsSection').classList.add('hidden');
        document.getElementById('resultsSection').classList.add('hidden');
        document.getElementById('imagePreviewSection').classList.add('hidden');
        document.getElementById('progressContainer').classList.add('hidden');
        document.getElementById('qualitySlider').value = 80;
        document.getElementById('qualityValue').textContent = '80%';
        document.getElementById('resizeSelect').value = 'original';
        document.getElementById('formatSelect').value = 'original';
        document.getElementById('customSizeSection').classList.add('hidden');
        document.getElementById('customWidth').value = '';
        document.getElementById('customHeight').value = '';
        this.closeModal();
        this.showToast('Reset successfully');
    }

    previewImage(index) {
        const image = this.compressedImages[index];
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');
        const modalTitle = document.getElementById('modalTitle');
        const modalInfo = document.getElementById('modalInfo');
        const modalDownloadBtn = document.getElementById('modalDownloadBtn');
        
        modalImage.src = image.url;
        modalTitle.textContent = image.originalName;
        
        const sizeDifference = image.originalSize - image.compressedSize;
        const reductionPercent = Math.round((sizeDifference / image.originalSize) * 100);
        
        modalInfo.innerHTML = `
            <div class="modal-info-item">
                <div class="modal-info-label">Original Size</div>
                <div class="modal-info-value">${this.formatFileSize(image.originalSize)}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Compressed Size</div>
                <div class="modal-info-value">${this.formatFileSize(image.compressedSize)}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Dimensions</div>
                <div class="modal-info-value">${image.width}×${image.height}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Format</div>
                <div class="modal-info-value">${image.compressedFormat.split('/')[1].toUpperCase()}</div>
            </div>
        `;
        
        modalDownloadBtn.onclick = () => this.downloadImage(index);
        
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        this.trackEvent('image_preview', 'engagement', 'modal_open');
    }

    closeModal() {
        const modal = document.getElementById('imageModal');
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'error' : ''}`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const imageCompressor = new ImageCompressor();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            imageCompressor.closeModal();
        }
    });
});

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
