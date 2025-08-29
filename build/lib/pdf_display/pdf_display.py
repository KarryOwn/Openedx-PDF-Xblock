# pdf_display.py - Main XBlock implementation

import pkg_resources
from django.template import Context, Template
from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Boolean
from xblock.utils.resources import ResourceLoader
from xblockutils.studio_editable import StudioEditableXBlockMixin

loader = ResourceLoader(__name__)


class PDFDisplayXBlock(StudioEditableXBlockMixin, XBlock):
    """
    An XBlock for displaying PDF files in an iframe with fallback options.
    """

    # Editable fields
    display_name = String(
        display_name="Display Name",
        help="The name students see. This name appears in the course ribbon and as a header for the video.",
        default="PDF Document",
        scope=Scope.settings
    )

    pdf_url = String(
        display_name="PDF URL",
        help="The URL of the PDF file to display. Can be a direct link or a file uploaded to the course.",
        default="",
        scope=Scope.settings
    )

    pdf_title = String(
        display_name="PDF Title",
        help="A descriptive title for the PDF document",
        default="PDF Document",
        scope=Scope.settings
    )

    width = String(
        display_name="Width",
        help="Width of the PDF viewer (e.g., '100%', '800px')",
        default="100%",
        scope=Scope.settings
    )

    height = String(
        display_name="Height",
        help="Height of the PDF viewer (e.g., '600px', '80vh')",
        default="600px",
        scope=Scope.settings
    )

    show_download_button = Boolean(
        display_name="Show Download Button",
        help="Whether to show a download button for the PDF",
        default=True,
        scope=Scope.settings
    )

    allow_fullscreen = Boolean(
        display_name="Allow Fullscreen",
        help="Whether to allow fullscreen viewing of the PDF",
        default=True,
        scope=Scope.settings
    )

    # Editable fields configuration for Studio
    editable_fields = (
        'display_name', 'pdf_url', 'pdf_title', 'width', 'height',
        'show_download_button', 'allow_fullscreen'
    )

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        data = pkg_resources.resource_string(__name__, path)
        return data.decode("utf8")

    def student_view(self, context=None):
        """
        Create a fragment used to display the XBlock to a student.
        """
        context = context or {}
        context.update({
            'pdf_url': self.pdf_url,
            'pdf_title': self.pdf_title,
            'width': self.width,
            'height': self.height,
            'show_download_button': self.show_download_button,
            'allow_fullscreen': self.allow_fullscreen,
            'display_name': self.display_name,
        })

        html = self.resource_string("static/html/pdf_display.html")
        frag = Fragment(html.format(**context))
        frag.add_css(self.resource_string("static/css/pdf_display.css"))
        frag.add_javascript(self.resource_string("static/js/src/pdf_display.js"))
        frag.initialize_js('PDFDisplayXBlock')
        return frag

    
    @XBlock.json_handler
    def studio_submit(self, data, suffix=''):
        """
        Called when submitting the form in Studio.
        """
        self.display_name = data.get('display_name')
        self.pdf_url = data.get('pdf_url')
        self.pdf_title = data.get('pdf_title')
        self.width = data.get('width')
        self.height = data.get('height')
        self.show_download_button = data.get('show_download_button', False)
        self.allow_fullscreen = data.get('allow_fullscreen', False)

        return {'result': 'success'}

    # Workbench scenarios
    @staticmethod
    def workbench_scenarios():
        """A canned scenario for display in the workbench."""
        return [
            ("PDFDisplayXBlock",
             """<pdf_display/>
             """),
            ("Multiple PDFDisplayXBlock",
             """<vertical_demo>
                <pdf_display/>
                <pdf_display/>
                <pdf_display/>
                </vertical_demo>
             """),
        ]
