from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Count, Sum
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from .models import Site, Notification, TNLLink
from notes.models import SiteNote
from whatsapp.models import WhatsAppMessage
from .serializers import SiteSerializer, SiteDetailSerializer, NotificationSerializer, TNLLinkSerializer

class FlexiblePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 25000

class SiteViewSet(viewsets.ModelViewSet):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer
    pagination_class = FlexiblePagination

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SiteDetailSerializer
        return SiteSerializer

    def get_filtered_queryset(self, exclude_param=None):
        qs = Site.objects.all()
        q = self.request.query_params.get('search', None)
        if q:
            qs = qs.filter(
                Q(ihs_site_id__icontains=q) |
                Q(mtn_id__icontains=q) |
                Q(cluster_name__icontains=q) |
                Q(site_address__icontains=q) |
                Q(lga__icontains=q) |
                Q(state__icontains=q) |
                Q(sdm_name__icontains=q) |
                Q(smc_fse_name__icontains=q) |
                Q(mtn_rdm_name__icontains=q) |
                Q(operational_status__icontains=q) |
                Q(power_solution__icontains=q)
            )

        status_filter = self.request.query_params.get('status', None)
        if status_filter and exclude_param != 'status':
            if status_filter == 'Down':
                qs = qs.filter(is_down=True)
            elif status_filter == 'Critical':
                qs = qs.filter(is_critical=True)
            elif status_filter != 'All':
                qs = qs.filter(operational_status__iexact=status_filter)

        priority = self.request.query_params.get('priority', None)
        if priority and priority != 'All' and exclude_param != 'priority':
            qs = qs.filter(priority__iexact=priority)

        state = self.request.query_params.get('state', None)
        if state and state != 'All' and exclude_param != 'state':
            qs = qs.filter(state__iexact=state)

        sdm = self.request.query_params.get('sdm', None)
        if sdm and sdm != 'All' and exclude_param != 'sdm':
            qs = qs.filter(sdm_name__icontains=sdm)

        fse = self.request.query_params.get('fse', None)
        if fse and fse != 'All' and exclude_param != 'fse':
            qs = qs.filter(smc_fse_name__icontains=fse)

        rdm = self.request.query_params.get('rdm', None)
        if rdm and rdm != 'All' and exclude_param != 'rdm':
            qs = qs.filter(mtn_rdm_name__icontains=rdm)

        cluster = self.request.query_params.get('cluster', None)
        if cluster and cluster != 'All' and exclude_param != 'cluster':
            qs = qs.filter(cluster_name__iexact=cluster)

        lga = self.request.query_params.get('lga', None)
        if lga and lga != 'All' and exclude_param != 'lga':
            qs = qs.filter(lga__iexact=lga)

        return qs

    def get_queryset(self):
        return self.get_filtered_queryset().order_by('ihs_site_id')

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        site_id = request.query_params.get('site_id', '').strip()
        if not site_id:
            return Response({'error': 'site_id query param required'}, status=status.HTTP_400_BAD_REQUEST)
        
        site = Site.objects.filter(Q(ihs_site_id__iexact=site_id) | Q(mtn_id__iexact=site_id)).first()
        if not site:
            site = Site.objects.filter(Q(ihs_site_id__icontains=site_id) | Q(mtn_id__icontains=site_id)).first()

        if not site:
            return Response({'error': f'Site {site_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = SiteDetailSerializer(site)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        def get_distinct(field_name, custom_qs):
            return list(custom_qs.values_list(field_name, flat=True).distinct().exclude(**{f"{field_name}": ''}))

        qs_state = self.get_filtered_queryset(exclude_param='state')
        qs_sdm = self.get_filtered_queryset(exclude_param='sdm')
        qs_fse = self.get_filtered_queryset(exclude_param='fse')
        qs_rdm = self.get_filtered_queryset(exclude_param='rdm')

        return Response({
            'states': sorted([s for s in get_distinct('state', qs_state) if s]),
            'sdm_names': sorted([s for s in get_distinct('sdm_name', qs_sdm) if s]),
            'fse_names': sorted([f for f in get_distinct('smc_fse_name', qs_fse) if f]),
            'rdm_names': sorted([r for r in get_distinct('mtn_rdm_name', qs_rdm) if r]),
        })


class SDMLoginView(APIView):
    def post(self, request):
        username_or_name = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username_or_name or not password:
            return Response({'error': 'Username and Password required.'}, status=status.HTTP_400_BAD_REQUEST)

        norm_username = username_or_name.lower().replace(' ', '_')
        user = authenticate(username=norm_username, password=password)

        if not user:
            # Fallback check
            user = User.objects.filter(
                Q(username__iexact=norm_username) | 
                Q(first_name__icontains=username_or_name) |
                Q(email__icontains=norm_username)
            ).first()
            if user and not user.check_password(password):
                user = None

        if user:
            full_name = f"{user.first_name} {user.last_name}".strip() or user.username
            
            # Smart search matching for SDM sites
            assigned_sites_qs = Site.objects.filter(sdm_name__iexact=full_name)
            if not assigned_sites_qs.exists() and full_name:
                assigned_sites_qs = Site.objects.filter(sdm_name__icontains=full_name)
            if not assigned_sites_qs.exists() and user.first_name and user.last_name:
                assigned_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name).filter(sdm_name__icontains=user.last_name)
            if not assigned_sites_qs.exists() and user.first_name:
                assigned_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name)

            site_sample = assigned_sites_qs.first()
            phone = site_sample.sdm_phone if (site_sample and site_sample.sdm_phone) else '0800-000-000'
            assigned_count = assigned_sites_qs.count()
            role = 'Super Administrator' if user.is_superuser else 'State Delivery Manager'

            # Gather all assigned state territories
            all_states_raw = assigned_sites_qs.values_list('state', flat=True).distinct()
            all_assigned_states = []
            for st in all_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in all_assigned_states:
                    all_assigned_states.append(clean_st)

            user_state = 'FCT'
            if all_assigned_states:
                user_state = all_assigned_states[0]

            if not all_assigned_states:
                all_assigned_states = ['FCT']

            return Response({
                'token': f"sdm-jwt-token-{user.id}-fct-2026",
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'full_name': full_name,
                    'email': user.email or f"{user.username}@fcttelecom.ng",
                    'phone': phone,
                    'role': role,
                    'is_superuser': user.is_superuser,
                    'assigned_sites_count': assigned_count if not user.is_superuser else Site.objects.count(),
                    'state': user_state if not user.is_superuser else 'ALL',
                    'assigned_states': all_assigned_states if not user.is_superuser else ['ALL'],
                    'region': f"{user_state} Territory" if not user.is_superuser else 'All Nigeria State Territories'
                }
            })

        return Response({'error': 'Invalid Username or Password.'}, status=status.HTTP_401_UNAUTHORIZED)


