import os
import json
import logging
import pkg_resources
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import HttpResponse, Http404
from django.conf import settings
from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Boolean, List
from xblockutils.studio_editable import StudioEditableXBlockMixin
from xblockutils.resources import ResourceLoader
from xblock.exceptions import JsonHandlerError

logger = logging.getLogger(__name__)
loader = ResourceLoader(__name__)

class PDFDisplayXBlock(StudioEditableXBlockMixin, XBlock):
    """
    Enhanced PDF Display XBlock with separated static files
    """

    display_name = String(
        display_name="Display Name",
        help="Name shown to students",
        default="PDF Document",
        scope=Scope.settings
    )

    pdf_url = String(
        display_name="PDF URL",
        help="URL of PDF file (external)",
        default="",
        scope=Scope.settings
    )

    pdf_file = String(
        display_name="Uploaded PDF File",
        help="Uploaded PDF file path",
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

    allow_upload = Boolean(
        display_name="Allow File Upload",
        help="Allow students/staff to upload PDF files",
        default=True,
        scope=Scope.settings
    )

    uploaded_files = List(
        display_name="Uploaded Files List",
        help="List of uploaded PDF files",
        default=[],
        scope=Scope.user_state
    )

    # Fields shown in Studio editor
    editable_fields = (
        'display_name', 'pdf_url', 'pdf_file', 'pdf_title',
        'width', 'height', 'show_download_button', 'allow_upload'
    )

    def get_pdf_directory(self):
        """Get the PDF storage directory"""
        pdf_dir = os.path.join(settings.MEDIA_ROOT, 'xblock_pdfs')
        if not os.path.exists(pdf_dir):
            os.makedirs(pdf_dir, exist_ok=True)
        return pdf_dir

    def list_available_pdfs(self):
        """List all available PDF files in the directory"""
        pdf_dir = self.get_pdf_directory()
        pdf_files = []

        if os.path.exists(pdf_dir):
            for filename in os.listdir(pdf_dir):
                if filename.lower().endswith('.pdf'):
                    filepath = os.path.join(pdf_dir, filename)
                    file_size = os.path.getsize(filepath)
                    pdf_files.append({
                        'name': filename,
                        'size': self.format_file_size(file_size),
                        'path': filename
                    })

        return sorted(pdf_files, key=lambda x: x['name'])

    def format_file_size(self, size_bytes):
        """Format file size in human readable format"""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        else:
            return f"{size_bytes / (1024 * 1024):.1f} MB"

    def get_pdf_url(self, filename):
        """Generate URL for PDF file"""
        return self.runtime.handler_url(self, 'serve_pdf', query={'file': filename})

    def student_view(self, context=None):
        """Create student view using separate static files"""

        # Determine which PDF to display
        current_pdf_url = ""
        current_pdf_name = ""

        if self.pdf_file:
            current_pdf_url = self.get_pdf_url(self.pdf_file)
            current_pdf_name = self.pdf_file
        elif self.pdf_url:
            current_pdf_url = self.pdf_url
            current_pdf_name = "External PDF"

        # Get list of available PDFs
        available_pdfs = self.list_available_pdfs()

        # Context for template
        context = {
            'display_name': self.display_name,
            'pdf_title': self.pdf_title,
            'pdf_url': current_pdf_url,
            'pdf_name': current_pdf_name,
            'width': self.width,
            'height': self.height,
            'show_download_button': self.show_download_button,
            'allow_upload': self.allow_upload,
            'available_pdfs': available_pdfs,
            'current_pdf_file': self.pdf_file,
        }

        # Load HTML template
        html = loader.render_django_template(
            'static/html/pdf_display.html',
            context,
            i18n_service=self.runtime.service(self, 'i18n')
        )

        # Create fragment
        frag = Fragment(html)

        # Add CSS
        frag.add_css_url(self.runtime.local_resource_url(self, 'static/css/pdf_display.css'))

        # Add JavaScript - FIXED PATH
        frag.add_javascript_url(self.runtime.local_resource_url(self, 'static/js/src/pdf_display.js'))

        # Initialize JavaScript
        frag.initialize_js('PDFDisplayXBlock')

        return frag

    def studio_view(self, context=None):
        """Studio editing view"""
        # Use default studio view from StudioEditableXBlockMixin
        return super(PDFDisplayXBlock, self).studio_view(context)

    @XBlock.handler
    def select_pdf(self, request, suffix=''):
        """Handler for selecting a PDF file"""
        try:
            data = json.loads(request.body)
            filename = data.get('file', '')

            if filename:
                # Verify file exists
                pdf_dir = self.get_pdf_directory()
                filepath = os.path.join(pdf_dir, filename)

                if os.path.exists(filepath) and filename.lower().endswith('.pdf'):
                    self.pdf_file = filename
                    self.pdf_url = ""  # Clear external URL when using local file
                    return JsonResponse({'success': True})

            return JsonResponse({'success': False, 'error': 'File not found'})

        except Exception as e:
            logger.error(f"Error selecting PDF: {e}")
            return JsonResponse({'success': False, 'error': str(e)})

    @XBlock.handler
    def upload_pdf(self, request, suffix=''):
        """Handler for uploading PDF files"""
        try:
            if 'pdf_file' not in request.FILES:
                return JsonResponse({'success': False, 'error': 'No file provided'})

            uploaded_file = request.FILES['pdf_file']

            # Validate file type
            if not uploaded_file.name.lower().endswith('.pdf'):
                return JsonResponse({'success': False, 'error': 'Only PDF files are allowed'})

            # Validate file size (e.g., max 10MB)
            max_size = 10 * 1024 * 1024  # 10MB
            if uploaded_file.size > max_size:
                return JsonResponse({'success': False, 'error': 'File too large (max 10MB)'})

            # Save file
            pdf_dir = self.get_pdf_directory()
            filename = uploaded_file.name
            filepath = os.path.join(pdf_dir, filename)

            # Handle duplicate filenames
            counter = 1
            original_name, ext = os.path.splitext(filename)
            while os.path.exists(filepath):
                filename = f"{original_name}_{counter}{ext}"
                filepath = os.path.join(pdf_dir, filename)
                counter += 1

            # Save the file
            with open(filepath, 'wb') as f:
                for chunk in uploaded_file.chunks():
                    f.write(chunk)

            # Update XBlock to use the uploaded file
            self.pdf_file = filename
            self.pdf_url = ""  # Clear external URL

            return JsonResponse({'success': True, 'filename': filename})

        except Exception as e:
            logger.error(f"Error uploading PDF: {e}")
            return JsonResponse({'success': False, 'error': str(e)})

    @XBlock.handler
    def serve_pdf(self, request, suffix=''):
        """Handler for serving PDF files"""
        try:
            filename = request.GET.get('file', '')
            if not filename:
                raise Http404("File parameter required")

            # Security: prevent directory traversal
            filename = os.path.basename(filename)
            if not filename.lower().endswith('.pdf'):
                raise Http404("Invalid file type")

            pdf_dir = self.get_pdf_directory()
            filepath = os.path.join(pdf_dir, filename)

            if not os.path.exists(filepath):
                raise Http404("File not found")

            with open(filepath, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'inline; filename="{filename}"'
                return response

        except Exception as e:
            logger.error(f"Error serving PDF: {e}")
            raise Http404("Error serving file")

    @staticmethod
    def workbench_scenarios():
        return [
            ("Enhanced PDF Display XBlock", "<pdf_display/>"),
        ]

# Additional utility function for Django integration
try:
    from django.http import JsonResponse
except ImportError:
    # Fallback for environments without Django
    from django.http import HttpResponse
    import json

    def JsonResponse(data, **kwargs):
        return HttpResponse(
            json.dumps(data),
            content_type='application/json',
            **kwargs
        )
