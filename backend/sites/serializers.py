from rest_framework import serializers
from .models import Site, Notification, TNLLink
from notes.models import SiteNote, SiteAttachment, SiteTimeline
from whatsapp.models import WhatsAppMessage

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'

class TNLLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = TNLLink
        fields = '__all__'

class SimpleNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteNote
        fields = '__all__'

class SimpleTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteTimeline
        fields = '__all__'

class SimpleAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteAttachment
        fields = '__all__'

class SimpleWhatsAppMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppMessage
        fields = '__all__'

class SiteSerializer(serializers.ModelSerializer):
    notes_count = serializers.IntegerField(source='notes.count', read_only=True)
    whatsapp_count = serializers.IntegerField(source='whatsapp_messages.count', read_only=True)
    tower_co = serializers.SerializerMethodField()

    def get_tower_co(self, obj):
        if not obj:
            return 'IHS'
        tco = None
        if obj.raw_data and isinstance(obj.raw_data, dict):
            tco = obj.raw_data.get('Tower Co') or obj.raw_data.get('TowerCo') or obj.raw_data.get('Tower_Co')
        if not tco:
            tco = obj.smc
        if tco:
            clean_tco = str(tco).strip()
            if clean_tco.replace('.', '').upper() in ['IHS', 'I H S']:
                return 'IHS'
            return clean_tco
        return 'IHS'

    class Meta:
        model = Site
        fields = '__all__'

class SiteDetailSerializer(serializers.ModelSerializer):
    notes = SimpleNoteSerializer(many=True, read_only=True)
    attachments = SimpleAttachmentSerializer(many=True, read_only=True)
    timeline = SimpleTimelineSerializer(many=True, read_only=True)
    whatsapp_messages = SimpleWhatsAppMessageSerializer(many=True, read_only=True)
    tower_co = serializers.SerializerMethodField()

    def get_tower_co(self, obj):
        if not obj:
            return 'IHS'
        tco = None
        if obj.raw_data and isinstance(obj.raw_data, dict):
            tco = obj.raw_data.get('Tower Co') or obj.raw_data.get('TowerCo') or obj.raw_data.get('Tower_Co')
        if not tco:
            tco = obj.smc
        if tco:
            clean_tco = str(tco).strip()
            if clean_tco.replace('.', '').upper() in ['IHS', 'I H S']:
                return 'IHS'
            return clean_tco
        return 'IHS'

    class Meta:
        model = Site
        fields = '__all__'
