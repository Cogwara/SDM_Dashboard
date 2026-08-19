from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SiteNoteViewSet, SiteAttachmentViewSet, SiteTimelineViewSet, FiberOutageNoteViewSet

router = DefaultRouter()
router.register(r'notes', SiteNoteViewSet, basename='sitenote')
router.register(r'fiber_outages', FiberOutageNoteViewSet, basename='fiber-outage-note')
router.register(r'attachments', SiteAttachmentViewSet, basename='siteattachment')
router.register(r'timeline', SiteTimelineViewSet, basename='sitetimeline')

urlpatterns = [
    path('', include(router.urls)),
]
