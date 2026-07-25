from rest_framework import serializers
from .models import SiteNote, SiteAttachment, SiteTimeline
from sites.serializers import SiteSerializer

class SiteAttachmentSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)

    class Meta:
        model = SiteAttachment
        fields = '__all__'

class SiteNoteSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)
    site_cluster = serializers.CharField(source='site.cluster_name', read_only=True)
    attachments = SiteAttachmentSerializer(many=True, read_only=True)
    created_at = serializers.DateTimeField(required=False)

    class Meta:
        model = SiteNote
        fields = '__all__'

class SiteTimelineSerializer(serializers.ModelSerializer):
    site_ihs_id = serializers.CharField(source='site.ihs_site_id', read_only=True)

    class Meta:
        model = SiteTimeline
        fields = '__all__'
