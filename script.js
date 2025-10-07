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
        document.getElementById('settingsSection').classList.add('fade-in');
    }

    async compressImages() {
        if (this.images.length === 0) return;

        this.compressedImages = [];
        const settings = this.getCompressionSettings();
        
        // Show loading state
        const compressBtn = document.getElementById('compressBtn');
        const originalText = compressBtn.innerHTML;
        compressBtn.innerHTML = '<div class="spinner mr-2"></div> Compressing...';
        compressBtn.disabled = true;

        try {
            for (let i = 0; i < this.images.length; i++) {
                const compressedImage = await this.compressImage(this.images[i], settings);
                this.compressedImages.push(compressedImage);
            }

            this.showResults();
            this.showToast('Images compressed successfully!');
            
            // Track compression event
            const totalOriginalSize = this.compressedImages.reduce((sum, img) => sum + img.originalSize, 0);
            const totalCompressedSize = this.compressedImages.reduce((sum, img) => sum + img.compressedSize, 0);
            const savingsPercent = Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100);
            
            this.trackEvent('image_compress', 'engagement', `${this.images.length}_images_${savingsPercent}%_savings`);
        } catch (error) {
            this.showToast('Error compressing images', 'error');
            console.error(error);
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
        resultsSection.classList.add('fade-in');

        imageGrid.innerHTML = '';

        this.compressedImages.forEach((image, index) => {
            const card = this.createImageCard(image, index);
            imageGrid.appendChild(card);
        });
    }

    createImageCard(image, index) {
        const card = document.createElement('div');
        card.className = 'image-card fade-in';

        const reductionPercent = Math.round(((image.originalSize - image.compressedSize) / image.originalSize) * 100);
        const reductionClass = reductionPercent > 50 ? 'text-green-600' : reductionPercent > 20 ? 'text-blue-600' : 'text-yellow-600';

        card.innerHTML = `
            <div class="image-preview">
                <img src="${image.url}" alt="${image.originalName}">
                <div class="comparison-badge">${reductionPercent}% Smaller</div>
            </div>
            <div class="compression-stats">
                <div class="stat-row">
                    <span class="stat-label">Original:</span>
                    <span class="stat-value">${this.formatFileSize(image.originalSize)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Compressed:</span>
                    <span class="stat-value ${reductionClass}">${this.formatFileSize(image.compressedSize)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Dimensions:</span>
                    <span class="stat-value">${image.width}×${image.height}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Format:</span>
                    <span class="stat-value">${image.compressedFormat.split('/')[1].toUpperCase()}</span>
                </div>
                <div class="mt-4">
                    <button onclick="imageCompressor.downloadImage(${index})" class="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-all duration-300">
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
        document.getElementById('qualitySlider').value = 80;
        document.getElementById('qualityValue').textContent = '80%';
        document.getElementById('resizeSelect').value = 'original';
        document.getElementById('formatSelect').value = 'original';
        document.getElementById('customSizeSection').classList.add('hidden');
        document.getElementById('customWidth').value = '';
        document.getElementById('customHeight').value = '';
        
        this.showToast('Reset completed');
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

// Initialize the application
const imageCompressor = new ImageCompressor();

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
