// static/js/pdf_display.js

function PDFDisplayXBlock(runtime, element) {
    'use strict';
    
    console.log('Enhanced PDF XBlock initialized');

    // Cache DOM elements
    var pdfSelect = element.querySelector('#pdf-select');
    var pdfIframe = element.querySelector('#pdf-iframe');
    var uploadForm = element.querySelector('#pdf-upload-form');
    var uploadStatus = element.querySelector('#upload-status');
    var uploadBtn = element.querySelector('#upload-btn');
    var fileInput = element.querySelector('#pdf-file-input');

    // Initialize event listeners
    initializeEventListeners();
    
    /**
     * Initialize all event listeners
     */
    function initializeEventListeners() {
        // PDF selection handler
        if (pdfSelect) {
            pdfSelect.addEventListener('change', handlePDFSelection);
        }

        // File upload handler
        if (uploadForm) {
            uploadForm.addEventListener('submit', handleFileUpload);
        }

        // File input change handler for validation
        if (fileInput) {
            fileInput.addEventListener('change', handleFileInputChange);
        }

        // PDF iframe handlers
        if (pdfIframe) {
            setupIframeHandlers();
        }
    }

    /**
     * Handle PDF selection from dropdown
     */
    function handlePDFSelection() {
        var selectedFile = pdfSelect.value;
        
        if (!selectedFile) {
            return;
        }

        // Show loading state
        showLoadingState(pdfSelect);

        var handlerUrl = runtime.handlerUrl(element, 'select_pdf');
        
        fetch(handlerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ file: selectedFile })
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                // Reload page to show selected PDF
                location.reload();
            } else {
                throw new Error(data.error || 'Failed to select PDF');
            }
        })
        .catch(function(error) {
            console.error('Error selecting PDF:', error);
            showUploadStatus('Error selecting PDF: ' + error.message, 'error');
        })
        .finally(function() {
            hideLoadingState(pdfSelect);
        });
    }

    /**
     * Handle file input change for validation
     */
    function handleFileInputChange() {
        var file = fileInput.files[0];
        
        if (file) {
            // Validate file type
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                showUploadStatus('Please select a valid PDF file.', 'error');
                fileInput.value = '';
                return;
            }

            // Validate file size (10MB limit)
            var maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                showUploadStatus('File too large. Maximum size is 10MB.', 'error');
                fileInput.value = '';
                return;
            }

            // Clear any previous error messages
            hideUploadStatus();
        }
    }

    /**
     * Handle file upload
     */
    function handleFileUpload(e) {
        e.preventDefault();
        
        var file = fileInput.files[0];
        
        if (!file) {
            showUploadStatus('Please select a PDF file to upload.', 'error');
            return;
        }

        // Final validation before upload
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showUploadStatus('Please select a valid PDF file.', 'error');
            return;
        }

        var formData = new FormData();
        formData.append('pdf_file', file);

        // Update UI for upload state
        setUploadingState(true);

        var handlerUrl = runtime.handlerUrl(element, 'upload_pdf');
        
        fetch(handlerUrl, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                showUploadStatus('PDF uploaded successfully!', 'success');
                // Reset form
                uploadForm.reset();
                // Reload page to show uploaded file
                setTimeout(function() {
                    location.reload();
                }, 1500);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        })
        .catch(function(error) {
            console.error('Upload error:', error);
            showUploadStatus('Upload failed: ' + error.message, 'error');
        })
        .finally(function() {
            setUploadingState(false);
        });
    }

    /**
     * Setup iframe event handlers
     */
    function setupIframeHandlers() {
        pdfIframe.addEventListener('load', function() {
            console.log('PDF loaded successfully');
            hideLoadingState(pdfIframe.parentNode);
        });

        pdfIframe.addEventListener('error', function() {
            console.error('Error loading PDF');
            showIframeError();
        });

        // Show loading state initially
        showLoadingState(pdfIframe.parentNode);
    }

    /**
     * Show iframe error message
     */
    function showIframeError() {
        var errorHTML = '<div class="alert alert-warning">' +
                       '<strong>Error loading PDF.</strong><br>' +
                       'Please check the file or try a different PDF.' +
                       '</div>';
        pdfIframe.parentNode.innerHTML = errorHTML;
    }

    /**
     * Show upload status message
     */
    function showUploadStatus(message, type) {
        if (!uploadStatus) return;
        
        uploadStatus.textContent = message;
        uploadStatus.className = 'upload-status ' + type;
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(function() {
                hideUploadStatus();
            }, 5000);
        }
    }

    /**
     * Hide upload status message
     */
    function hideUploadStatus() {
        if (!uploadStatus) return;
        
        uploadStatus.style.display = 'none';
        uploadStatus.className = 'upload-status';
    }

    /**
     * Set uploading state UI
     */
    function setUploadingState(isUploading) {
        if (!uploadBtn || !fileInput) return;
        
        uploadBtn.disabled = isUploading;
        fileInput.disabled = isUploading;
        
        if (isUploading) {
            uploadBtn.textContent = 'Uploading...';
            uploadBtn.classList.add('loading');
        } else {
            uploadBtn.textContent = 'Upload PDF';
            uploadBtn.classList.remove('loading');
        }
    }

    /**
     * Show loading state for element
     */
    function showLoadingState(element) {
        if (element) {
            element.classList.add('loading');
        }
    }

    /**
     * Hide loading state for element
     */
    function hideLoadingState(element) {
        if (element) {
            element.classList.remove('loading');
        }
    }

    /**
     * Utility function to handle errors gracefully
     */
    function handleError(error, context) {
        console.error('PDF XBlock Error (' + context + '):', error);
        
        // Show user-friendly error message
        var message = 'An error occurred. Please try again.';
        if (error.message) {
            message = error.message;
        }
        
        showUploadStatus(message, 'error');
    }

    /**
     * Public API - methods that can be called from outside
     */
    return {
        // Method to refresh the PDF list (can be called externally)
        refresh: function() {
            location.reload();
        },
        
        // Method to show a message (can be called externally)
        showMessage: function(message, type) {
            showUploadStatus(message, type || 'info');
        },
        
        // Method to get current PDF info
        getCurrentPDF: function() {
            return {
                url: pdfIframe ? pdfIframe.src : null,
                title: pdfIframe ? p
