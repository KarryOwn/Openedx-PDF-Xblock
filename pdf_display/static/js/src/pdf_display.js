function PDFDisplayXBlock(runtime, element) {
    'use strict';

    console.log('PDFDisplayXBlock initialized');

    const pdfSelect = element.querySelector('#pdf-select');
    const pdfIframe = element.querySelector('#pdf-iframe');
    const uploadForm = element.querySelector('#pdf-upload-form');
    const uploadStatus = element.querySelector('#upload-status');
    const uploadBtn = element.querySelector('#upload-btn');
    const fileInput = element.querySelector('#pdf-file-input');
    const progressBar = element.querySelector('#upload-progress');
    const progressFill = progressBar ? progressBar.querySelector('.bar') : null;
    const iframeLoading = element.querySelector('#iframe-loading');

    const selectHandlerUrl = runtime.handlerUrl(element, 'select_pdf');
    const uploadHandlerUrl = runtime.handlerUrl(element, 'upload_pdf');

    // Helpers
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function announce(msg) {
        if (!uploadStatus) return;
        uploadStatus.textContent = msg;
        uploadStatus.className = 'upload-status';
    }

    function showStatus(message, type) {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = `upload-status ${type}`;
        uploadStatus.style.display = 'block';
    }

    function hideStatus() {
        if (!uploadStatus) return;
        uploadStatus.style.display = 'none';
        uploadStatus.textContent = '';
        uploadStatus.className = 'upload-status';
    }

    function setUploading(isUploading) {
        if (uploadBtn) {
            uploadBtn.disabled = isUploading;
            uploadBtn.textContent = isUploading ? 'Uploading...' : 'Upload PDF';
        }
        if (fileInput) fileInput.disabled = isUploading;
        if (progressBar) progressBar.style.display = isUploading ? 'block' : 'none';
        if (!isUploading && progressFill) progressFill.style.width = '0%';
    }

    function setProgress(percent) {
        if (progressFill) {
            progressFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
            progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
        }
    }

    function setLoading(el, isLoading) {
        if (!el) return;
        if (isLoading) el.classList.add('loading');
        else el.classList.remove('loading');
    }

    function showLoadingOverlay() {
        if (iframeLoading) iframeLoading.classList.remove('hidden');
    }

    function hideLoadingOverlay() {
        if (iframeLoading) iframeLoading.classList.add('hidden');
    }

    // Validate file client-side
    function validateFile() {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return true;
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showStatus('Please select a valid PDF file.', 'error');
            fileInput.value = '';
            return false;
        }
        if (file.size > 10 * 1024 * 1024) {
            showStatus('File too large (max 10MB).', 'error');
            fileInput.value = '';
            return false;
        }
        hideStatus();
        return true;
    }

    // Use XHR for upload to get progress reporting reliably
    function uploadWithXHR(url, formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);

            // Add CSRF header if present (useful in many deployments)
            const csrftoken = getCookie('csrftoken') || getCookie('XSRF-TOKEN');
            if (csrftoken) xhr.setRequestHeader('X-CSRFToken', csrftoken);

            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    setProgress(percent);
                }
            };

            xhr.onload = function () {
                const contentType = xhr.getResponseHeader('Content-Type') || '';
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const json = contentType.indexOf('application/json') !== -1 ? JSON.parse(xhr.responseText) : { success: true, raw: xhr.responseText };
                        resolve(json);
                    } catch (err) {
                        reject(new Error('Invalid JSON response from server'));
                    }
                } else {
                    let message = `Upload failed (status ${xhr.status})`;
                    try {
                        const json = JSON.parse(xhr.responseText);
                        message = json.error || json.message || message;
                    } catch (e) {}
                    reject(new Error(message));
                }
            };

            xhr.onerror = function () {
                reject(new Error('Network error during file upload'));
            };

            xhr.send(formData);
        });
    }

    // Handle selection of a PDF from dropdown
    function handlePDFSelection() {
        const selectedFile = pdfSelect.value;
        if (!selectedFile) return;
        setLoading(pdfSelect, true);
        showLoadingOverlay();

        fetch(selectHandlerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ file: selectedFile })
        })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json().catch(() => { throw new Error('Invalid JSON response from server'); });
        })
        .then(data => {
            if (data.success) {
                // force reload to get updated XBlock state
                location.reload();
            } else {
                throw new Error(data.error || 'Failed to select PDF');
            }
        })
        .catch(err => {
            console.error('Select PDF error:', err);
            showStatus(`Error selecting PDF: ${err.message}`, 'error');
            hideLoadingOverlay();
        })
        .finally(() => {
            setLoading(pdfSelect, false);
        });
    }

    // Handle upload form submit
    function handleFileUpload(event) {
        event.preventDefault();
        if (!validateFile()) return;
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            showStatus('Please select a file to upload.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('pdf_file', file);

        setUploading(true);
        showStatus('Uploading...', ''); // neutral message

        uploadWithXHR(uploadHandlerUrl, formData)
        .then(data => {
            if (data && data.success) {
                showStatus('Upload successful — reloading...', 'success');
                setTimeout(() => location.reload(), 1100);
            } else {
                throw new Error((data && data.error) || 'Upload failed');
            }
        })
        .catch(err => {
            console.error('Upload error:', err);
            showStatus(`Upload failed: ${err.message}`, 'error');
        })
        .finally(() => {
            setUploading(false);
            setProgress(0);
        });
    }

    function setupIframeLoading() {
        if (!pdfIframe) return;
        // show overlay until iframe loads
        if (!iframeLoading) return;
        showLoadingOverlay();
        pdfIframe.addEventListener('load', () => {
            hideLoadingOverlay();
        }, { once: true });

        pdfIframe.addEventListener('error', () => {
            hideLoadingOverlay();
            const parent = pdfIframe.parentNode;
            if (parent) {
                parent.innerHTML = `
                    <div class="alert alert-warning">
                        <strong>Error loading PDF.</strong><br>
                        Please check the file or try a different PDF.
                    </div>`;
            }
        }, { once: true });
    }

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

    init();

    // Public API
    return {
        refresh: () => location.reload(),
        showMessage: (msg, type) => showStatus(msg, type || 'info'),
        getCurrentPDF: () => ({
            url: pdfIframe ? pdfIframe.src : null,
            title: pdfIframe ? pdfIframe.getAttribute('title') : null
        })
    };
}
