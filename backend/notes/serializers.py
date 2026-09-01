from rest_framework import serializers
from .models import SiteNote, SiteAttachment, SiteTimeline, FiberOutageNote
from sites.serializers import SiteSerializer

class SiteAttachmentSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)

    class Meta:
        model = SiteAttachment
        fields = '__all__'

class SiteNoteSerializer(serializers.ModelSerializer):
    site_id = serializers.CharField(source='site.ihs_site_id', read_only=True)
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)
    site_cluster = serializers.CharField(source='site.cluster_name', read_only=True)
    attachments = SiteAttachmentSerializer(many=True, read_only=True)
    created_at = serializers.DateTimeField(required=False)
    tower_co = serializers.SerializerMethodField()
    smc_fse_name = serializers.SerializerMethodField()

    def get_tower_co(self, obj):
        if obj.tower_co and obj.tower_co not in ['IHS', 'General', '']:
            return obj.tower_co
        if obj.site:
            if obj.site.raw_data and isinstance(obj.site.raw_data, dict):
                tco = obj.site.raw_data.get('Tower Co') or obj.site.raw_data.get('TowerCo') or obj.site.raw_data.get('Tower_Co')
                if tco:
                    clean = str(tco).strip()
                    if clean.replace('.', '').upper() in ['IHS', 'I H S']:
                        return 'IHS'
                    return clean
            if obj.site.smc:
                clean = str(obj.site.smc).strip()
                if clean.replace('.', '').upper() in ['IHS', 'I H S']:
                    return 'IHS'
                return clean
        return obj.tower_co or 'IHS'

    def get_smc_fse_name(self, obj):
        if obj.smc_fse_name and obj.smc_fse_name.strip() and obj.smc_fse_name.strip() != 'Unassigned':
            return obj.smc_fse_name.strip()
        if obj.site:
            if obj.site.smc_fse_name and obj.site.smc_fse_name.strip() and obj.site.smc_fse_name.strip() != '0':
                return obj.site.smc_fse_name.strip()
            if obj.site.raw_data and isinstance(obj.site.raw_data, dict):
                fse = obj.site.raw_data.get('SMC FSE Name') or obj.site.raw_data.get('FSE NAME') or obj.site.raw_data.get('FSE Name')
                if fse and str(fse).strip() and str(fse).strip() != '0':
                    return str(fse).strip()
        return obj.smc_fse_name or 'Unassigned'

    class Meta:
        model = SiteNote
        fields = '__all__'

class SiteTimelineSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)

    class Meta:
        model = SiteTimeline
        fields = '__all__'

class FiberOutageNoteSerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = FiberOutageNote
        fields = '__all__'
