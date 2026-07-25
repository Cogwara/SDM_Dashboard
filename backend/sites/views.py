from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Count
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from .models import Site, Notification
from notes.models import SiteNote
from whatsapp.models import WhatsAppMessage
from .serializers import SiteSerializer, SiteDetailSerializer, NotificationSerializer

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
            site_sample = Site.objects.filter(sdm_name__icontains=user.first_name).first()
            phone = site_sample.sdm_phone if site_sample else '0800-000-000'
            assigned_count = Site.objects.filter(sdm_name__icontains=user.first_name).count()
            role = 'Super Administrator' if user.is_superuser else 'State Delivery Manager'

            return Response({
                'token': f"sdm-jwt-token-{user.id}-fct-2026",
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'full_name': full_name,
                    'email': user.email,
                    'phone': phone,
                    'role': role,
                    'is_superuser': user.is_superuser,
                    'assigned_sites_count': assigned_count if not user.is_superuser else Site.objects.count(),
                    'region': 'Federal Capital Territory (FCT)'
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

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        sdm = request.query_params.get('sdm', '').strip()
        qs = Notification.objects.filter(is_read=False)
        if sdm and sdm != 'All':
            qs = qs.filter(Q(site__sdm_name__icontains=sdm) | Q(site__isnull=True))
        qs.update(is_read=True)
        return Response({'status': 'all marked as read'})
