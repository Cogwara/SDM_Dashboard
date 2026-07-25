from django.db import models
from sites.models import Site

class WhatsAppMessage(models.Model):
    site = models.ForeignKey(Site, related_name='whatsapp_messages', on_delete=models.SET_NULL, null=True, blank=True)
    site_id_str = models.CharField(max_length=50, db_index=True, blank=True, default='')
    sender_name = models.CharField(max_length=150, blank=True, default='WhatsApp Engine')
    message_text = models.TextField()
    timestamp = models.DateTimeField(null=True, blank=True)
    
    extracted_engineer = models.CharField(max_length=150, blank=True, default='')
    extracted_customer_update = models.TextField(blank=True, default='')
    extracted_eta = models.CharField(max_length=100, blank=True, default='')
    extracted_arrival_time = models.CharField(max_length=100, blank=True, default='')
    extracted_restoration_time = models.CharField(max_length=100, blank=True, default='')
    
    has_power_issue = models.BooleanField(default=False)
    has_generator_issue = models.BooleanField(default=False)
    has_fuel_issue = models.BooleanField(default=False)
    has_battery_issue = models.BooleanField(default=False)
    has_transmission_issue = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"WA Msg [{self.site_id_str}] - {self.sender_name}"