class SDMListView(APIView):
    def get(self, request):
        total_sites_count = Site.objects.count()

        # Pre-aggregate site counts per sdm_name in 1 single database query
        counts_raw = Site.objects.exclude(sdm_name__isnull=True).exclude(sdm_name='').values('sdm_name').annotate(cnt=Count('id'))
        counts_dict = {item['sdm_name'].strip().lower(): item['cnt'] for item in counts_raw}

        users = User.objects.all().order_by('-is_superuser', 'first_name')
        sdm_list = []
        registered_names = set()
        registered_usernames = set()

        for u in users:
            full_name = f"{u.first_name} {u.last_name}".strip() or u.username
            registered_usernames.add(u.username.lower())
            registered_names.add(full_name.lower())
            if u.first_name:
                registered_names.add(u.first_name.lower())

            # O(1) dictionary site count lookup
            if u.is_superuser:
                sites_cnt = total_sites_count
            else:
                fn_key = full_name.lower()
                first_key = u.first_name.lower() if u.first_name else ''
                sites_cnt = counts_dict.get(fn_key, 0) or (counts_dict.get(first_key, 0) if first_key else 0)
                if sites_cnt == 0:
                    for s_key, c_val in counts_dict.items():
                        if fn_key in s_key or (first_key and first_key in s_key):
                            sites_cnt += c_val

            sdm_list.append({
                'id': u.id,
                'username': u.username,
                'full_name': full_name,
                'email': u.email or f"{u.username}@fcttelecom.ng",
                'is_superuser': u.is_superuser,
                'role': 'Super Administrator' if u.is_superuser else 'State Delivery Manager',
                'assigned_sites': sites_cnt,
                'is_registered': True
            })

        # Include any remaining portfolio SDMs from Site database records
        for item in counts_raw:
            sdm_name_raw = item['sdm_name']
            sites_cnt = item['cnt']
            clean_name = sdm_name_raw.strip()
            if not clean_name:
                continue

            clean_lower = clean_name.lower()
            if clean_lower in registered_names:
                continue

            gen_username = clean_lower.replace(' ', '_')
            if gen_username in registered_usernames:
                continue

            sdm_list.append({
                'id': f"portfolio_sdm_{abs(hash(clean_name))}",
                'username': gen_username,
                'full_name': clean_name,
                'email': f"{gen_username}@fcttelecom.ng",
                'is_superuser': False,
                'role': 'State Delivery Manager',
                'assigned_sites': sites_cnt,
                'is_registered': False
            })

        return Response(sdm_list)


