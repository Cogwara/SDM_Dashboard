from rest_framework import serializers
from .models import Site, Notification, TNLLink, IHSFiberLink, HuaweiFiberLink, CellSector, DailyAvailabilityRecord, PIWeightageRecord
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

class IHSFiberLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = IHSFiberLink
        fields = '__all__'

class HuaweiFiberLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = HuaweiFiberLink
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

class CellSectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CellSector
        fields = [
            'id', 'site_id', 'tech', 'cell_name', 'cell_id', 'pci', 'tac', 
            'azimuth', 'latitude', 'longitude', 'polygon_coords', 'region', 
            'source_kml', 'layer', 'enodeb', 'prb_utilization', 'prb_range', 'state'
        ]

class SiteSerializer(serializers.ModelSerializer):
    notes_count = serializers.IntegerField(default=0, read_only=True)
    whatsapp_count = serializers.IntegerField(default=0, read_only=True)
    cell_sectors_count = serializers.IntegerField(default=0, read_only=True)
    tower_co = serializers.SerializerMethodField()
    territory = serializers.SerializerMethodField()

    def get_tower_co(self, obj):
        if not obj:
            return 'IHS'
        if obj.smc:
            return obj.smc
        raw = obj.raw_data
        if raw and isinstance(raw, dict):
            tco = raw.get('Tower Co') or raw.get('TowerCo') or raw.get('Tower_Co')
            if tco:
                clean_tco = str(tco).strip()
                if clean_tco.replace('.', '').upper() in ['IHS', 'I H S']:
                    return 'IHS'
                return clean_tco
        return 'IHS'

    def get_territory(self, obj):
        if not obj:
            return ''
        raw = obj.raw_data
        if raw and isinstance(raw, dict):
            t = raw.get('TERRITORY') or raw.get('Territory') or raw.get('territory') or raw.get('AREA NAME') or raw.get('Area Name')
            if t:
                return str(t).strip()
        return ''

    class Meta:
        model = Site
        fields = '__all__'

class SiteDetailSerializer(serializers.ModelSerializer):
    notes = SimpleNoteSerializer(many=True, read_only=True)
    attachments = SimpleAttachmentSerializer(many=True, read_only=True)
    timeline = SimpleTimelineSerializer(many=True, read_only=True)
    whatsapp_messages = SimpleWhatsAppMessageSerializer(many=True, read_only=True)
    cell_sectors = serializers.SerializerMethodField()
    cell_sectors_count = serializers.SerializerMethodField()
    tower_co = serializers.SerializerMethodField()
    territory = serializers.SerializerMethodField()

    def get_territory(self, obj):
        if not obj:
            return ''
        raw = obj.raw_data
        if raw and isinstance(raw, dict):
            t = raw.get('TERRITORY') or raw.get('Territory') or raw.get('territory') or raw.get('AREA NAME') or raw.get('Area Name')
            if t:
                return str(t).strip()
        return ''

    def get_cell_sectors(self, obj):
        if not obj:
            return []
        q = CellSector.objects.filter(site_id__iexact=obj.ihs_site_id)
        if not q.exists() and obj.mtn_id:
            q = CellSector.objects.filter(site_id__iexact=obj.mtn_id)
        return CellSectorSerializer(q, many=True).data

    def get_cell_sectors_count(self, obj):
        if not obj:
            return 0
        q = CellSector.objects.filter(site_id__iexact=obj.ihs_site_id)
        if not q.exists() and obj.mtn_id:
            q = CellSector.objects.filter(site_id__iexact=obj.mtn_id)
        return q.count()

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


class PIWeightageRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = PIWeightageRecord
        fields = '__all__'


class DailyAvailabilityRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyAvailabilityRecord
        fields = '__all__'
