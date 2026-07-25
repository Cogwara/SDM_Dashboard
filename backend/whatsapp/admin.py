from django.contrib import admin
from .models import WhatsAppMessage

@admin.register(WhatsAppMessage)
class WhatsAppMessageAdmin(admin.ModelAdmin):
    list_display = (
        'site_id_str', 
        'sender_name', 
        'extracted_engineer', 
        'extracted_eta', 
        'has_generator_issue', 
        'has_power_issue', 
        'has_battery_issue', 
        'has_transmission_issue', 
        'created_at'
    )
    list_filter = (
        'has_power_issue', 
        'has_generator_issue', 
        'has_fuel_issue', 
        'has_battery_issue', 
        'has_transmission_issue', 
        'created_at'
    )
    search_fields = (
        'site_id_str', 
        'sender_name', 
        'message_text', 
        'extracted_engineer', 
        'extracted_customer_update',
        'extracted_eta'
    )
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    list_per_page = 50

    fieldsets = (
        ('WhatsApp Message Info', {
            'fields': ('site', 'site_id_str', 'sender_name', 'message_text', 'timestamp')
        }),
        ('Extracted Intelligence & Field Dispatches', {
            'fields': ('extracted_engineer', 'extracted_customer_update', 'extracted_eta', 'extracted_arrival_time', 'extracted_restoration_time')
        }),
        ('Issue Classification Flags', {
            'fields': ('has_power_issue', 'has_generator_issue', 'has_fuel_issue', 'has_battery_issue', 'has_transmission_issue')
        }),
        ('Metadata', {
            'fields': ('created_at',)
        }),
    )
