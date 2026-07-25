from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WhatsAppMessageViewSet, ImportWhatsAppChatView

router = DefaultRouter()
router.register(r'messages', WhatsAppMessageViewSet, basename='whatsapp-messages')

urlpatterns = [
    path('import/', ImportWhatsAppChatView.as_view(), name='whatsapp-import'),
    path('', include(router.urls)),
]
