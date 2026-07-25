from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Count, Q
from sites.models import Site
from notes.models import SiteNote
from whatsapp.models import WhatsAppMessage

class ReportsAnalyticsView(APIView):
    def get(self, request):
        sdm = request.query_params.get('sdm', '').strip()

        sites_qs = Site.objects.all()
        notes_qs = SiteNote.objects.all()
        if sdm and sdm != 'All':
            sites_qs = sites_qs.filter(sdm_name__icontains=sdm)
            notes_qs = notes_qs.filter(Q(site__sdm_name__icontains=sdm) | Q(created_by__icontains=sdm))

        # 1. Top Problematic Sites
        top_problematic = notes_qs.values('site__ihs_site_id', 'site__cluster_name') \
            .annotate(incident_count=Count('id')) \
            .order_by('-incident_count')[:20]

        # 2. Most Frequent Faults
        fault_categories = notes_qs.values('category') \
            .annotate(count=Count('id')) \
            .order_by('-count')

        # 3. Cluster Performance
        cluster_perf = sites_qs.values('cluster_name') \
            .annotate(
                total_sites=Count('id'),
                down_sites=Count('id', filter=Q(is_down=True)),
                critical_sites=Count('id', filter=Q(is_critical=True))
            ).order_by('-total_sites')

        # 4. Fault Breakdown
        power_outages_count = notes_qs.filter(category='Power').count()
        generator_failures_count = notes_qs.filter(category='Generator').count()
        battery_failures_count = notes_qs.filter(category='Battery').count()
        transmission_failures_count = notes_qs.filter(category='Transmission').count()
        customer_escalations_count = notes_qs.filter(category='Customer').count()

        # 5. Engineer Performance (Mentions in notes/chats)
        engineer_activity = notes_qs.values('created_by') \
            .annotate(notes_written=Count('id')) \
            .order_by('-notes_written')

        return Response({
            'top_problematic_sites': list(top_problematic),
            'fault_categories': list(fault_categories),
            'cluster_performance': list(cluster_perf),
            'fault_breakdown': {
                'power_outages': power_outages_count,
                'generator_failures': generator_failures_count,
                'battery_failures': battery_failures_count,
                'transmission_failures': transmission_failures_count,
                'customer_escalations': customer_escalations_count,
            },
            'engineer_activity': list(engineer_activity),
        })