class RegisterSDMView(APIView):
    def post(self, request):
        full_name = request.data.get('full_name', '').strip()
        username = request.data.get('username', '').strip()
        email = request.data.get('email', '').strip()
        phone = request.data.get('phone', '').strip()
        password = request.data.get('password', '').strip()

        if not full_name or not username or not password:
            return Response({'error': 'Full Name, Username, and Password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        norm_username = username.lower().replace(' ', '_')
        if User.objects.filter(username=norm_username).exists():
            return Response({'error': f'Username "{norm_username}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        first_name = full_name.split()[0]
        last_name = ' '.join(full_name.split()[1:]) if len(full_name.split()) > 1 else ''

        user = User.objects.create_user(
            username=norm_username,
            password=password,
            email=email or f"{norm_username}@fcttelecom.ng",
            first_name=first_name,
            last_name=last_name,
            is_staff=True
        )

        return Response({
            'message': f'SDM account for {full_name} created successfully!',
            'user': {
                'id': user.id,
                'username': user.username,
                'full_name': full_name,
                'email': user.email,
                'phone': phone,
                'role': 'State Delivery Manager'
            }
        }, status=status.HTTP_201_CREATED)


class DashboardStatsView(APIView):
    def get(self, request):
        sdm = request.query_params.get('sdm', '').strip()
        
        sites_qs = Site.objects.all()
        if sdm and sdm != 'All':
            sites_qs = sites_qs.filter(sdm_name__icontains=sdm)

        total_sites = sites_qs.count()
        sites_down = sites_qs.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
        critical_sites = sites_qs.filter(Q(is_critical=True) | Q(priority__icontains='P1') | Q(priority__icontains='Critical')).count()

        notes_qs = SiteNote.objects.all()
        if sdm and sdm != 'All':
            notes_qs = notes_qs.filter(site__sdm_name__icontains=sdm)

        generator_faults = notes_qs.filter(category='Generator', status__in=['Open', 'In Progress', 'Escalated']).count()
        transmission_faults = notes_qs.filter(category='Transmission', status__in=['Open', 'In Progress', 'Escalated']).count()
        battery_faults = notes_qs.filter(category='Battery', status__in=['Open', 'In Progress', 'Escalated']).count()
        
        open_incidents = notes_qs.filter(status__in=['Open', 'In Progress', 'Escalated']).count()
        recent_notes_count = notes_qs.count()
        
        wa_qs = WhatsAppMessage.objects.all()
        if sdm and sdm != 'All':
            wa_qs = wa_qs.filter(site__sdm_name__icontains=sdm)
        recent_whatsapp_count = wa_qs.count()

        return Response({
            'total_sites': total_sites,
            'sites_down': sites_down,
            'critical_sites': critical_sites,
            'commercial_power_outage': 0,
            'generator_faults': generator_faults,
            'transmission_faults': transmission_faults,
            'battery_faults': battery_faults,
            'open_incidents': open_incidents,
            'recent_notes_count': recent_notes_count,
            'recent_whatsapp_count': recent_whatsapp_count,
        })


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = Notification.objects.all().order_by('-created_at')
        sdm = self.request.query_params.get('sdm', '').strip()
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(site__isnull=True))
        return qs

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save()
        return Response({'status': 'marked as read'})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        sdm = request.query_params.get('sdm', '').strip()
        qs = Notification.objects.filter(is_read=False)
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(site__isnull=True))
        updated = qs.update(is_read=True)
        return Response({'status': f'marked {updated} notifications as read'})


class AssignStateToSDMView(APIView):
    def post(self, request):
        sdm_name = request.data.get('sdm_name', '').strip()
        raw_state = request.data.get('state', '').strip()
        site_ids = request.data.get('site_ids', None)
        sdm_phone = request.data.get('sdm_phone', '').strip()

        if not sdm_name:
            return Response({'error': 'SDM Manager Name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        matching_sites = Site.objects.none()
        clean_state = ''

        if site_ids:
            if isinstance(site_ids, str):
                s_list = [s.strip().upper() for s in site_ids.split(',') if s.strip()]
            elif isinstance(site_ids, list):
                s_list = [str(s).strip().upper() for s in site_ids if str(s).strip()]
            else:
                s_list = []
            matching_sites = Site.objects.filter(ihs_site_id__in=s_list)

        elif raw_state:
            clean_state = raw_state.split('(')[0].strip()
            matching_sites = Site.objects.filter(Q(state__iexact=clean_state) | Q(state__iexact=f"RT{clean_state}"))
            if matching_sites.count() == 0:
                matching_sites = Site.objects.filter(state__icontains=clean_state)

        total_matching = matching_sites.count()
        if total_matching == 0:
            return Response({'error': 'No matching telecom sites found for assignment.'}, status=status.HTTP_404_NOT_FOUND)

        # Update sdm_name (and phone if provided) across all matching sites
        update_data = {'sdm_name': sdm_name}
        if sdm_phone:
            update_data['sdm_phone'] = sdm_phone

        updated_rows = matching_sites.update(**update_data)

        # Sync user object if found
        user_obj = User.objects.filter(Q(first_name__iexact=sdm_name) | Q(username__iexact=sdm_name.lower().replace(' ', '_'))).first()
        if user_obj and not user_obj.first_name:
            parts = sdm_name.split()
            user_obj.first_name = parts[0]
            user_obj.last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
            user_obj.save()

        return Response({
            'message': f'Successfully assigned {updated_rows} site(s) to SDM Manager {sdm_name}!',
            'state': clean_state,
            'sdm_name': sdm_name,
            'updated_count': updated_rows
        }, status=status.HTTP_200_OK)


class AvailableStatesView(APIView):
    def get(self, request):
        states_query = Site.objects.exclude(state__isnull=True).exclude(state='').values('state').annotate(count=Count('id')).order_by('state')
        aggregated = {}
        for item in states_query:
            st = item['state'].strip().upper()
            if not st:
                continue
            if st.startswith('RT') and len(st) > 2:
                st = st[2:]
            aggregated[st] = aggregated.get(st, 0) + item['count']

        res = [{'state': st, 'count': cnt} for st, cnt in sorted(aggregated.items()) if cnt > 0]
        return Response(res)


class BulkSiteNotesLookupView(APIView):
    def post(self, request):
        raw_ids = request.data.get('site_ids', '')
        if isinstance(raw_ids, list):
            site_ids_list = [str(x).strip().upper() for x in raw_ids if str(x).strip()]
        elif isinstance(raw_ids, str):
            import re
            tokens = re.split(r'[,\s\n\r\t]+', raw_ids)
            site_ids_list = [t.strip().upper() for t in tokens if t.strip()]
        else:
            site_ids_list = []

        if not site_ids_list:
            return Response({'error': 'Please provide at least one Site ID.'}, status=status.HTTP_400_BAD_REQUEST)

        unique_ids = list(dict.fromkeys(site_ids_list))

        sites = Site.objects.filter(
            Q(ihs_site_id__in=unique_ids) | Q(mtn_id__in=unique_ids) | Q(cascade__in=unique_ids)
        ).prefetch_related('notes', 'notes__attachments')

        site_map = {}
        for s in sites:
            site_map[s.ihs_site_id.upper()] = s
            if s.mtn_id:
                site_map[s.mtn_id.upper()] = s
            if s.cascade:
                site_map[s.cascade.upper()] = s

        results = []
        for sid in unique_ids:
            site_obj = site_map.get(sid)
            if site_obj:
                raw_specs = site_obj.raw_data or {}
                fse_name = site_obj.smc_fse_name or raw_specs.get('FSE NAME') or 'Unassigned'
                fse_phone = site_obj.smc_fse_phone or raw_specs.get('FSE CONTACT NO.') or 'N/A'
                efs_name = site_obj.efs_name or raw_specs.get('Project MANAGER') or 'N/A'
                efs_phone = site_obj.efs_phone or raw_specs.get('Project MANAGER CONTACT') or 'N/A'
                rto_name = site_obj.rto_name or raw_specs.get('Switch Engineer') or 'N/A'
                
                notes_data = []
                for n in site_obj.notes.all().order_by('-created_at'):
                    notes_data.append({
                        'id': n.id,
                        'title': n.title,
                        'category': n.category,
                        'priority': n.priority,
                        'status': n.status,
                        'description': n.description,
                        'created_by': n.created_by,
                        'created_at': n.created_at.strftime('%Y-%m-%d %H:%M'),
                        'attachments_count': n.attachments.count()
                    })

                tnl_segment = raw_specs.get('TNL Segment') or 'N/A'
                tnl_distance_km = raw_specs.get('TNL Link Distance km') or 0.0
                maintenance_fmp = raw_specs.get('Maintenance FMP') or 'TNL'

                results.append({
                    'query_id': sid,
                    'found': True,
                    'id': site_obj.id,
                    'ihs_site_id': site_obj.ihs_site_id,
                    'mtn_id': site_obj.mtn_id or 'N/A',
                    'cascade': site_obj.cascade or 'N/A',
                    'state': site_obj.state or 'FCT',
                    'region': site_obj.region or 'Abuja',
                    'lga': site_obj.lga or 'N/A',
                    'cluster_name': site_obj.cluster_name or 'N/A',
                    'priority': site_obj.priority or 'P2',
                    'operational_status': site_obj.operational_status or 'Operational',
                    'is_down': site_obj.is_down,
                    'is_critical': site_obj.is_critical,
                    'fse_name': fse_name,
                    'fse_phone': fse_phone,
                    'efs_name': efs_name,
                    'efs_phone': efs_phone,
                    'rto_name': rto_name,
                    'sdm_name': site_obj.sdm_name or 'Unassigned',
                    'sdm_phone': site_obj.sdm_phone or 'N/A',
                    'site_address': site_obj.site_address or '',
                    'tnl_segment': tnl_segment,
                    'tnl_distance_km': tnl_distance_km,
                    'maintenance_fmp': maintenance_fmp,
                    'notes_count': len(notes_data),
                    'notes': notes_data
                })
            else:
                results.append({
                    'query_id': sid,
                    'found': False,
                    'ihs_site_id': sid,
                    'mtn_id': 'N/A',
                    'state': 'Unknown',
                    'operational_status': 'Not Found',
                    'fse_name': 'Not Found',
                    'fse_phone': 'N/A',
                    'sdm_name': 'N/A',
                    'notes_count': 0,
                    'notes': []
                })

        return Response({
            'total_queried': len(unique_ids),
            'found_count': sum(1 for r in results if r['found']),
            'not_found_count': sum(1 for r in results if not r['found']),
            'results': results
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        sdm = request.query_params.get('sdm', '').strip()
        qs = Notification.objects.filter(is_read=False)
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(site__isnull=True))
        qs.update(is_read=True)
        return Response({'status': 'all marked as read'})


class TNLLinkViewSet(viewsets.ModelViewSet):
    queryset = TNLLink.objects.all()
    serializer_class = TNLLinkSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = TNLLink.objects.all()

        sdm_name = self.request.query_params.get('sdm', None)
        is_superuser = self.request.query_params.get('is_superuser', 'true').lower() == 'true'

        if sdm_name and not is_superuser:
            sdm_states_raw = Site.objects.filter(sdm_name__icontains=sdm_name).values_list('state', flat=True).distinct()
            sdm_states = []
            for st in sdm_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in sdm_states:
                    sdm_states.append(clean_st)

            if sdm_states:
                qs = qs.filter(state__in=sdm_states)

        q = self.request.query_params.get('search', None)
        if q:
            qs = qs.filter(
                Q(segment_name__icontains=q) |
                Q(site_a__icontains=q) |
                Q(site_b__icontains=q) |
                Q(state__icontains=q) |
                Q(region__icontains=q) |
                Q(network_type__icontains=q) |
                Q(old_fmp__icontains=q) |
                Q(maintenance_fmp__icontains=q)
            )

        state = self.request.query_params.get('state', None)
        if state and state != 'All':
            clean_st = state.split('(')[0].strip()
            qs = qs.filter(state__iexact=clean_st)

        network_type = self.request.query_params.get('network_type', None)
        if network_type and network_type != 'All':
            qs = qs.filter(network_type__iexact=network_type)

        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = TNLLink.objects.all()

        sdm_name = request.query_params.get('sdm', None)
        is_superuser = request.query_params.get('is_superuser', 'true').lower() == 'true'

        sdm_assigned_states = []
        if sdm_name and not is_superuser:
            sdm_states_raw = Site.objects.filter(sdm_name__icontains=sdm_name).values_list('state', flat=True).distinct()
            for st in sdm_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in sdm_assigned_states:
                    sdm_assigned_states.append(clean_st)

            if sdm_assigned_states:
                qs = qs.filter(state__in=sdm_assigned_states)

        total_links = qs.count()
        fct_links = qs.filter(state__iexact='FCT').count()
        lagos_links = qs.filter(state__iexact='LAGOS').count()
        total_km = qs.aggregate(total=Sum('distance_km'))['total'] or 0.0
        
        states = list(qs.values('state').annotate(count=Count('id')).order_by('-count'))
        
        return Response({
            'total_links': total_links,
            'fct_links': fct_links,
            'lagos_links': lagos_links,
            'total_distance_km': round(total_km, 2),
            'states': states,
            'sdm_assigned_states': sdm_assigned_states
        })

    @action(detail=True, methods=['get'])
    def impact(self, request, pk=None):
        import math
        tnl = self.get_object()
        
        site_a_code = tnl.site_a.strip().upper() if tnl.site_a else ''
        site_b_code = tnl.site_b.strip().upper() if tnl.site_b else ''
        
        site_a_obj = tnl.site_a_ref or (Site.objects.filter(ihs_site_id__iexact=site_a_code).first() if site_a_code else None)
        site_b_obj = tnl.site_b_ref or (Site.objects.filter(ihs_site_id__iexact=site_b_code).first() if site_b_code else None)
        
        def haversine_km(lat1, lon1, lat2, lon2):
            if None in (lat1, lon1, lat2, lon2):
                return 9999.0
            R = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return R * c

        def serialize_site(site_obj, code, role):
            if site_obj:
                raw_specs = site_obj.raw_data or {}
                return {
                    'query_id': code,
                    'found': True,
                    'id': site_obj.id,
                    'ihs_site_id': site_obj.ihs_site_id,
                    'mtn_id': site_obj.mtn_id or 'N/A',
                    'cascade': site_obj.cascade or 'N/A',
                    'role': role,
                    'priority': site_obj.priority or 'P2',
                    'operational_status': site_obj.operational_status or 'Operational',
                    'is_down': site_obj.is_down,
                    'state': site_obj.state or tnl.state,
                    'cluster_name': site_obj.cluster_name or tnl.region,
                    'fse_name': site_obj.smc_fse_name or raw_specs.get('FES NAME') or 'Unassigned',
                    'fse_phone': site_obj.smc_fse_phone or raw_specs.get('FES CONTACT NUMBER') or 'N/A',
                    'efs_name': site_obj.efs_name or raw_specs.get('Project MANAGER NAME') or 'N/A',
                    'sdm_name': site_obj.sdm_name or 'Unassigned',
                    'sdm_phone': site_obj.sdm_phone or 'N/A',
                }
            else:
                return {
                    'query_id': code,
                    'found': False,
                    'ihs_site_id': code,
                    'role': role,
                    'priority': 'P2',
                    'operational_status': 'Unknown',
                    'is_down': True,
                    'state': tnl.state,
                    'cluster_name': tnl.region or 'FCT',
                    'fse_name': 'Unassigned',
                    'fse_phone': 'N/A',
                    'efs_name': 'N/A',
                    'sdm_name': 'Unassigned',
                    'sdm_phone': 'N/A',
                }

        impacted_sites = []
        if site_a_code:
            impacted_sites.append(serialize_site(site_a_obj, site_a_code, 'Site A (Transmission Hub)'))
        if site_b_code:
            impacted_sites.append(serialize_site(site_b_obj, site_b_code, 'Site B (Downstream Receiver)'))

        # Cascading downstream sites
        cascading_codes = set()
        if site_b_code:
            downstream_links = TNLLink.objects.filter(site_a__iexact=site_b_code).exclude(id=tnl.id)
            for d_link in downstream_links:
                if d_link.site_b and d_link.site_b != site_a_code and d_link.site_b not in [site_a_code, site_b_code]:
                    cascading_codes.add(d_link.site_b)

        for c_code in cascading_codes:
            c_obj = Site.objects.filter(ihs_site_id__iexact=c_code).first()
            impacted_sites.append(serialize_site(c_obj, c_code, 'Cascading Downstream Site'))

        # Geospatial Proximity Scan (Sites within 2.5km of Site A or Site B)
        already_added_ids = set()
        if site_a_obj: already_added_ids.add(site_a_obj.id)
        if site_b_obj: already_added_ids.add(site_b_obj.id)
        for s in impacted_sites:
            if s.get('id'): already_added_ids.add(s['id'])

        proximate_sites = []
        anchor_coords = []
        if site_a_obj and site_a_obj.latitude and site_a_obj.longitude:
            anchor_coords.append(('Site A', site_a_obj.latitude, site_a_obj.longitude))
        if site_b_obj and site_b_obj.latitude and site_b_obj.longitude:
            anchor_coords.append(('Site B', site_b_obj.latitude, site_b_obj.longitude))

        if anchor_coords:
            cand_qs = Site.objects.filter(latitude__isnull=False, longitude__isnull=False).exclude(id__in=already_added_ids)
            for c_site in cand_qs:
                min_d = 9999.0
                closest_anchor = ''
                for anchor_name, a_lat, a_lon in anchor_coords:
                    d = haversine_km(a_lat, a_lon, c_site.latitude, c_site.longitude)
                    if d < min_d:
                        min_d = d
                        closest_anchor = anchor_name
                
                if min_d <= 1.5: # 1.5 km radius threshold
                    s_data = serialize_site(c_site, c_site.ihs_site_id, f"Geographical Proximity ({min_d:.2f}km from {closest_anchor})")
                    s_data['distance_from_anchor_km'] = round(min_d, 2)
                    proximate_sites.append(s_data)

            proximate_sites.sort(key=lambda x: x.get('distance_from_anchor_km', 9999))
            impacted_sites.extend(proximate_sites[:15])

        return Response({
            'link_id': tnl.id,
            'segment_name': tnl.segment_name,
            'state': tnl.state,
            'region': tnl.region,
            'site_a': tnl.site_a,
            'site_b': tnl.site_b,
            'distance_km': tnl.distance_km,
            'network_type': tnl.network_type,
            'maintenance_fmp': tnl.maintenance_fmp,
            'total_sites_at_risk': len(impacted_sites),
            'direct_sites_count': 2 if (site_a_code and site_b_code) else 1,
            'cascading_sites_count': len(cascading_codes),
            'proximate_sites_count': len(proximate_sites[:15]),
            'impacted_sites': impacted_sites
        })
