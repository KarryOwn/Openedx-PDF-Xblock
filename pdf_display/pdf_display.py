import os
import json
import logging
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import HttpResponse, Http404
from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Boolean, List
from xblockutils.studio_editable import StudioEditableXBlockMixin
from xblockutils.resources import ResourceLoader
from xblock.exceptions import JsonHandlerError

# Add JsonResponse import/fallback up front so handlers can always use it
try:
    from django.http import JsonResponse
except Exception:
    def JsonResponse(data, **kwargs):
        return HttpResponse(json.dumps(data), content_type='application/json', **kwargs)

logger = logging.getLogger(__name__)
loader = ResourceLoader(__name__)

class PDFDisplayXBlock(StudioEditableXBlockMixin, XBlock):
    """
    Enhanced PDF Display XBlock with working file upload and listing.
    """

    display_name = String(default="PDF Document", scope=Scope.settings)
    pdf_url = String(default="", scope=Scope.settings)
    pdf_file = String(default="", scope=Scope.settings)
    pdf_title = String(default="PDF Document", scope=Scope.settings)
    width = String(default="100%", scope=Scope.settings)
    height = String(default="600px", scope=Scope.settings)
    show_download_button = Boolean(default=True, scope=Scope.settings)
    allow_upload = Boolean(default=True, scope=Scope.settings)
    uploaded_files = List(default=[], scope=Scope.user_state)

    editable_fields = (
        'display_name', 'pdf_url', 'pdf_file', 'pdf_title',
        'width', 'height', 'show_download_button', 'allow_upload'
    )

    def get_pdf_directory(self):
        """Directory prefix in storage"""
        return "xblock_pdfs/"

    def list_available_pdfs(self):
        """List all available PDFs in storage"""
        pdf_dir = self.get_pdf_directory()
        files = []
        try:
            directories, filenames = default_storage.listdir(pdf_dir)
            for f in filenames:
                if f.lower().endswith(".pdf"):
                    size = default_storage.size(pdf_dir + f)
                    files.append({
                        'name': f,
                        'size': self.format_file_size(size),
                        'path': f
                    })
        except Exception as e:
            logger.warning(f"Error listing PDFs: {e}")
        return sorted(files, key=lambda x: x['name'])

    def format_file_size(self, size_bytes):
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        else:
            return f"{size_bytes / (1024 * 1024):.1f} MB"

    def get_pdf_url(self, filename):
        return self.runtime.handler_url(self, 'serve_pdf', query={'file': filename})

    def student_view(self, context=None):
        current_pdf_url = ""
        current_pdf_name = ""

        if self.pdf_file:
            current_pdf_url = self.get_pdf_url(self.pdf_file)
            current_pdf_name = self.pdf_file
        elif self.pdf_url:
            current_pdf_url = self.pdf_url
            current_pdf_name = "External PDF"

        available_pdfs = self.list_available_pdfs()

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

        html = loader.render_django_template(
            'static/html/pdf_display.html',
            context,
            i18n_service=self.runtime.service(self, 'i18n')
        )

        frag = Fragment(html)
        frag.add_css_url(self.runtime.local_resource_url(self, 'static/css/pdf_display.css'))
        frag.add_javascript_url(self.runtime.local_resource_url(self, 'static/js/src/pdf_display.js'))
        frag.initialize_js('PDFDisplayXBlock')
        return frag

    def studio_view(self, context=None):
        return super(PDFDisplayXBlock, self).studio_view(context)

    @XBlock.json_handler
    def list_pdfs(self, data, suffix=''):
        """
        Return a JSON list of available PDFs discovered in:
          - default_storage under 'pdfs/' (e.g. MEDIA_ROOT/pdfs)
          - packaged static folder 'static/files' next to this module (if present)
        Each entry: {name: filename, url: public_url_or_null}
        """
        files = []
        # 1) default storage (uploads / media)
        try:
            storage = default_storage
            media_prefix = 'pdfs'
            if storage.exists(media_prefix):
                _, filenames = storage.listdir(media_prefix)
            else:
                # storage.listdir may still work even if prefix doesn't exist; try listing root then filter
                try:
                    _, filenames = storage.listdir('')
                except Exception:
                    filenames = []
                # keep only those under explicit folder if any
                filenames = [f for f in filenames if f.lower().endswith('.pdf')]
            for fname in filenames:
                if not fname.lower().endswith('.pdf'):
                    continue
                rel = os.path.join(media_prefix, fname)
                try:
                    url = storage.url(rel)
                except Exception:
                    url = None
                files.append({'name': fname, 'url': url, 'source': 'storage', 'path': rel})
        except Exception:
            logger.exception("Error listing PDFs from default storage")

        # 2) packaged static files (package_dir/static/files)
        try:
            pkg_files_dir = os.path.join(os.path.dirname(__file__), 'static', 'files')
            if os.path.isdir(pkg_files_dir):
                for fname in sorted(os.listdir(pkg_files_dir)):
                    if not fname.lower().endswith('.pdf'):
                        continue
                    # try to build a local resource URL via runtime if available
                    url = None
                    try:
                        # runtime.local_resource_url(element, path) is available in many XBlock runtimes
                        url = self.runtime.local_resource_url(self, 'static/files/' + fname)
                    except Exception:
                        # fallback: None (client can attempt to fetch via relative static path)
                        url = None
                    files.append({'name': fname, 'url': url, 'source': 'package', 'path': os.path.join('static', 'files', fname)})
        except Exception:
            logger.exception("Error listing packaged static PDFs")

        return {'success': True, 'files': files}

    @XBlock.handler
    def select_pdf(self, request, suffix=''):
        """
        Select a PDF to display. Accepts a JSON POST with {file: '<name_or_path_or_url>'}
        Attempts to resolve a usable URL for the client iframe.
        """
        try:
            raw = request.body.decode('utf-8') if request.body else ''
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = request.POST or {}
        file_value = payload.get('file') or (request.POST.get('file') if hasattr(request, 'POST') else None)
        if not file_value:
            return HttpResponse(json.dumps({'success': False, 'error': 'no file provided'}), content_type='application/json')

        # If it's already an absolute/relative URL, accept it
        if file_value.startswith('http://') or file_value.startswith('https://') or file_value.startswith('/'):
            self.pdf_url = file_value
            self.pdf_file = ''
            return HttpResponse(json.dumps({'success': True, 'url': self.pdf_url}), content_type='application/json')

        # Try default_storage path 'pdfs/<file_value>'
        try:
            storage_path = os.path.join('pdfs', file_value)
            if default_storage.exists(storage_path):
                try:
                    url = default_storage.url(storage_path)
                    self.pdf_url = url
                    self.pdf_file = file_value
                    return HttpResponse(json.dumps({'success': True, 'url': url}), content_type='application/json')
                except Exception:
                    pass
        except Exception:
            logger.exception("Error resolving file in default storage")

        # Try packaged static files path
        pkg_path = os.path.join(os.path.dirname(__file__), 'static', 'files', file_value)
        if os.path.isfile(pkg_path):
            try:
                url = None
                try:
                    url = self.runtime.local_resource_url(self, 'static/files/' + file_value)
                except Exception:
                    # leave url None; client may construct relative path
                    url = None
                self.pdf_url = url or ''
                self.pdf_file = file_value
                return HttpResponse(json.dumps({'success': True, 'url': url}), content_type='application/json')
            except Exception:
                logger.exception("Error resolving packaged file url")

        return HttpResponse(json.dumps({'success': False, 'error': 'file not found'}), content_type='application/json')

    @XBlock.handler
    def upload_pdf(self, request, suffix=''):
        try:
            # Prefer Django's request.FILES (works in most Django setups)
            if hasattr(request, 'FILES') and 'pdf_file' in request.FILES:
                uploaded = request.FILES['pdf_file']
                filename = uploaded.name
                file_stream = uploaded.read()
                content_length = getattr(uploaded, 'size', len(file_stream))
                logger.debug("Using Django request.FILES for upload: %s (%d bytes)", filename, content_length)
            else:
                # Fallback: try werkzeug parsing (workbench / WSGI)
                try:
                    from werkzeug.formparser import parse_form_data
                    environ = getattr(request, 'environ', None)
                    if environ is None:
                        logger.error("No WSGI environ available for upload parsing")
                        return JsonResponse({'success': False, 'error': 'Invalid request environment'})
                    _, form, files = parse_form_data(environ)
                    if 'pdf_file' not in files:
                        return JsonResponse({'success': False, 'error': 'No file provided'})
                    uploaded = files['pdf_file']
                    filename = getattr(uploaded, 'filename', '')
                    file_stream = uploaded.stream.read()
                    content_length = getattr(uploaded, 'content_length', len(file_stream))
                    logger.debug("Using werkzeug parse_form_data for upload: %s (%s bytes)", filename, content_length)
                except Exception as e:
                    logger.exception("Multipart parse fallback failed: %s", e)
                    return JsonResponse({'success': False, 'error': 'Could not parse multipart data'})

            if not filename:
                return JsonResponse({'success': False, 'error': 'No filename'})

            if not filename.lower().endswith('.pdf'):
                return JsonResponse({'success': False, 'error': 'Only PDF files allowed'})

            max_size = 10 * 1024 * 1024
            if content_length and content_length > max_size:
                return JsonResponse({'success': False, 'error': 'File too large (max 10MB)'})

            pdf_dir = self.get_pdf_directory()
            filepath = pdf_dir + filename
            counter = 1
            name, ext = os.path.splitext(filename)
            while default_storage.exists(filepath):
                filename = f"{name}_{counter}{ext}"
                filepath = pdf_dir + filename
                counter += 1

            default_storage.save(filepath, ContentFile(file_stream))

            self.pdf_file = filename
            self.pdf_url = ""

            logger.info("Uploaded PDF saved: %s", filepath)
            return JsonResponse({'success': True, 'filename': filename})

        except Exception as e:
            logger.exception("Error uploading PDF: %s", e)
            return JsonResponse({'success': False, 'error': str(e)})

    @XBlock.handler
    def serve_pdf(self, request, suffix=''):
        try:
            filename = request.GET.get('file', '')
            if not filename:
                raise Http404("File parameter required")

            filename = os.path.basename(filename)
            if not filename.lower().endswith('.pdf'):
                raise Http404("Invalid file type")

            pdf_dir = self.get_pdf_directory()
            filepath = pdf_dir + filename

            if not default_storage.exists(filepath):
                raise Http404("File not found")

            file_content = default_storage.open(filepath, 'rb').read()
            response = HttpResponse(file_content, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response

        except Exception as e:
            logger.error(f"Error serving PDF: {e}")
            raise Http404("Error serving file")

    @staticmethod
    def workbench_scenarios():
        return [("Enhanced PDF Display XBlock", "<pdf_display/>")]
