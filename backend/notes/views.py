from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
import pandas as pd
import datetime
from .models import SiteNote, SiteAttachment, SiteTimeline, FiberOutageNote
from .serializers import SiteNoteSerializer, SiteAttachmentSerializer, SiteTimelineSerializer, FiberOutageNoteSerializer
from sites.models import Site, Notification

class FlexiblePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 25000


class FiberOutageNoteViewSet(viewsets.ModelViewSet):
    queryset = FiberOutageNote.objects.all()
    serializer_class = FiberOutageNoteSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = FiberOutageNote.objects.all()

        search = self.request.query_params.get('search', None)
        if search:
            s_clean = search.strip()
            qs = qs.filter(
                Q(ticket_number__icontains=s_clean) |
                Q(site_id__icontains=s_clean) |
                Q(site_a__icontains=s_clean) |
                Q(site_b__icontains=s_clean) |
                Q(fiber_route__icontains=s_clean) |
                Q(provider__icontains=s_clean) |
                Q(title__icontains=s_clean) |
                Q(description__icontains=s_clean) |
                Q(location__icontains=s_clean) |
                Q(state__icontains=s_clean) |
                Q(reported_by__icontains=s_clean)
            )

        provider = self.request.query_params.get('provider', None)
        if provider and provider != 'All':
            qs = qs.filter(provider__iexact=provider)

        status_param = self.request.query_params.get('status', None)
        if status_param and status_param != 'All':
            qs = qs.filter(status__iexact=status_param)

        priority = self.request.query_params.get('priority', None)
        if priority and priority != 'All':
            qs = qs.filter(priority__iexact=priority)

        state = self.request.query_params.get('state', None)
        if state and state != 'All':
            qs = qs.filter(state__iexact=state)

        # Day & Date filtering
        date_param = self.request.query_params.get('date', None)
        if date_param and date_param.strip() and date_param != 'All':
            qs = qs.filter(created_at__date=date_param.strip())

        day_param = self.request.query_params.get('day', None)
        if day_param and day_param != 'All':
            today = timezone.now().date()
            if day_param == 'today':
                qs = qs.filter(created_at__date=today)
            elif day_param == 'yesterday':
                qs = qs.filter(created_at__date=today - datetime.timedelta(days=1))
            elif day_param == 'last_7_days':
                qs = qs.filter(created_at__date__gte=today - datetime.timedelta(days=7))
            elif day_param == 'last_30_days':
                qs = qs.filter(created_at__date__gte=today - datetime.timedelta(days=30))

        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        if start_date and start_date.strip():
            qs = qs.filter(created_at__date__gte=start_date.strip())
        if end_date and end_date.strip():
            qs = qs.filter(created_at__date__lte=end_date.strip())

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        instance = serializer.save()

        # Automatically create corresponding SDM SiteNote
        target_site_id = (instance.site_id or instance.site_a or instance.site_b or '').strip().upper()

        if target_site_id:
            site_obj = Site.objects.filter(Q(ihs_site_id__iexact=target_site_id) | Q(mtn_id__iexact=target_site_id)).first()

            note_title = f"🚨 Fiber Outage [{instance.ticket_number}]: {instance.title}"
            note_description = (
                f"AUTOMATIC SDM NOTE - FIBER OUTAGE RECORDED\n\n"
                f"• Ticket #: {instance.ticket_number}\n"
                f"• Provider: {instance.provider}\n"
                f"• Fiber Route: {instance.fiber_route or 'N/A'}\n"
                f"• Impacted Segment: {instance.site_a} <-> {instance.site_b}\n"
                f"• Outage Distance: {instance.distance_km} km\n"
                f"• Priority: {instance.priority}\n"
                f"• Cut Location: {instance.location or instance.state}\n"
                f"• Reported By: {instance.reported_by}\n"
                f"• Contact: {instance.contact_number or 'N/A'}\n"
                f"• Resolution ETA: {instance.eta_time or 'Pending Investigation'}\n\n"
                f"Detailed RCA & Status:\n{instance.description}"
            )

            valid_priority = instance.priority if instance.priority in ['Critical', 'High', 'Medium', 'Low'] else 'High'
            valid_status = instance.status if instance.status in ['Open', 'In Progress', 'Resolved', 'Escalated'] else 'Open'

            try:
                SiteNote.objects.create(
                    site=site_obj,
                    site_id_input=target_site_id,
                    site_id_str=target_site_id,
                    title=note_title,
                    category='Fiber',
                    priority=valid_priority,
                    status=valid_status,
                    description=note_description,
                    created_by=instance.reported_by or 'State Delivery Manager',
                    created_at=instance.created_at
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to auto-create SiteNote for Fiber Outage {instance.ticket_number}: {e}")

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        total_outages = qs.count()
        active_outages = qs.filter(status='Open').count()
        in_progress_outages = qs.filter(status='In Progress').count()
        restored_outages = qs.filter(status='Resolved').count()
        
        from django.db.models import Sum
        total_km_impacted = round(qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)

        providers = list(qs.values('provider').annotate(count=Q()).order_by('-count')) if hasattr(qs, 'values') else []
        
        return Response({
            'total_outages': total_outages,
            'active_outages': active_outages,
            'in_progress_outages': in_progress_outages,
            'restored_outages': restored_outages,
            'total_km_impacted': total_km_impacted
        })

class SiteNoteViewSet(viewsets.ModelViewSet):
    queryset = SiteNote.objects.all()
    serializer_class = SiteNoteSerializer
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    pagination_class = FlexiblePagination

    def destroy(self, request, *args, **kwargs):
        note = self.get_object()
        user_param = (request.query_params.get('user') or request.query_params.get('sdm') or request.data.get('user') or '').strip().lower()
        is_superuser = request.query_params.get('is_superuser') == 'true' or request.data.get('is_superuser') is True

        created_by = (note.created_by or '').strip().lower()
        sdm_name = (note.site.sdm_name or '').strip().lower() if note.site else ''

        if is_superuser or not user_param or user_param == created_by or user_param == sdm_name or user_param in created_by or created_by in user_param:
            if note.site:
                SiteTimeline.objects.create(
                    site=note.site,
                    event=f"SDM Note Deleted: {note.title}",
                    details=f"Category: {note.category} | Priority: {note.priority} | Deleted by {user_param or 'Admin'}",
                    author=user_param or 'Admin'
                )
            self.perform_destroy(note)
            return Response({'message': 'Note deleted successfully.'}, status=status.HTTP_200_OK)
        else:
            return Response(
                {'error': 'Permission denied: SDMs can only delete their own operational notes.'},
                status=status.HTTP_403_FORBIDDEN
            )

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from django.utils import timezone

        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "SDM Operational Notes"
        ws.views.sheetView[0].showGridLines = True

        # Styles
        font_title = Font(name='Segoe UI', size=13, bold=True, color='FFFFFF')
        font_subtitle = Font(name='Segoe UI', size=9, italic=True, color='CBD5E1')
        fill_banner = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')

        font_header = Font(name='Segoe UI', size=10, bold=True, color='FFFFFF')
        fill_header = PatternFill(start_color='0284C7', end_color='0284C7', fill_type='solid')

        font_data = Font(name='Segoe UI', size=9.5, color='1E293B')
        font_bold = Font(name='Segoe UI', size=9.5, bold=True, color='0F172A')

        fill_even = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')
        fill_odd = PatternFill(start_color='FFFFFF', end_color='FFFFFF', fill_type='solid')

        thin_side = Side(style='thin', color='E2E8F0')
        border_cell = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

        align_center = Alignment(horizontal='center', vertical='top', wrap_text=True)
        align_left = Alignment(horizontal='left', vertical='top', wrap_text=True)

        priority_styles = {
            'Critical': (Font(name='Segoe UI', size=9.5, bold=True, color='991B1B'), PatternFill(start_color='FEE2E2', end_color='FEE2E2', fill_type='solid')),
            'High': (Font(name='Segoe UI', size=9.5, bold=True, color='92400E'), PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')),
            'Medium': (Font(name='Segoe UI', size=9.5, bold=True, color='075985'), PatternFill(start_color='E0F2FE', end_color='E0F2FE', fill_type='solid')),
            'Low': (Font(name='Segoe UI', size=9.5, bold=True, color='334155'), PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')),
        }

        status_styles = {
            'Resolved': (Font(name='Segoe UI', size=9.5, bold=True, color='065F46'), PatternFill(start_color='D1FAE5', end_color='D1FAE5', fill_type='solid')),
            'In Progress': (Font(name='Segoe UI', size=9.5, bold=True, color='92400E'), PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')),
            'Escalated': (Font(name='Segoe UI', size=9.5, bold=True, color='9F1239'), PatternFill(start_color='FFE4E6', end_color='FFE4E6', fill_type='solid')),
            'Open': (Font(name='Segoe UI', size=9.5, bold=True, color='374151'), PatternFill(start_color='F3F4F6', end_color='F3F4F6', fill_type='solid')),
        }

        # Banner Title (Row 1)
        ws.merge_cells('A1:M1')
        title_cell = ws['A1']
        title_cell.value = "FEDERAL CAPITAL TERRITORY (FCT) SDM DASHBOARD - OPERATIONAL NOTES REPORT"
        title_cell.font = font_title
        title_cell.fill = fill_banner
        title_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[1].height = 32

        # Subtitle (Row 2)
        ws.merge_cells('A2:M2')
        sub_cell = ws['A2']
        now_str = timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')
        
        date_filter = request.query_params.get('date_filter', None) or request.query_params.get('days', None)
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)

        filter_desc = "All Time"
        if date_filter == 'yesterday':
            filter_desc = "Yesterday's Operational Notes"
        elif date_filter == 'today':
            filter_desc = "Today's Operational Notes"
        elif date_filter == '7days':
            filter_desc = "Last 7 Days Notes"
        elif date_filter == '30days':
            filter_desc = "Last 30 Days Notes"
        elif start_date or end_date:
            filter_desc = f"{start_date or 'Start'} to {end_date or 'Present'}"

        sub_cell.value = f"Report Generated: {now_str} | Date Range: {filter_desc} | Total Operational Records Exported: {qs.count()}"
        sub_cell.font = font_subtitle
        sub_cell.fill = fill_banner
        sub_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[2].height = 20

        # Spacing Row 3
        ws.row_dimensions[3].height = 10

        # Headers (Row 4)
        headers = [
            'Site ID', 'Site MTN ID', 'Cluster', 'State', 'Tower Co', 'Category', 
            'Priority', 'Status', 'Logged By', 'Created Date & Time', 
            'Resolution Time', 'Title', 'Description & RCA History'
        ]

        ws.append([]) # Row 3
        ws.row_dimensions[4].height = 26

        for col_num, header_title in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col_num, value=header_title)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = border_cell

        def calc_res_time(note):
            created = note.created_at
            if not created:
                return 'N/A'
            if note.status == 'Resolved':
                end_time = note.resolved_at or getattr(note, 'updated_at', None) or timezone.now()
                diff = end_time - created
                sec = max(0, int(diff.total_seconds()))
                days, rem = divmod(sec, 86400)
                hrs, rem = divmod(rem, 3600)
                mins, _ = divmod(rem, 60)
                if days > 0:
                    return f"{days}d {hrs}h {mins}m"
                elif hrs > 0:
                    return f"{hrs}h {mins}m"
                elif mins > 0:
                    return f"{mins}mins"
                else:
                    return "< 1 min"
            else:
                diff = timezone.now() - created
                sec = max(0, int(diff.total_seconds()))
                days, rem = divmod(sec, 86400)
                hrs, rem = divmod(rem, 3600)
                mins, _ = divmod(rem, 60)
                if days > 0:
                    dur = f"{days}d {hrs}h"
                elif hrs > 0:
                    dur = f"{hrs}h {mins}m"
                elif mins > 0:
                    dur = f"{mins}mins"
                else:
                    dur = "< 1 min"
                return f"Open ({dur})"

        def calc_dur_clean(note):
            created = note.created_at
            if not created:
                return ''
            if note.status == 'Resolved':
                end_time = note.resolved_at or getattr(note, 'updated_at', None) or timezone.now()
            else:
                end_time = timezone.now()
            diff = end_time - created
            sec = max(0, int(diff.total_seconds()))
            days, rem = divmod(sec, 86400)
            hrs, rem = divmod(rem, 3600)
            mins, _ = divmod(rem, 60)
            if days > 0:
                return f"{days}d{hrs}h"
            elif hrs > 0:
                return f"{hrs}h{mins}m"
            elif mins > 0:
                return f"{mins}mins"
            else:
                return "<1min"

        # Data Rows (Row 5+)
        current_row = 5
        for note in qs:
            res_time = calc_res_time(note)
            created_str = note.created_at.strftime('%Y-%m-%d %H:%M') if note.created_at else ''

            site_id = note.site.ihs_site_id if note.site else ''
            title_text = (note.title or '').strip()
            desc_text = (note.description or '').strip()

            # Clean site_id prefixes to avoid duplicate site IDs in formatted RCA
            if site_id:
                if title_text.upper().startswith(f"{site_id.upper()}-"):
                    title_clean = title_text[len(site_id) + 1:].strip(' -:\t\n')
                elif title_text.upper().startswith(site_id.upper()):
                    title_clean = title_text[len(site_id):].strip(' -:\t\n')
                else:
                    title_clean = title_text

                if desc_text.upper().startswith(f"{site_id.upper()}-"):
                    desc_clean = desc_text[len(site_id) + 1:].strip(' -:\t\n')
                elif desc_text.upper().startswith(site_id.upper()):
                    desc_clean = desc_text[len(site_id):].strip(' -:\t\n')
                else:
                    desc_clean = desc_text
            else:
                title_clean = title_text
                desc_clean = desc_text

            if title_clean and desc_clean and desc_clean != title_clean:
                if not title_clean.endswith(('.', ':', ';', '-')):
                    combined_text = f"{title_clean}. {desc_clean}"
                else:
                    combined_text = f"{title_clean} {desc_clean}"
            elif desc_clean:
                combined_text = desc_clean
            else:
                combined_text = title_clean

            # Auto-lookup Tower Co from site DB record if available
            tower_co_str = 'IHS'
            if note.site:
                if note.site.raw_data and isinstance(note.site.raw_data, dict):
                    tco = note.site.raw_data.get('Tower Co') or note.site.raw_data.get('TowerCo') or note.site.raw_data.get('Tower_Co')
                    if tco:
                        c_tco = str(tco).strip()
                        tower_co_str = 'IHS' if c_tco.replace('.', '').upper() in ['IHS', 'I H S', 'HIS'] else c_tco
                if tower_co_str == 'IHS' and note.site.smc:
                    c_smc = str(note.site.smc).strip()
                    tower_co_str = 'IHS' if c_smc.replace('.', '').upper() in ['IHS', 'I H S', 'HIS'] else c_smc
            if tower_co_str == 'IHS' and getattr(note, 'tower_co', None):
                tower_co_str = note.tower_co

            dur_str = calc_dur_clean(note)
            tco_formatted = f"({tower_co_str})" if tower_co_str else ""

            # Requested Format: FC2005- restored unstable grid. DG was powered 37mins (IHS)
            if site_id:
                desc_rca_val = f"{site_id}- {combined_text} {dur_str} {tco_formatted}".strip()
            else:
                desc_rca_val = f"{combined_text} {dur_str} {tco_formatted}".strip()

            row_data = [
                site_id,
                note.site.mtn_id if note.site else '',
                note.site.cluster_name if note.site else '',
                note.site.state if note.site else '',
                tower_co_str,
                note.category,
                note.priority,
                note.status,
                note.created_by,
                created_str,
                res_time,
                note.title,
                desc_rca_val,
            ]

            ws.row_dimensions[current_row].height = 36
            row_fill = fill_even if current_row % 2 == 0 else fill_odd

            for col_num, val in enumerate(row_data, 1):
                cell = ws.cell(row=current_row, column=col_num, value=val)
                cell.font = font_data
                cell.fill = row_fill
                cell.border = border_cell

                if col_num in [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]:
                    cell.alignment = align_center
                else:
                    cell.alignment = align_left

                if col_num == 1:
                    cell.font = font_bold

                if col_num == 7 and val in priority_styles:
                    p_font, p_fill = priority_styles[val]
                    cell.font = p_font
                    cell.fill = p_fill

                if col_num == 8 and val in status_styles:
                    s_font, s_fill = status_styles[val]
                    cell.font = s_font
                    cell.fill = s_fill

                if col_num == 11:
                    if 'Resolved' in str(note.status):
                        cell.font = Font(name='Segoe UI', size=9.5, bold=True, color='047857')
                    else:
                        cell.font = Font(name='Segoe UI', size=9.5, italic=True, color='B45309')

            current_row += 1

        col_widths = {
            1: 14, # Site ID
            2: 14, # Site MTN ID
            3: 18, # Cluster
            4: 12, # State
            5: 14, # Tower Co
            6: 22, # Category
            7: 14, # Priority
            8: 15, # Status
            9: 24, # Logged By
            10: 20, # Created Date & Time
            11: 22, # Resolution Time
            12: 32, # Title
            13: 55, # Description & RCA History
        }

        for col_idx, width in col_widths.items():
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = width

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="SDM_Operational_Notes.xlsx"'

        wb.save(response)
        return response

    def get_queryset(self):
        qs = SiteNote.objects.all()
        
        sdm = self.request.query_params.get('sdm', None)
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(created_by__icontains=sdm))

        site_id = self.request.query_params.get('site_id', None)
        if site_id:
            qs = qs.filter(site__ihs_site_id__iexact=site_id)

        lga = self.request.query_params.get('lga', None)
        if lga and lga != 'All':
            clean_lga = lga.strip().upper()
            first_word = clean_lga.split()[0]
            lga_q = Q(site__lga__iexact=clean_lga) | Q(site__lga__icontains=clean_lga) | Q(site__lga__icontains=first_word)
            if clean_lga in ['AMAC', 'MUNICIPAL AREA COUNCIL', 'MUNICIPAL', 'ABUJA MUNICIPAL']:
                lga_q |= Q(site__lga__icontains='AMAC') | Q(site__lga__icontains='MUNICIPAL')
            
            try:
                from sites.models import DailyAvailabilityRecord
                lga_sites = list(DailyAvailabilityRecord.objects.filter(lga__icontains=first_word).values_list('site_id', flat=True).distinct()[:500])
                if lga_sites:
                    lga_q |= Q(site__ihs_site_id__in=lga_sites)
            except Exception:
                pass

            qs = qs.filter(lga_q)
        
        category = self.request.query_params.get('category', None)
        if category and category != 'All':
            qs = qs.filter(category__iexact=category)

        priority = self.request.query_params.get('priority', None)
        if priority and priority != 'All':
            qs = qs.filter(priority__iexact=priority)

        status_param = self.request.query_params.get('status', None)
        if status_param and status_param != 'All':
            qs = qs.filter(status__iexact=status_param)

        site_ids_param = self.request.query_params.get('site_ids', None)
        search = self.request.query_params.get('search', None)

        if site_ids_param:
            import re
            from functools import reduce
            import operator
            if isinstance(site_ids_param, list):
                raw_tokens = [str(x).strip() for x in site_ids_param if str(x).strip()]
            else:
                raw_tokens = [t.strip() for t in re.split(r'[,;\s\n\r\t]+', str(site_ids_param)) if t.strip()]
            clean_tokens = [t.upper() for t in raw_tokens if t]
            if clean_tokens:
                note_q = [
                    Q(site__ihs_site_id__iexact=t) |
                    Q(site__mtn_id__iexact=t) |
                    Q(site__cascade__iexact=t) |
                    Q(site__ihs_site_id__icontains=t) |
                    Q(title__icontains=t) |
                    Q(description__icontains=t)
                    for t in clean_tokens
                ]
                qs = qs.filter(reduce(operator.or_, note_q))
        elif search:
            import re
            from functools import reduce
            import operator
            s_clean = search.strip()
            tokens = [t.strip() for t in re.split(r'[,;\n\r\t]+', s_clean) if t.strip()]
            if len(tokens) <= 1 and ' ' in s_clean:
                space_tokens = [t.strip() for t in s_clean.split() if t.strip()]
                if len(space_tokens) > 1 and any(re.match(r'^[A-Za-z]{1,4}\d{2,6}', st) for st in space_tokens):
                    tokens = space_tokens
            
            if len(tokens) > 1:
                clean_tokens = [t.upper() for t in tokens if t]
                note_q = [
                    Q(site__ihs_site_id__iexact=t) |
                    Q(site__mtn_id__iexact=t) |
                    Q(site__cascade__iexact=t) |
                    Q(site__ihs_site_id__icontains=t) |
                    Q(title__icontains=t) |
                    Q(description__icontains=t)
                    for t in clean_tokens
                ]
                qs = qs.filter(reduce(operator.or_, note_q))
            else:
                search_q = Q(title__icontains=s_clean) | Q(description__icontains=s_clean) | Q(created_by__icontains=s_clean) | Q(site__ihs_site_id__icontains=s_clean) | Q(site__lga__icontains=s_clean)
                if s_clean.upper() in ['AMAC', 'MUNICIPAL AREA COUNCIL', 'MUNICIPAL']:
                    search_q |= Q(site__lga__icontains='AMAC') | Q(site__lga__icontains='MUNICIPAL')
                qs = qs.filter(search_q)

        # Date Filter (today, yesterday, 7days, 30days, or custom start_date/end_date)
        date_filter = self.request.query_params.get('date_filter', None) or self.request.query_params.get('days', None)
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if date_filter == 'today':
            qs = qs.filter(created_at__gte=today_start)
        elif date_filter == 'yesterday':
            yesterday_start = today_start - timezone.timedelta(days=1)
            qs = qs.filter(created_at__gte=yesterday_start, created_at__lt=today_start)
        elif date_filter == '7days':
            seven_days_ago = today_start - timezone.timedelta(days=7)
            qs = qs.filter(created_at__gte=seven_days_ago)
        elif date_filter == '30days':
            thirty_days_ago = today_start - timezone.timedelta(days=30)
            qs = qs.filter(created_at__gte=thirty_days_ago)
        
        if start_date:
            try:
                s_dt = timezone.datetime.strptime(start_date, '%Y-%m-%d')
                s_dt = timezone.make_aware(s_dt, timezone.get_current_timezone())
                qs = qs.filter(created_at__gte=s_dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                e_dt = timezone.datetime.strptime(end_date, '%Y-%m-%d')
                e_dt = timezone.make_aware(e_dt, timezone.get_current_timezone()) + timezone.timedelta(days=1)
                qs = qs.filter(created_at__lt=e_dt)
            except ValueError:
                pass

        return qs.order_by('-created_at')

    def _save_uploaded_photos(self, request, site, note):
        files = []
        seen_files = set()
        for key in ['photos', 'attachments', 'file', 'photo', 'uploaded_photos', 'uploaded_photo']:
            for f in request.FILES.getlist(key):
                file_sig = (f.name, getattr(f, 'size', 0))
                if file_sig not in seen_files:
                    seen_files.add(file_sig)
                    files.append(f)

        for f in files:
            content_type = getattr(f, 'content_type', '') or ''
            raw_name = (f.name or 'field_photo.jpg').split('/')[-1].split('\\')[-1]
            if '.' not in raw_name:
                raw_name = f"{raw_name}.jpg"
            f.name = raw_name

            file_type = 'Photo' if content_type.startswith('image/') or raw_name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')) else 'Document'
            SiteAttachment.objects.create(
                site=site,
                note=note,
                file=f,
                file_name=raw_name,
                file_type=file_type,
                uploaded_by=note.created_by
            )

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        site_id_input = data.get('site_id_input') or data.get('site_id_str') or data.get('site_id') or data.get('site')
        site = None
        if site_id_input:
            val = str(site_id_input).strip()
            clean_val = val.replace(' ', '').replace('-', '').replace('_', '')
            site = Site.objects.filter(
                Q(ihs_site_id__iexact=val) | 
                Q(mtn_id__iexact=val) | 
                Q(ihs_site_id__iexact=clean_val) | 
                Q(ihs_site_id__icontains=clean_val) | 
                Q(pk=val if val.isdigit() else -1)
            ).first()

            if not site:
                import re
                digits = re.sub(r'\D', '', val)
                if digits:
                    site = Site.objects.filter(ihs_site_id__icontains=digits).first()

        if not site and 'site' in data and data['site']:
            site = Site.objects.filter(pk=data['site']).first()

        if not site:
            return Response({'error': f'Site "{site_id_input}" not found in database. Please verify Site ID.'}, status=status.HTTP_400_BAD_REQUEST)

        data['site'] = site.id
        
        # Auto-pick Tower Co from Site DB record
        site_tco = None
        if site.raw_data and isinstance(site.raw_data, dict):
            site_tco = site.raw_data.get('Tower Co') or site.raw_data.get('TowerCo') or site.raw_data.get('Tower_Co')
        if not site_tco and site.smc:
            site_tco = site.smc
        if site_tco:
            clean = str(site_tco).strip()
            data['tower_co'] = 'IHS' if clean.replace('.', '').upper() in ['IHS', 'I H S'] else clean
        else:
            data['tower_co'] = 'IHS'

        # Auto-pick SMC FSE Engineer Name from Site DB record
        site_fse = site.smc_fse_name
        if not site_fse and site.raw_data and isinstance(site.raw_data, dict):
            site_fse = site.raw_data.get('SMC FSE Name') or site.raw_data.get('FSE NAME') or site.raw_data.get('FSE Name')
        if site_fse and str(site_fse).strip() and str(site_fse).strip() != '0':
            data['smc_fse_name'] = str(site_fse).strip()
        else:
            data['smc_fse_name'] = 'Unassigned'

        custom_created_at = data.get('created_at') or data.get('incident_time')
        if custom_created_at:
            try:
                from django.utils.dateparse import parse_datetime
                dt = parse_datetime(str(custom_created_at))
                if dt:
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, timezone.get_current_timezone())
                    data['created_at'] = dt
            except Exception as e:
                print('Failed to parse custom created_at:', e)

        serializer = self.get_serializer(data=data)
        serializer.is_validate_custom = True
        serializer.is_valid(raise_exception=True)
        note = serializer.save()

        if note.status == 'Resolved' and not note.resolved_at:
            note.resolved_at = timezone.now()
            note.save(update_fields=['resolved_at'])

        # Save photos / attachments
        self._save_uploaded_photos(request, site, note)

        # Create Timeline record
        SiteTimeline.objects.create(
            site=site,
            event=f"SDM Note Created: {note.title}",
            details=f"Category: {note.category} | Priority: {note.priority} | Status: {note.status}",
            author=note.created_by
        )

        # Trigger notification if Critical or High
        if note.priority in ['Critical', 'High']:
            Notification.objects.create(
                site=site,
                alert_type='New SDM Note',
                title=f"[{note.priority}] Note on {site.ihs_site_id}",
                message=f"{note.title} - {note.description[:100]}"
            )

        # Re-serialize note to include attached photos
        res_serializer = self.get_serializer(note)
        headers = self.get_success_headers(res_serializer.data)
        return Response(res_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy()

        # Check creator authorization
        requester_sdm = data.get('updated_by') or data.get('sdm') or data.get('requester') or request.query_params.get('sdm', '')
        is_superuser = data.get('is_superuser', False) or getattr(request.user, 'is_superuser', False)

        note_creator = (instance.created_by or '').strip().lower()
        req_sdm_clean = (requester_sdm or '').strip().lower()

        if not is_superuser and req_sdm_clean:
            match = (
                req_sdm_clean == note_creator or
                req_sdm_clean in note_creator or
                note_creator in req_sdm_clean or
                note_creator == 'state delivery manager'
            )
            if not match:
                return Response(
                    {'error': f'Permission denied. Note can only be updated by its creator ({instance.created_by}).'},
                    status=status.HTTP_403_FORBIDDEN
                )

        site_id_input = data.get('site_id_input') or data.get('site')
        if site_id_input:
            if isinstance(site_id_input, int):
                site = Site.objects.filter(pk=site_id_input).first()
            else:
                site = Site.objects.filter(Q(ihs_site_id__iexact=str(site_id_input).strip()) | Q(pk=site_id_input if str(site_id_input).isdigit() else -1)).first()
            if site:
                data['site'] = site.id
        if 'site' not in data or not data['site']:
            data['site'] = instance.site.id

        # Preserve original creator
        if 'created_by' in data and not is_superuser:
            data['created_by'] = instance.created_by

        custom_created_at = data.get('created_at') or data.get('incident_time')
        if custom_created_at:
            try:
                from django.utils.dateparse import parse_datetime
                dt = parse_datetime(str(custom_created_at))
                if dt:
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, timezone.get_current_timezone())
                    data['created_at'] = dt
            except Exception as e:
                print('Failed to parse custom created_at:', e)

        # Fill missing required fields from existing instance
        for field in ['title', 'description', 'category', 'priority', 'status']:
            if field not in data or data[field] is None:
                data[field] = getattr(instance, field)

        # Support appending new data / progress update entry to description
        append_update = data.get('append_update', '').strip()
        if append_update:
            now_str = timezone.now().strftime('%d/%m/%Y %H:%M')
            updater_name = requester_sdm or instance.created_by
            entry_header = f"\n\n--- [UPDATE: {now_str} by {updater_name}] ---\n{append_update}"
            existing_desc = data.get('description') or instance.description or ''
            data['description'] = existing_desc + entry_header

        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_note = serializer.save()

        # Handle resolved_at timestamp
        if updated_note.status == 'Resolved':
            if not updated_note.resolved_at:
                updated_note.resolved_at = timezone.now()
                updated_note.save(update_fields=['resolved_at'])
        else:
            if updated_note.resolved_at:
                updated_note.resolved_at = None
                updated_note.save(update_fields=['resolved_at'])

        # Save photos / attachments
        self._save_uploaded_photos(request, updated_note.site, updated_note)

        updater_name = requester_sdm or updated_note.created_by

        # Create Timeline record for update
        SiteTimeline.objects.create(
            site=updated_note.site,
            event=f"SDM Note Updated: {updated_note.title}",
            details=f"Category: {updated_note.category} | Priority: {updated_note.priority} | Status: {updated_note.status}",
            author=updater_name
        )

        # Trigger notification if Critical or High
        if updated_note.priority in ['Critical', 'High']:
            Notification.objects.create(
                site=updated_note.site,
                alert_type='Updated SDM Note',
                title=f"[{updated_note.priority}] Note Updated on {updated_note.site.ihs_site_id}",
                message=f"{updated_note.title} - {updated_note.description[:100]}"
            )

        res_serializer = self.get_serializer(updated_note)
        return Response(res_serializer.data)

    @action(detail=True, methods=['post'], parser_classes=(MultiPartParser, FormParser))
    def upload_photo(self, request, pk=None):
        note = self.get_object()
        self._save_uploaded_photos(request, note.site, note)
        serializer = self.get_serializer(note)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        instance = self.get_object()
        data = request.data or {}

        requester_sdm = data.get('updated_by') or data.get('sdm') or data.get('requester') or request.query_params.get('sdm', '')
        is_superuser = data.get('is_superuser', False) or getattr(request.user, 'is_superuser', False)

        note_creator = (instance.created_by or '').strip().lower()
        req_sdm_clean = (requester_sdm or '').strip().lower()

        if not is_superuser and req_sdm_clean:
            match = (
                req_sdm_clean == note_creator or
                req_sdm_clean in note_creator or
                note_creator in req_sdm_clean or
                note_creator == 'state delivery manager'
            )
            if not match:
                return Response(
                    {'error': f'Permission denied. Note can only be resolved by its creator ({instance.created_by}).'},
                    status=status.HTTP_403_FORBIDDEN
                )

        instance.status = 'Resolved'
        if not instance.resolved_at:
            instance.resolved_at = timezone.now()
        instance.save()

        updater_name = requester_sdm or instance.created_by

        # Create Timeline record
        SiteTimeline.objects.create(
            site=instance.site,
            event=f"SDM Note Resolved: {instance.title}",
            details=f"Status marked as Resolved by {updater_name}",
            author=updater_name
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class SiteAttachmentViewSet(viewsets.ModelViewSet):
    queryset = SiteAttachment.objects.all()
    serializer_class = SiteAttachmentSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = SiteAttachment.objects.all()
        site_id = self.request.query_params.get('site_id', None)
        if site_id:
            qs = qs.filter(site__ihs_site_id__iexact=site_id)
        return qs.order_by('-uploaded_at')


class SiteTimelineViewSet(viewsets.ModelViewSet):
    queryset = SiteTimeline.objects.all()
    serializer_class = SiteTimelineSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = SiteTimeline.objects.all()
        site_id = self.request.query_params.get('site_id', None)
        if site_id:
            qs = qs.filter(site__ihs_site_id__iexact=site_id)
        return qs.order_by('-created_at')
