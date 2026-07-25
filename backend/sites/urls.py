from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SiteViewSet, DashboardStatsView, NotificationViewSet, 
    SDMLoginView, SDMListView, RegisterSDMView, 
    AssignStateToSDMView, AvailableStatesView
)

router = DefaultRouter()
router.register(r'sites', SiteViewSet, basename='site')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('auth/login/', SDMLoginView.as_view(), name='sdm-login'),
    path('auth/sdms/', SDMListView.as_view(), name='sdm-list'),
    path('auth/register_sdm/', RegisterSDMView.as_view(), name='register-sdm'),
    path('auth/assign_state/', AssignStateToSDMView.as_view(), name='assign-state-sdm'),
    path('auth/states/', AvailableStatesView.as_view(), name='available-states'),
    path('', include(router.urls)),
]
