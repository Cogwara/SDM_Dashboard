from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SiteNoteViewSet, SiteAttachmentViewSet, SiteTimelineViewSet

router = DefaultRouter()
router.register(r'notes', SiteNoteViewSet, basename='sitenote')
router.register(r'attachments', SiteAttachmentViewSet, basename='siteattachment')
router.register(r'timeline', SiteTimelineViewSet, basename='sitetimeline')

urlpatterns = [
    path('', include(router.urls)),
]
