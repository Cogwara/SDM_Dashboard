from django.db import models
from django.utils import timezone
from sites.models import Site

CATEGORY_CHOICES = [
    ('Power', 'Power'),
    ('Transmission', 'Transmission'),
    ('Generator', 'Generator'),
    ('Battery', 'Battery'),
    ('Fuel', 'Fuel'),
    ('Microwave', 'Microwave'),
    ('RAN', 'RAN'),
    ('Fiber', 'Fiber'),
    ('Security', 'Security'),
    ('SA Alarms', 'SA Alarms'),
    ('Customer', 'Customer'),
    ('Preventive Maintenance', 'Preventive Maintenance'),
    ('Corrective Maintenance', 'Corrective Maintenance'),
    ('General', 'General'),
]

PRIORITY_CHOICES = [
    ('Low', 'Low'),
    ('Medium', 'Medium'),
    ('High', 'High'),
    ('Critical', 'Critical'),
]

STATUS_CHOICES = [
    ('Open', 'Open'),
    ('In Progress', 'In Progress'),
    ('Resolved', 'Resolved'),
    ('Escalated', 'Escalated'),
]

class SiteNote(models.Model):
    site = models.ForeignKey(Site, related_name='notes', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=100, choices=CATEGORY_CHOICES, default='General')
    tower_co = models.CharField(max_length=100, default='IHS', blank=True, null=True)
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default='Medium')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Open')
    created_by = models.CharField(max_length=150, default='State Delivery Manager')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    smc_fse_name = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.site.ihs_site_id} - {self.title}"

class SiteAttachment(models.Model):
    site = models.ForeignKey(Site, related_name='attachments', on_delete=models.CASCADE)
    note = models.ForeignKey(SiteNote, related_name='attachments', on_delete=models.SET_NULL, null=True, blank=True)
    file = models.FileField(upload_to='attachments/')
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50, default='Other')
    uploaded_by = models.CharField(max_length=150, default='SDM User')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.site.ihs_site_id})"

class SiteTimeline(models.Model):
    site = models.ForeignKey(Site, related_name='timeline', on_delete=models.CASCADE)
    event = models.CharField(max_length=255)
    details = models.TextField(blank=True, default='')
    author = models.CharField(max_length=150, default='System')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Timeline: {self.site.ihs_site_id} - {self.event}"
