from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from .models import WhatsAppMessage
from .serializers import WhatsAppMessageSerializer
from .whatsapp_parser import parse_whatsapp_chat

class FlexiblePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 25000

class WhatsAppMessageViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppMessage.objects.all()
    serializer_class = WhatsAppMessageSerializer
    pagination_class = FlexiblePagination

    def perform_create(self, serializer):
        site_input = self.request.data.get('site_id_str') or self.request.data.get('site_id_input') or self.request.data.get('site')
        site_obj = None
        if site_input:
            from sites.models import Site
            val = str(site_input).strip()
            clean_val = val.replace(' ', '').replace('-', '').replace('_', '')
            site_obj = Site.objects.filter(
                Q(ihs_site_id__iexact=val) | 
                Q(mtn_id__iexact=val) | 
                Q(ihs_site_id__iexact=clean_val) | 
                Q(ihs_site_id__icontains=clean_val)
            ).first()
        if site_obj:
            serializer.save(site=site_obj, site_id_str=site_obj.ihs_site_id)
        else:
            serializer.save(site_id_str=str(site_input or '').strip().upper())

    def get_queryset(self):
        qs = WhatsAppMessage.objects.all()
        
        sdm = self.request.query_params.get('sdm', None)
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(sender_name__icontains=sdm) | Q(extracted_engineer__icontains=sdm))

        site_id = self.request.query_params.get('site_id', None)
        if site_id:
            qs = qs.filter(Q(site_id_str__iexact=site_id) | Q(site__ihs_site_id__iexact=site_id))

        search = self.request.query_params.get('search', None)
        if search:
            qs = qs.filter(
                Q(message_text__icontains=search) |
                Q(site_id_str__icontains=search) |
                Q(extracted_engineer__icontains=search) |
                Q(sender_name__icontains=search)
            )

        issue_type = self.request.query_params.get('issue', None)
        if issue_type:
            if issue_type == 'Power':
                qs = qs.filter(has_power_issue=True)
            elif issue_type == 'Generator':
                qs = qs.filter(has_generator_issue=True)
            elif issue_type == 'Fuel':
                qs = qs.filter(has_fuel_issue=True)
            elif issue_type == 'Battery':
                qs = qs.filter(has_battery_issue=True)
            elif issue_type == 'Transmission':
                qs = qs.filter(has_transmission_issue=True)

        return qs.order_by('-created_at')


class ImportWhatsAppChatView(APIView):
    def post(self, request):
        raw_chat = request.data.get('raw_chat', '')
        sender_name = request.data.get('sender_name', 'WhatsApp Operations Group')
        
        if not raw_chat.strip():
            return Response({'error': 'raw_chat content is required'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_messages = parse_whatsapp_chat(raw_chat, default_sender=sender_name)
        serializer = WhatsAppMessageSerializer(parsed_messages, many=True)
        return Response({
            'message': f'Successfully parsed and stored {len(parsed_messages)} WhatsApp updates.',
            'count': len(parsed_messages),
            'data': serializer.data
        }, status=status.HTTP_201_CREATED)
