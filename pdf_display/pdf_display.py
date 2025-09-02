# pdf_display/pdf_display.py - Minimal working version

from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Boolean
from xblockutils.studio_editable import StudioEditableXBlockMixin


class PDFDisplayXBlock(StudioEditableXBlockMixin, XBlock):
    """
    Minimal PDF Display XBlock - Everything inline to avoid file issues
    """

    display_name = String(
        display_name="Display Name",
        help="Name shown to students",
        default="PDF Document",
        scope=Scope.settings
    )

    pdf_url = String(
        display_name="PDF URL",
        help="URL of PDF file",
        default="",
        scope=Scope.settings
    )

    pdf_title = String(
        display_name="PDF Title",
        help="Title for the PDF",
        default="PDF Document", 
        scope=Scope.settings
    )

    width = String(
        display_name="Width",
        help="Width (e.g., '100%', '800px')",
        default="100%",
        scope=Scope.settings
    )

    height = String(
        display_name="Height",
        help="Height (e.g., '600px')",
        default="600px",
        scope=Scope.settings
    )

    show_download_button = Boolean(
        display_name="Show Download Button",
        help="Display download button",
        default=True,
        scope=Scope.settings
    )

    # Fields shown in Studio editor
    editable_fields = (
        'display_name', 'pdf_url', 'pdf_title', 
        'width', 'height', 'show_download_button'
    )

    def student_view(self, context=None):
        """Create student view with inline HTML/CSS/JS"""
        
        # Build download button HTML
        download_html = ""
        if self.show_download_button and self.pdf_url:
            download_html = f'''
            <div class="pdf-controls">
                <a href="{self.pdf_url}" download target="_blank" class="btn btn-primary">
                    Download PDF
                </a>
            </div>
            '''

        # Build main content
        if self.pdf_url:
            content_html = f'''
            <iframe src="{self.pdf_url}" 
                    width="{self.width}" 
                    height="{self.height}"
                    style="border: 1px solid #ccc; display: block;"
                    title="{self.pdf_title}">
                <p>Your browser does not support PDFs. 
                   <a href="{self.pdf_url}" target="_blank">Download the PDF</a>.
                </p>
            </iframe>
            '''
        else:
            content_html = '''
            <div class="alert alert-warning">
                <strong>No PDF URL configured.</strong><br>
                Please edit this component to add a PDF URL.
            </div>
            '''

        # Complete HTML
        html = f'''
        <div class="pdf-display-xblock">
            <div class="pdf-header">
                <h3>{self.pdf_title}</h3>
                {download_html}
            </div>
            <div class="pdf-content">
                {content_html}
            </div>
        </div>
        '''

        # Create fragment
        frag = Fragment(html)
        
        # Add inline CSS
        frag.add_css('''
            .pdf-display-xblock {
                border: 1px solid #ddd;
                border-radius: 4px;
                margin: 20px 0;
                background: white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .pdf-header {
                padding: 15px 20px;
                background: #f8f9fa;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
            }
            .pdf-header h3 {
                margin: 0;
                font-size: 18px;
                color: #333;
            }
            .pdf-controls {
                margin-top: 10px;
            }
            .btn {
                display: inline-block;
                padding: 8px 16px;
                background: #007cba;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                font-size: 14px;
                transition: background-color 0.3s;
            }
            .btn:hover {
                background: #005a87;
                text-decoration: none;
                color: white;
            }
            .pdf-content {
                padding: 0;
            }
            .alert {
                padding: 15px 20px;
                margin: 0;
                background: #fcf8e3;
                border: 1px solid #faebcc;
                color: #8a6d3b;
            }
            @media (max-width: 768px) {
                .pdf-header {
                    flex-direction: column;
                    align-items: flex-start;
                }
                .pdf-header h3 {
                    font-size: 16px;
                    margin-bottom: 10px;
                }
            }
        ''')

        # Add minimal JavaScript
        frag.add_javascript('''
            function PDFDisplayXBlock(runtime, element) {
                console.log('PDF XBlock initialized');
                
                // Handle iframe loading
                var iframe = element.querySelector('iframe');
                if (iframe) {
                    iframe.onload = function() {
                        console.log('PDF loaded successfully');
                    };
                    
                    iframe.onerror = function() {
                        console.error('Error loading PDF');
                        var fallback = '<div class="alert" style="color: #a94442; background: #f2dede; border-color: #ebccd1;">' +
                                      '<strong>Error loading PDF.</strong><br>' +
                                      'Please check the URL or try downloading directly.' +
                                      '</div>';
                        iframe.parentNode.innerHTML = fallback;
                    };
                }
                
                return {};
            }
        ''')
        
        frag.initialize_js('PDFDisplayXBlock')
        return frag

    @staticmethod
    def workbench_scenarios():
        return [
            ("PDF Display XBlock", "<pdf_display/>"),
        ]