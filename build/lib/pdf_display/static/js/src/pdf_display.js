/* static/js/src/studio_edit.js */

function PDFDisplayStudioXBlock(runtime, element) {
    'use strict';
    
    var $element = $(element);
    var $form = $element.find('.pdf-edit-form');
    var handlerUrl = runtime.handlerUrl(element, 'studio_submit');
    
    // Initialize form validation
    function initializeValidation() {
        $form.on('submit', function(e) {
            e.preventDefault();
            
            var isValid = validateForm();
            if (isValid) {
                saveChanges();
            }
        });
        
        // Real-time validation
        $form.find('input[required]').on('blur', function() {
            validateField($(this));
        });
        
        // URL validation
        $form.find('#pdf_url').on('blur', function() {
            validatePDFUrl($(this));
        });
        
        // Preview functionality
        $form.find('#pdf_url, #width, #height').on('change', function() {
            updatePreview();
        });
    }
    
    function validateForm() {
        var isValid = true;
        var $requiredFields = $form.find('input[required]');
        
        $requiredFields.each(function() {
            if (!validateField($(this))) {
                isValid = false;
            }
        });
        
        return isValid;
    }
    
    function validateField($field) {
        var value = $field.val().trim();
        var fieldName = $field.attr('name');
        var isValid = true;
        
        // Remove existing error styling
        $field.removeClass('error');
        $field.siblings('.error-message').remove();
        
        // Required field validation
        if ($field.attr('required') && !value) {
            showFieldError($field, 'This field is required.');
            isValid = false;
        }
        
        // Specific field validations
        if (fieldName === 'pdf_url' && value) {
            isValid = validatePDFUrl($field);
        } else if ((fieldName === 'width' || fieldName === 'height') && value) {
            isValid = validateDimension($field);
        }
        
        return isValid;
    }
    
    function validatePDFUrl($field) {
        var url = $field.val().trim();
        var isValid = true;
        
        if (!url) {
            return true; // Will be caught by required validation
        }
        
        // Basic URL validation
        try {
            var urlObj = new URL(url, window.location.origin);
            
            // Check if it's likely a PDF
            var pathname = urlObj.pathname.toLowerCase();
            if (!pathname.endsWith('.pdf') && !pathname.includes('pdf')) {
                showFieldWarning($field, 'URL does not appear to be a PDF file.');
            }
            
        } catch (e) {
            // Try relative URL validation
            if (!url.startsWith('/') && !url.startsWith('./')) {
                showFieldError($field, 'Please enter a valid URL.');
                isValid = false;
            }
        }
        
        return isValid;
    }
    
    function validateDimension($field) {
        var value = $field.val().trim();
        var isValid = true;
        
        // Check for valid CSS dimension
        var validPattern = /^(\d+(\.\d+)?(px|%|vh|vw|em|rem)|auto)$/i;
        
        if (!validPattern.test(value)) {
            showFieldError($field, 'Please enter a valid CSS dimension (e.g., 100%, 600px, 80vh).');
            isValid = false;
        }
        
        return isValid;
    }
    
    function showFieldError($field, message) {
        $field.addClass('error');
        var $errorMsg = $('<div class="error-message">' + message + '</div>');
        $field.after($errorMsg);
    }
    
    function showFieldWarning($field, message) {
        $field.addClass('warning');
        var $warningMsg = $('<div class="warning-message">' + message + '</div>');
        $field.after($warningMsg);
    }
    
    function saveChanges() {
        var $submitBtn = $form.find('button[type="submit"]');
        var originalText = $submitBtn.text();
        
        // Show loading state
        $submitBtn.prop('disabled', true).text('Saving...');
        
        // Collect form data
        var formData = {
            display_name: $form.find('#display_name').val(),
            pdf_url: $form.find('#pdf_url').val(),
            pdf_title: $form.find('#pdf_title').val(),
            width: $form.find('#width').val(),
            height: $form.find('#height').val(),
            show_download_button: $form.find('#show_download_button').is(':checked'),
            allow_fullscreen: $form.find('#allow_fullscreen').is(':checked')
        };
        
        // Submit to backend
        $.ajax({
            type: 'POST',
            url: handlerUrl,
            data: JSON.stringify(formData),
            contentType: 'application/json',
            success: function(response) {
                if (response.result === 'success') {
                    showSuccessMessage('Changes saved successfully!');
                    updatePreview();
                    
                    // Notify parent frame (Studio)
                    if (window.parent && window.parent.runtime) {
                        window.parent.runtime.notify('save', {});
                    }
                } else {
                    showErrorMessage('Failed to save changes. Please try again.');
                }
            },
            error: function(xhr, status, error) {
                console.error('Save error:', error);
                showErrorMessage('An error occurred while saving. Please try again.');
            },
            complete: function() {
                // Reset button state
                $submitBtn.prop('disabled', false).text(originalText);
            }
        });
    }
    
    function showSuccessMessage(message) {
        var $alert = $('<div class="alert alert-success alert-dismissible">' +
                      '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
                      message + '</div>');
        $form.prepend($alert);
        
        // Auto-hide after 3 seconds
        setTimeout(function() {
            $alert.fadeOut();
        }, 3000);
    }
    
    function showErrorMessage(message) {
        var $alert = $('<div class="alert alert-danger alert-dismissible">' +
                      '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
                      message + '</div>');
        $form.prepend($alert);
    }
    
    function updatePreview() {
        var $preview = $form.find('.pdf-preview');
        var pdfUrl = $form.find('#pdf_url').val();
        var width = $form.find('#width').val() || '100%';
        var height = $form.find('#height').val() || '400px';
        
        if (pdfUrl) {
            var previewHtml = '<iframe src="' + pdfUrl + '#toolbar=0" ' +
                            'width="' + width + '" height="' + height + '" ' +
                            'style="border: 1px solid #ddd; max-width: 100%;">' +
                            '</iframe>';
            $preview.html(previewHtml);
        } else {
            $preview.html('<div class="preview-placeholder">' +
                         '<p>Enter a PDF URL to see preview</p></div>');
        }
    }
    
    // Handle cancel button
    function setupCancelButton() {
        $form.find('.cancel-button').on('click', function(e) {
            e.preventDefault();
            
            if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
                // Notify parent frame to close editor
                if (window.parent && window.parent.runtime) {
                    window.parent.runtime.notify('cancel', {});
                }
            }
        });
    }
    
    // Auto-save functionality
    function setupAutoSave() {
        var autoSaveTimer;
        var AUTOSAVE_DELAY = 2000; // 2 seconds
        
        $form.find('input, select, textarea').on('input change', function() {
            clearTimeout(autoSaveTimer);
            
            // Only auto-save if form is valid
            autoSaveTimer = setTimeout(function() {
                if (validateForm()) {
                    console.log('Auto-saving...');
                    // Could implement silent save here
                }
            }, AUTOSAVE_DELAY);
        });
    }
    
    // File upload helper (for future enhancement)
    function setupFileUpload() {
        // This could be enhanced to support file uploads to course assets
        var $fileInput = $('<input type="file" accept=".pdf" style="display: none;">');
        $form.append($fileInput);
        
        // Add upload button next to URL field
        var $uploadBtn = $('<button type="button" class="btn btn-secondary btn-sm" ' +
                          'style="margin-left: 5px;">Upload PDF</button>');
        $form.find('#pdf_url').after($uploadBtn);
        
        $uploadBtn.on('click', function() {
            $fileInput.click();
        });
        
        $fileInput.on('change', function() {
            var file = this.files[0];
            if (file && file.type === 'application/pdf') {
                // In a real implementation, this would upload to course assets
                alert('File upload functionality would be implemented here.\n' +
                      'For now, please upload the PDF to your course files and enter the URL.');
            }
        });
    }
    
    // Initialize everything
    $(document).ready(function() {
        initializeValidation();
        setupCancelButton();
        setupAutoSave();
        setupFileUpload();
        updatePreview();
        
        // Focus on first field
        $form.find('#display_name').focus();
    });
    
    // Handle alert dismissals
    $element.on('click', '.alert .close', function() {
        $(this).parent().fadeOut();
    });
    
    // Public API
    return {
        save: saveChanges,
        validate: validateForm,
        reset: function() {
            $form[0].reset();
            updatePreview();
        }
    };
