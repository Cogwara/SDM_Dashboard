from django.urls import path
from .views import ReportsAnalyticsView

urlpatterns = [
    path('analytics/', ReportsAnalyticsView.as_view(), name='reports-analytics'),
]
