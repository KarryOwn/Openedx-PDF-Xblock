function PDFDisplayXBlock(runtime, element) {
    'use strict';

    console.log('PDFDisplayXBlock initialized');

    const pdfSelect = element.querySelector('#pdf-select');
    const pdfIframe = element.querySelector('#pdf-iframe');
    const uploadStatus = element.querySelector('#upload-status');
    const fileInput = element.querySelector('#pdf-file-input'); // may be removed in template
    const progressBar = element.querySelector('#upload-progress'); // may be removed
    const progressFill = progressBar ? progressBar.querySelector('.bar') : null;
    const iframeLoading = element.querySelector('#iframe-loading');
    const listBtn = element.querySelector('#list-pdfs-btn');
    const dynamicPdfList = element.querySelector('#dynamic-pdf-list');

    const selectHandlerUrl = runtime.handlerUrl(element, 'select_pdf');
    const listHandlerUrl = runtime.handlerUrl(element, 'list_pdfs');

    // Helpers
    function showStatus(message, type) {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = `upload-status ${type || ''}`;
        uploadStatus.style.display = 'block';
    }
    function hideStatus() {
        if (!uploadStatus) return;
        uploadStatus.style.display = 'none';
        uploadStatus.textContent = '';
        uploadStatus.className = 'upload-status';
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

    // Populate select with server-provided file list
    function populateList(files) {
        const select = pdfSelect;
        if (!select) return;
        // ensure selector visible
        if (dynamicPdfList) dynamicPdfList.style.display = 'block';
        // clear existing options but keep placeholder
        const placeholder = select.querySelector('option[value=""]') || null;
        select.innerHTML = '';
        if (placeholder) select.appendChild(placeholder);
        files.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.path || f.name || f.url || f.name;
            opt.textContent = f.name + (f.size ? ` (${f.size})` : '');
            // store url on DOM node for quick client-side use
            if (f.url) opt.setAttribute('data-url', f.url);
            select.appendChild(opt);
        });
        // if any files, select first and display it
        if (files.length) {
            select.selectedIndex = 1; // first actual file
            const firstOpt = select.options[select.selectedIndex];
            const url = firstOpt.getAttribute('data-url') || firstOpt.value;
            if (pdfIframe && url) {
                showLoadingOverlay();
                pdfIframe.src = url;
            }
            // also notify server to persist selection (optional)
            selectSelectionOnServer(firstOpt.value);
        }
    }

    function selectSelectionOnServer(value) {
        // tell the XBlock which file was selected (server will attempt to resolve)
        fetch(selectHandlerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ file: value })
        }).then(res => {
            if (!res.ok) throw new Error('Server error');
            return res.json().catch(() => ({}));
        }).then(data => {
            if (!data.success) {
                console.warn('select_pdf response', data);
            }
        }).catch(err => {
            console.warn('Error notifying server of selection', err);
        });
    }

    // Request list of PDFs from server and populate selector
    function requestList() {
        if (!listHandlerUrl) return;
        setLoading(listBtn, true);
        showStatus('Fetching available PDFs...', '');
        fetch(listHandlerUrl, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error('Failed to list PDFs');
            populateList(data.files || []);
            hideStatus();
        })
        .catch(err => {
            console.error('Error listing PDFs', err);
            showStatus('Could not retrieve PDFs: ' + (err.message || ''), 'error');
        })
        .finally(() => setLoading(listBtn, false));
    }

    // When user changes select manually
    function handlePDFSelection() {
        const selectedOpt = pdfSelect && pdfSelect.options[pdfSelect.selectedIndex];
        if (!selectedOpt) return;
        const value = selectedOpt.value;
        const url = selectedOpt.getAttribute('data-url') || value;
        if (pdfIframe && url) {
            showLoadingOverlay();
            pdfIframe.src = url;
        }
        // notify server to persist selection
        selectSelectionOnServer(value);
    }

    function setupIframeLoading() {
        if (!pdfIframe) return;
        if (!iframeLoading) return;
        showLoadingOverlay();
        pdfIframe.addEventListener('load', () => {
            hideLoadingOverlay();
        }, { once: true });
        pdfIframe.addEventListener('error', () => {
            hideLoadingOverlay();
            console.warn('Error loading PDF in iframe');
        }, { once: true });
    }

    function init() {
        if (listBtn) listBtn.addEventListener('click', requestList);
        if (pdfSelect) pdfSelect.addEventListener('change', handlePDFSelection);
        if (pdfIframe) setupIframeLoading();
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
