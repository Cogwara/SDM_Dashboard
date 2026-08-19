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


class FiberOutageNote(models.Model):
    ticket_number = models.CharField(max_length=50, unique=True, db_index=True)
    site_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    site_a = models.CharField(max_length=100, blank=True, default='')
    site_b = models.CharField(max_length=100, blank=True, default='')
    fiber_route = models.CharField(max_length=255, db_index=True, blank=True, default='')
    provider = models.CharField(max_length=100, default='Huawei', blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    location = models.CharField(max_length=255, blank=True, default='', db_index=True)
    state = models.CharField(max_length=100, blank=True, default='FCT')
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default='High')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Open')
    reported_by = models.CharField(max_length=150, default='State Delivery Manager')
    contact_number = models.CharField(max_length=100, blank=True, default='')
    eta_time = models.CharField(max_length=100, blank=True, default='')
    distance_km = models.FloatField(null=True, blank=True, default=0.0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            import uuid, datetime
            today_str = datetime.datetime.now().strftime("%Y%m%d")
            unique_suffix = str(uuid.uuid4().hex[:4]).upper()
            self.ticket_number = f"FIB-{today_str}-{unique_suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.ticket_number}] {self.fiber_route or self.site_id} - {self.title}"
