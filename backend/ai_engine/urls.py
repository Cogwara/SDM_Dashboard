from django.urls import path
from .views import AIAssistantView

urlpatterns = [
    path('query/', AIAssistantView.as_view(), name='ai-query'),
]
