function PDFDisplayXBlock(runtime, element) {
    'use strict';

    console.log('PDFDisplayXBlock initialized');

    const pdfSelect = element.querySelector('#pdf-select');
    const pdfIframe = element.querySelector('#pdf-iframe');
    const uploadForm = element.querySelector('#pdf-upload-form');
    const uploadStatus = element.querySelector('#upload-status');
    const uploadBtn = element.querySelector('#upload-btn');
    const fileInput = element.querySelector('#pdf-file-input');

    const selectHandlerUrl = runtime.handlerUrl(element, 'select_pdf');
    const uploadHandlerUrl = runtime.handlerUrl(element, 'upload_pdf');

    /**
     * Initialize event listeners
     */
    function init() {
        if (pdfSelect) {
            pdfSelect.addEventListener('change', handlePDFSelection);
        }
        if (uploadForm) {
            uploadForm.addEventListener('submit', handleFileUpload);
        }
        if (fileInput) {
            fileInput.addEventListener('change', validateFile);
        }
        if (pdfIframe) {
            setupIframeLoading();
        }
    }

    /**
     * Handle PDF selection from dropdown
     */
    function handlePDFSelection() {
        const selectedFile = pdfSelect.value;
        if (!selectedFile) return;

        setLoading(pdfSelect, true);

        fetch(selectHandlerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ file: selectedFile })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                location.reload();
            } else {
                throw new Error(data.error || 'Failed to select PDF');
            }
        })
        .catch(err => {
            console.error('Select PDF error:', err);
            showStatus(`Error selecting PDF: ${err.message}`, 'error');
        })
        .finally(() => setLoading(pdfSelect, false));
    }

    /**
     * Validate selected file before upload
     */
    function validateFile() {
        const file = fileInput.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showStatus('Please select a valid PDF file.', 'error');
            fileInput.value = '';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showStatus('File too large (max 10MB).', 'error');
            fileInput.value = '';
            return;
        }
        hideStatus();
    }

    /**
     * Handle PDF upload
     */
    function handleFileUpload(event) {
        event.preventDefault();
        const file = fileInput.files[0];
        if (!file) {
            showStatus('Please select a file to upload.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('pdf_file', file);

        setUploading(true);

        fetch(uploadHandlerUrl, {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showStatus('Upload successful! Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        })
        .catch(err => {
            console.error('Upload error:', err);
            showStatus(`Upload failed: ${err.message}`, 'error');
        })
        .finally(() => setUploading(false));
    }

    /**
     * Setup iframe loading indicator
     */
    function setupIframeLoading() {
        showLoadingOverlay(pdfIframe.parentNode);
        pdfIframe.addEventListener('load', () => hideLoadingOverlay(pdfIframe.parentNode));
        pdfIframe.addEventListener('error', () => showIframeError());
    }

    function showIframeError() {
        pdfIframe.parentNode.innerHTML = `
            <div class="alert alert-warning">
                <strong>Error loading PDF.</strong><br>
                Please check the file or try a different PDF.
            </div>`;
    }

    /**
     * UI helpers
     */
    function showStatus(message, type) {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = `upload-status ${type}`;
        uploadStatus.style.display = 'block';
    }

    function hideStatus() {
        if (uploadStatus) uploadStatus.style.display = 'none';
    }

    function setUploading(isUploading) {
        if (uploadBtn) {
            uploadBtn.disabled = isUploading;
            uploadBtn.textContent = isUploading ? 'Uploading...' : 'Upload PDF';
        }
        if (fileInput) fileInput.disabled = isUploading;
    }

    function setLoading(el, isLoading) {
        if (el) {
            if (isLoading) {
                el.classList.add('loading');
            } else {
                el.classList.remove('loading');
            }
        }
    }

    function showLoadingOverlay(container) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.textContent = 'Loading...';
        container.appendChild(overlay);
    }

    function hideLoadingOverlay(container) {
        const overlay = container.querySelector('.loading-overlay');
        if (overlay) container.removeChild(overlay);
    }

    init();

    /**
     * Public API
     */
    return {
        refresh: () => location.reload(),
        showMessage: (msg, type) => showStatus(msg, type || 'info'),
        getCurrentPDF: () => ({
            url: pdfIframe ? pdfIframe.src : null,
            title: pdfIframe ? pdfIframe.getAttribute('title') : null
        })
    };
}
