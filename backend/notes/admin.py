from django.contrib import admin
from .models import SiteNote, SiteAttachment, SiteTimeline

class SiteAttachmentInline(admin.TabularInline):
    model = SiteAttachment
    extra = 1
    readonly_fields = ('uploaded_at',)

@admin.register(SiteNote)
class SiteNoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'site', 'category', 'priority', 'status', 'created_by', 'created_at')
    list_filter = ('category', 'priority', 'status', 'created_at')
    search_fields = ('title', 'description', 'site__ihs_site_id', 'created_by')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at')
    inlines = [SiteAttachmentInline]
    list_per_page = 50

@admin.register(SiteAttachment)
class SiteAttachmentAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'site', 'note', 'file_type', 'uploaded_by', 'uploaded_at')
    list_filter = ('file_type', 'uploaded_at')
    search_fields = ('file_name', 'site__ihs_site_id', 'uploaded_by')
    ordering = ('-uploaded_at',)
    readonly_fields = ('uploaded_at',)
    list_per_page = 50

@admin.register(SiteTimeline)
class SiteTimelineAdmin(admin.ModelAdmin):
    list_display = ('event', 'site', 'author', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('event', 'details', 'site__ihs_site_id', 'author')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    list_per_page = 50
