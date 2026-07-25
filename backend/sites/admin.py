from django.contrib import admin
from .models import Site, Notification

@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = (
        'ihs_site_id', 
        'mtn_id', 
        'sdm_name', 
        'state', 
        'region', 
        'lga', 
        'priority', 
        'operational_status', 
        'is_down', 
        'is_critical', 
        'created_at'
    )
    list_filter = (
        'state', 
        'region', 
        'priority', 
        'operational_status', 
        'is_down', 
        'is_critical'
    )
    search_fields = (
        'ihs_site_id', 
        'mtn_id', 
        'sdm_name', 
        'cluster_name', 
        'site_address', 
        'efs_name', 
        'rto_name',
        'smc_fse_name'
    )
    ordering = ('ihs_site_id',)
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50

    fieldsets = (
        ('Primary Identifiers', {
            'fields': ('ihs_site_id', 'mtn_id', 'cascade', 'priority', 'ncc_site', 'hvc_cluster')
        }),
        ('Operational & Power Specs', {
            'fields': ('operational_status', 'site_configuration', 'power_solution', 'dg_capacity', 'solution_on_site', 'solution_category', 'functionality_mode')
        }),
        ('SDM & Management Directory', {
            'fields': ('sdm_name', 'sdm_phone', 'mtn_rdm_name', 'mtn_rdm_phone', 'mtn_fse_name', 'mtn_fse_phone', 'mtn_rtm_name', 'mtn_rtm_phone')
        }),
        ('Field Engineers & SMC Directory', {
            'fields': ('efs_name', 'efs_phone', 'rto_name', 'rto_phone', 'smc', 'sub_sbc', 'cluster_name', 'smc_fse_name', 'smc_fse_phone', 'smc_rto_name', 'smc_rto_phone', 'smc_hoo_name', 'smc_hoo_phone')
        }),
        ('Geographic Location', {
            'fields': ('site_address', 'region', 'state', 'lga', 'latitude', 'longitude')
        }),
        ('Flags & Raw Data', {
            'fields': ('is_down', 'is_critical', 'raw_data', 'created_at', 'updated_at')
        }),
    )

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'site', 'alert_type', 'is_read', 'created_at')
    list_filter = ('alert_type', 'is_read', 'created_at')
    search_fields = ('title', 'message', 'site__ihs_site_id')
    ordering = ('-created_at',)
    list_per_page = 50
