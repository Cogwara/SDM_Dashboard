from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SiteViewSet, DashboardStatsView, NotificationViewSet, 
    SDMLoginView, SDMListView, RegisterSDMView, SyncFSEAccountsView,
    UserProfileView,
    AssignStateToSDMView, AvailableStatesView, BulkSiteNotesLookupView, TNLLinkViewSet, IHSFiberLinkViewSet, HuaweiFiberLinkViewSet,
    DailyAvailabilityUploadView, DailyAvailabilityStatsView, DailyAvailabilityListView, DailyAvailabilityArchivesView,
    ResetBaseAvailabilityView, DailyAvailabilityExportView, IdentifyHubSitesView,
    SiteToFSELookupView, SiteToFSEExportExcelView,
    HourlyAvailabilityUploadView, HourlyAvailabilityStatsView, HourlyAvailabilityListView,
    ResetHourlyBaseAvailabilityView,
    SiteCellSectorsView, CellSectorListView, KmlStatsView, KmlImportView,
    RDMSupervisedSDMsView,
    WSDStatusView, WSDUploadView, WSDResetBaseView
)

router = DefaultRouter()
router.register(r'sites', SiteViewSet, basename='site')
router.register(r'tnl_links', TNLLinkViewSet, basename='tnl-link')
router.register(r'ihs_fiber_links', IHSFiberLinkViewSet, basename='ihs-fiber-link')
router.register(r'huawei_fiber_links', HuaweiFiberLinkViewSet, basename='huawei-fiber-link')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('sites/bulk_lookup/', BulkSiteNotesLookupView.as_view(), name='bulk-site-lookup'),
    path('sites/identify_hubs/', IdentifyHubSitesView.as_view(), name='identify-hubs'),
    path('sites/lookup_fse/', SiteToFSELookupView.as_view(), name='lookup-fse'),
    path('sites/lookup_fse/export_excel/', SiteToFSEExportExcelView.as_view(), name='lookup-fse-export-excel'),

    # WSD Database Endpoints
    path('wsd/status/', WSDStatusView.as_view(), name='wsd-status'),
    path('wsd/upload/', WSDUploadView.as_view(), name='wsd-upload'),
    path('wsd/reset_base/', WSDResetBaseView.as_view(), name='wsd-reset-base'),
    
    # 4G LTE KML Cell Sectors Endpoints
    path('sites/<str:site_id>/sectors/', SiteCellSectorsView.as_view(), name='site-sectors'),
    path('sectors/', CellSectorListView.as_view(), name='sector-list'),
    path('kml/stats/', KmlStatsView.as_view(), name='kml-stats'),
    path('kml/import/', KmlImportView.as_view(), name='kml-import'),

    # Daily Availability Endpoints
    path('availability/upload/', DailyAvailabilityUploadView.as_view(), name='availability-upload'),
    path('availability/stats/', DailyAvailabilityStatsView.as_view(), name='availability-stats'),
    path('availability/records/', DailyAvailabilityListView.as_view(), name='availability-records'),
    path('availability/archives/', DailyAvailabilityArchivesView.as_view(), name='availability-archives'),
    path('availability/export/', DailyAvailabilityExportView.as_view(), name='availability-export'),
    path('availability/reset_base/', ResetBaseAvailabilityView.as_view(), name='availability-reset-base'),

    # Hourly Availability Endpoints
    path('hourly_availability/upload/', HourlyAvailabilityUploadView.as_view(), name='hourly-availability-upload'),
    path('hourly_availability/stats/', HourlyAvailabilityStatsView.as_view(), name='hourly-availability-stats'),
    path('hourly_availability/records/', HourlyAvailabilityListView.as_view(), name='hourly-availability-records'),
    path('hourly_availability/reset_base/', ResetHourlyBaseAvailabilityView.as_view(), name='hourly-availability-reset-base'),

    # MTN RDM Supervision Endpoints
    path('rdm/sdms/', RDMSupervisedSDMsView.as_view(), name='rdm-supervised-sdms'),

    path('auth/login/', SDMLoginView.as_view(), name='sdm-login'),
    path('auth/profile/', UserProfileView.as_view(), name='user-profile'),
    path('auth/me/', UserProfileView.as_view(), name='user-me'),
    path('auth/sdms/', SDMListView.as_view(), name='sdm-list'),
    path('auth/register_sdm/', RegisterSDMView.as_view(), name='register-sdm'),
    path('auth/sync_fse_accounts/', SyncFSEAccountsView.as_view(), name='sync-fse-accounts'),
    path('auth/assign_state/', AssignStateToSDMView.as_view(), name='assign-state-sdm'),
    path('auth/states/', AvailableStatesView.as_view(), name='available-states'),
    path('', include(router.urls)),
]
