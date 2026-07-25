from rest_framework import serializers
from .models import WhatsAppMessage

class WhatsAppMessageSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True, default='')

    class Meta:
        model = WhatsAppMessage
        fields = '__all__'
