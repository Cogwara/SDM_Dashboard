from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
import pandas as pd
from .models import SiteNote, SiteAttachment, SiteTimeline
from .serializers import SiteNoteSerializer, SiteAttachmentSerializer, SiteTimelineSerializer
from sites.models import Site, Notification

class FlexiblePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 25000

class SiteNoteViewSet(viewsets.ModelViewSet):
    queryset = SiteNote.objects.all()
    serializer_class = SiteNoteSerializer
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    pagination_class = FlexiblePagination

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
        ws.merge_cells('A1:L1')
        title_cell = ws['A1']
        title_cell.value = "FEDERAL CAPITAL TERRITORY (FCT) SDM DASHBOARD - OPERATIONAL NOTES REPORT"
        title_cell.font = font_title
        title_cell.fill = fill_banner
        title_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[1].height = 32

        # Subtitle (Row 2)
        ws.merge_cells('A2:L2')
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

        # Headers (Row 4) - Note ID removed!
        headers = [
            'Site ID', 'Site MTN ID', 'Cluster', 'State', 'Category', 
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
                end_time = getattr(note, 'updated_at', None) or timezone.now()
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
                    return f"{mins} mins"
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
                else:
                    dur = f"{mins}m"
                return f"Open ({dur})"

        # Data Rows (Row 5+)
        current_row = 5
        for note in qs:
            res_time = calc_res_time(note)
            created_str = note.created_at.strftime('%Y-%m-%d %H:%M') if note.created_at else ''

            row_data = [
                note.site.ihs_site_id if note.site else '',
                note.site.mtn_id if note.site else '',
                note.site.cluster_name if note.site else '',
                note.site.state if note.site else '',
                note.category,
                note.priority,
                note.status,
                note.created_by,
                created_str,
                res_time,
                note.title,
                note.description,
            ]

            ws.row_dimensions[current_row].height = 36
            row_fill = fill_even if current_row % 2 == 0 else fill_odd

            for col_num, val in enumerate(row_data, 1):
                cell = ws.cell(row=current_row, column=col_num, value=val)
                cell.font = font_data
                cell.fill = row_fill
                cell.border = border_cell

                if col_num in [1, 2, 3, 4, 5, 6, 7, 9, 10]:
                    cell.alignment = align_center
                else:
                    cell.alignment = align_left

                if col_num == 1:
                    cell.font = font_bold

                if col_num == 6 and val in priority_styles:
                    p_font, p_fill = priority_styles[val]
                    cell.font = p_font
                    cell.fill = p_fill

                if col_num == 7 and val in status_styles:
                    s_font, s_fill = status_styles[val]
                    cell.font = s_font
                    cell.fill = s_fill

                if col_num == 10:
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
            5: 22, # Category
            6: 14, # Priority
            7: 15, # Status
            8: 24, # Logged By
            9: 20, # Created Date & Time
            10: 22, # Resolution Time
            11: 32, # Title
            12: 55, # Description
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
        
        category = self.request.query_params.get('category', None)
        if category and category != 'All':
            qs = qs.filter(category__iexact=category)

        priority = self.request.query_params.get('priority', None)
        if priority and priority != 'All':
            qs = qs.filter(priority__iexact=priority)

        status_param = self.request.query_params.get('status', None)
        if status_param and status_param != 'All':
            qs = qs.filter(status__iexact=status_param)

        search = self.request.query_params.get('search', None)
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search) | Q(created_by__icontains=search))

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
        for key in ['photos', 'attachments', 'file', 'photo']:
            files.extend(request.FILES.getlist(key))
            if key in request.FILES and request.FILES[key] not in files:
                files.append(request.FILES[key])

        for f in files:
            content_type = getattr(f, 'content_type', '') or ''
            file_type = 'Photo' if content_type.startswith('image/') else 'Document'
            SiteAttachment.objects.create(
                site=site,
                note=note,
                file=f,
                file_name=f.name,
                file_type=file_type,
                uploaded_by=note.created_by
            )

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        site_id_input = data.get('site_id_input') or data.get('site')
        site = None
        if site_id_input:
            if isinstance(site_id_input, int):
                site = Site.objects.filter(pk=site_id_input).first()
            else:
                site = Site.objects.filter(Q(ihs_site_id__iexact=str(site_id_input).strip()) | Q(pk=site_id_input if str(site_id_input).isdigit() else -1)).first()

        if not site and 'site' in data:
            site = Site.objects.filter(pk=data['site']).first()

        if not site:
            return Response({'error': f'Site "{site_id_input}" not found.'}, status=status.HTTP_400_BAD_REQUEST)

        data['site'] = site.id

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
