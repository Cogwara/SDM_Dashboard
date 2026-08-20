import time
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q, Count, Sum, Avg, Min, Max
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from .models import Site, Notification, TNLLink, IHSFiberLink, HuaweiFiberLink
from notes.models import SiteNote
from whatsapp.models import WhatsAppMessage
from .serializers import SiteSerializer, SiteDetailSerializer, NotificationSerializer, TNLLinkSerializer, IHSFiberLinkSerializer, HuaweiFiberLinkSerializer

# Brute-Force Lockout Tracking (5 attempts per 15 mins)
FAILED_LOGIN_ATTEMPTS = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes

def is_account_locked(client_ip, username):
    key = f"{client_ip}:{username.lower()}"
    now = time.time()
    attempts = FAILED_LOGIN_ATTEMPTS.get(key, [])
    valid_attempts = [t for t in attempts if now - t < LOCKOUT_DURATION_SECONDS]
    FAILED_LOGIN_ATTEMPTS[key] = valid_attempts
    return len(valid_attempts) >= MAX_FAILED_ATTEMPTS

def record_failed_attempt(client_ip, username):
    key = f"{client_ip}:{username.lower()}"
    now = time.time()
    attempts = FAILED_LOGIN_ATTEMPTS.get(key, [])
    attempts.append(now)
    FAILED_LOGIN_ATTEMPTS[key] = attempts

def clear_failed_attempts(client_ip, username):
    key = f"{client_ip}:{username.lower()}"
    if key in FAILED_LOGIN_ATTEMPTS:
        del FAILED_LOGIN_ATTEMPTS[key]

class FlexiblePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 25000

def scope_queryset_by_user(qs, request, site_id_field='ihs_site_id', state_field='state'):
    # Check superuser override
    is_superuser = request.query_params.get('is_superuser', '').lower() == 'true'
    if request.user and request.user.is_authenticated and request.user.is_superuser:
        is_superuser = True

    # 1. Super Admin: Sees ALL sites nationally across Nigeria
    if is_superuser:
        return qs

    # Extract user role, state, and identity parameters
    user_role = request.query_params.get('user_role', '')
    explicit_state = request.query_params.get('state', None)
    user_state = request.query_params.get('user_state', '')
    sdm_param = request.query_params.get('sdm', '') or request.query_params.get('user_name', '')
    fse_param = request.query_params.get('fse', '') or request.query_params.get('fse_name', '')

    if request.user and request.user.is_authenticated:
        full_n = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        is_fse_group = request.user.groups.filter(name__icontains='FSE').exists()
        if is_fse_group or user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE']:
            user_role = 'SMC FSE Engineer'
            fse_param = fse_param or full_n
        else:
            if not user_role and not request.user.is_superuser:
                user_role = 'State Delivery Manager'
            sdm_param = sdm_param or full_n

    # 2. SMC FSE Engineer: Sees ONLY their own assigned sites
    if (user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'] or (fse_param and fse_param != 'All' and fse_param != 'undefined')) and fse_param != 'undefined':
        target_fse = fse_param if (fse_param and fse_param != 'All' and fse_param != 'undefined') else (sdm_param if user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'] else None)
        if target_fse and target_fse != 'All' and target_fse != 'undefined':
            clean_fse = target_fse.strip()
            parts = [p for p in clean_fse.split() if len(p) >= 3]
            fse_q = Q(smc_fse_name__iexact=clean_fse) | Q(smc_fse_name__icontains=clean_fse) | Q(mtn_fse_name__icontains=clean_fse)
            if len(parts) >= 2:
                fse_q |= (Q(smc_fse_name__icontains=parts[0]) & Q(smc_fse_name__icontains=parts[-1]))

            if site_id_field == 'site_id':
                # For DailyAvailabilityRecord / HourlyAvailabilityRecord
                fse_site_ids = list(Site.objects.filter(fse_q).values_list('ihs_site_id', flat=True))
                if fse_site_ids:
                    return qs.filter(Q(site_id__in=fse_site_ids) | Q(element_name__icontains=clean_fse))
                return qs.filter(Q(site_id__icontains=clean_fse) | Q(element_name__icontains=clean_fse))
            else:
                # For Site model
                return qs.filter(fse_q)

    # 3. State Delivery Manager (SDM): If an explicit state filter is provided, enforce it directly
    if explicit_state and explicit_state != 'All':
        clean_st = explicit_state.strip().upper()
        if clean_st.startswith('RT') and len(clean_st) > 2:
            clean_st = clean_st[2:]
        return qs.filter(**{f'{state_field}__iexact': clean_st})

    matched_states = []
    if user_state and user_state != 'ALL' and user_state != 'All':
        clean_st = user_state.strip().upper()
        if clean_st.startswith('RT') and len(clean_st) > 2:
            clean_st = clean_st[2:]
        matched_states.append(clean_st)

    if sdm_param and sdm_param != 'All':
        sdm_states_raw = Site.objects.filter(
            Q(sdm_name__iexact=sdm_param) | Q(sdm_name__icontains=sdm_param)
        ).values_list(state_field, flat=True).distinct()
        for st in sdm_states_raw:
            if not st: continue
            clean_st = st.strip().upper()
            if clean_st.startswith('RT') and len(clean_st) > 2:
                clean_st = clean_st[2:]
            if clean_st and clean_st not in matched_states:
                matched_states.append(clean_st)

    if matched_states:
        return qs.filter(**{f'{state_field}__in': matched_states})

    return qs


class SiteViewSet(viewsets.ModelViewSet):
    serializer_class = SiteSerializer
    pagination_class = FlexiblePagination

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SiteDetailSerializer
        return SiteSerializer

    def get_filtered_queryset(self, exclude_param=None):
        qs = Site.objects.all()
        qs = scope_queryset_by_user(qs, self.request, site_id_field='ihs_site_id', state_field='state')
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
        qs_lga = self.get_filtered_queryset(exclude_param='lga')
        qs_sdm = self.get_filtered_queryset(exclude_param='sdm')
        qs_fse = self.get_filtered_queryset(exclude_param='fse')
        qs_rdm = self.get_filtered_queryset(exclude_param='rdm')

        return Response({
            'states': sorted([s for s in get_distinct('state', qs_state) if s]),
            'lgas': sorted([l for l in get_distinct('lga', qs_lga) if l]),
            'sdm_names': sorted([s for s in get_distinct('sdm_name', qs_sdm) if s]),
            'fse_names': sorted([f for f in get_distinct('smc_fse_name', qs_fse) if f]),
            'rdm_names': sorted([r for r in get_distinct('mtn_rdm_name', qs_rdm) if r]),
        })


class SDMLoginView(APIView):
    def post(self, request):
        client_ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '127.0.0.1')
        username_or_name = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username_or_name or not password:
            return Response({'error': 'Username and Password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check for account lockout due to brute-force attempts
        if is_account_locked(client_ip, username_or_name):
            return Response({
                'error': 'Account temporarily locked due to 5 consecutive failed login attempts. Please try again after 15 minutes or contact your system administrator.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

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

        if not user:
            record_failed_attempt(client_ip, username_or_name)
            key = f"{client_ip}:{username_or_name.lower()}"
            attempts_count = len(FAILED_LOGIN_ATTEMPTS.get(key, []))
            remaining = max(0, MAX_FAILED_ATTEMPTS - attempts_count)
            if remaining > 0:
                err_msg = f'Invalid username or password. {remaining} attempt(s) remaining before account lockout.'
            else:
                err_msg = 'Account locked due to 5 consecutive failed login attempts. Please try again after 15 minutes.'
            return Response({'error': err_msg}, status=status.HTTP_401_UNAUTHORIZED)

        # Clear failed attempts counter on clean authentication
        clear_failed_attempts(client_ip, username_or_name)

        # Generate cryptographically signed JWT Tokens
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        
        # Check if user is in 'SMC FSE Engineer' group or has matching FSE sites
        is_fse_group = user.groups.filter(name='SMC FSE Engineer').exists()
        clean_user_name = full_name if (user.first_name and user.last_name) else user.username.replace('_', ' ')
        parts = [p for p in clean_user_name.split() if len(p) >= 3]

        fse_query = Q(smc_fse_name__iexact=full_name) | Q(smc_fse_name__iexact=clean_user_name) | Q(smc_fse_name__icontains=full_name)
        if len(parts) >= 2:
            fse_query |= (Q(smc_fse_name__icontains=parts[0]) & Q(smc_fse_name__icontains=parts[-1]))
        elif user.first_name:
            fse_query |= Q(smc_fse_name__icontains=user.first_name)

        fse_sites_qs = Site.objects.filter(fse_query)

        sdm_sites_qs = Site.objects.filter(sdm_name__iexact=full_name)
        if not sdm_sites_qs.exists() and full_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=full_name)
        if not sdm_sites_qs.exists() and user.first_name and user.last_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name).filter(sdm_name__icontains=user.last_name)
        if not sdm_sites_qs.exists() and user.first_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name)

        is_fse = is_fse_group or (fse_sites_qs.exists() and not sdm_sites_qs.exists())

        if user.is_superuser:
            role = 'Super Administrator'
            assigned_sites_qs = Site.objects.all()
            assigned_count = assigned_sites_qs.count()
            user_state = 'ALL'
            all_assigned_states = ['ALL']
            phone = '0800-000-000'
        elif is_fse:
            role = 'SMC FSE Engineer'
            assigned_sites_qs = fse_sites_qs
            assigned_count = assigned_sites_qs.count()
            site_sample = assigned_sites_qs.first()
            phone = getattr(site_sample, 'smc_fse_phone', None) or '0800-000-000'
            user_state = 'FSE_ONLY'
            all_assigned_states = ['FSE_ONLY']
        else:
            role = 'State Delivery Manager'
            assigned_sites_qs = sdm_sites_qs
            assigned_count = assigned_sites_qs.count()
            site_sample = assigned_sites_qs.first()
            phone = getattr(site_sample, 'sdm_phone', None) or '0800-000-000'

            all_states_raw = assigned_sites_qs.values_list('state', flat=True).distinct()
            all_assigned_states = []
            for st in all_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in all_assigned_states:
                    all_assigned_states.append(clean_st)

            user_state = all_assigned_states[0] if all_assigned_states else 'FCT'
            if not all_assigned_states:
                all_assigned_states = ['FCT']

        return Response({
            'token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'username': user.username,
                'full_name': full_name,
                'email': user.email or f"{user.username}@fcttelecom.ng",
                'phone': phone,
                'role': role,
                'is_superuser': user.is_superuser,
                'assigned_sites_count': assigned_count,
                'state': user_state,
                'assigned_states': all_assigned_states,
                'region': f"{user_state} Territory" if role != 'Super Administrator' and role != 'SMC FSE Engineer' else ('All Nigeria State Territories' if user.is_superuser else f'Assigned FSE Sites ({assigned_count} Sites)')
            }
        })


class SDMListView(APIView):
    def get(self, request):
        total_sites_count = Site.objects.count()

        counts_raw = Site.objects.exclude(sdm_name__isnull=True).exclude(sdm_name='').values('sdm_name').annotate(cnt=Count('id'))
        counts_dict = {item['sdm_name'].strip().lower(): item['cnt'] for item in counts_raw}

        fse_counts_raw = Site.objects.exclude(smc_fse_name__isnull=True).exclude(smc_fse_name='').values('smc_fse_name').annotate(cnt=Count('id'))
        fse_counts_dict = {item['smc_fse_name'].strip().lower(): item['cnt'] for item in fse_counts_raw}

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

            is_fse_group = u.groups.filter(name='SMC FSE Engineer').exists()
            if u.is_superuser:
                role = 'Super Administrator'
                cnt = total_sites_count
            elif is_fse_group:
                role = 'SMC FSE Engineer'
                cnt = fse_counts_dict.get(full_name.lower(), 0)
                if cnt == 0 and u.first_name:
                    cnt = fse_counts_dict.get(u.first_name.lower(), 0)
            else:
                role = 'State Delivery Manager'
                cnt = counts_dict.get(full_name.lower(), 0)
                if cnt == 0 and u.first_name:
                    cnt = counts_dict.get(u.first_name.lower(), 0)

            sdm_list.append({
                'id': u.id,
                'username': u.username,
                'full_name': full_name,
                'email': u.email,
                'is_superuser': u.is_superuser,
                'role': role,
                'assigned_sites_count': cnt,
                'is_registered': True
            })

        unregistered_sdms = Site.objects.exclude(sdm_name__isnull=True).exclude(sdm_name='').values_list('sdm_name', flat=True).distinct()
        for raw_name in unregistered_sdms:
            if not raw_name: continue
            clean_n = raw_name.strip()
            lower_n = clean_n.lower()

            if lower_n in registered_names:
                continue

            cnt = counts_dict.get(lower_n, 0)
            suggested_user = lower_n.replace(' ', '_')

            sdm_list.append({
                'id': f"unreg-sdm-{suggested_user}",
                'username': suggested_user,
                'full_name': clean_n,
                'email': f"{suggested_user}@fcttelecom.ng",
                'is_superuser': False,
                'role': 'State Delivery Manager',
                'assigned_sites_count': cnt,
                'is_registered': False
            })

        unregistered_fses = Site.objects.exclude(smc_fse_name__isnull=True).exclude(smc_fse_name='').values_list('smc_fse_name', flat=True).distinct()
        for raw_name in unregistered_fses:
            if not raw_name: continue
            clean_n = raw_name.strip()
            lower_n = clean_n.lower()

            if lower_n in registered_names:
                continue

            cnt = fse_counts_dict.get(lower_n, 0)
            suggested_user = f"fse_{lower_n.replace(' ', '_')}"

            sdm_list.append({
                'id': f"unreg-fse-{suggested_user}",
                'username': suggested_user,
                'full_name': clean_n,
                'email': f"{suggested_user}@fcttelecom.ng",
                'is_superuser': False,
                'role': 'SMC FSE Engineer',
                'assigned_sites_count': cnt,
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
        role = request.data.get('role', 'State Delivery Manager').strip()

        if not full_name or not username or not password:
            return Response({'error': 'Full Name, Username, and Password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(password) < 8:
            return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

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

        if role == 'SMC FSE Engineer':
            from django.contrib.auth.models import Group
            group, _ = Group.objects.get_or_create(name='SMC FSE Engineer')
            user.groups.add(group)

        return Response({
            'message': f'Account for {full_name} ({role}) created successfully!',
            'user': {
                'id': user.id,
                'username': user.username,
                'full_name': full_name,
                'email': user.email,
                'phone': phone,
                'role': role
            }
        }, status=status.HTTP_201_CREATED)


class SyncFSEAccountsView(APIView):
    def post(self, request):
        from django.contrib.auth.models import Group
        fse_group, _ = Group.objects.get_or_create(name='SMC FSE Engineer')

        distinct_fses = Site.objects.exclude(smc_fse_name__isnull=True).exclude(smc_fse_name='').values_list('smc_fse_name', flat=True).distinct()

        created_count = 0
        updated_count = 0
        total_assigned_sites = 0

        for raw_name in distinct_fses:
            if not raw_name: continue
            clean_name = raw_name.strip()
            parts = clean_name.split()
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

            suggested_username = clean_name.lower().replace(' ', '_').replace('.', '').replace('-', '_')
            if not suggested_username: continue

            user, created = User.objects.get_or_create(username=suggested_username, defaults={
                'email': f'{suggested_username}@fcttelecom.ng',
                'first_name': first_name,
                'last_name': last_name,
                'is_staff': True
            })
            if created:
                user.set_password('password123')
                user.groups.add(fse_group)
                user.save()
                created_count += 1
            else:
                if not user.groups.filter(name='SMC FSE Engineer').exists():
                    user.groups.add(fse_group)
                    user.save()
                updated_count += 1

            site_cnt = Site.objects.filter(
                Q(smc_fse_name__iexact=clean_name) |
                Q(smc_fse_name__icontains=clean_name) |
                (Q(smc_fse_name__icontains=first_name) & Q(smc_fse_name__icontains=last_name) if last_name else Q(smc_fse_name__icontains=first_name))
            ).count()
            total_assigned_sites += site_cnt

        return Response({
            'message': f'Successfully provisioned & synced all {len(distinct_fses)} SMC FSE Engineer accounts from WSD database! ({created_count} created, {updated_count} updated)',
            'fse_count': len(distinct_fses),
            'created_count': created_count,
            'updated_count': updated_count,
            'total_assigned_sites': total_assigned_sites
        }, status=status.HTTP_200_OK)


class DashboardStatsView(APIView):
    def get(self, request):
        sdm = request.query_params.get('sdm', '').strip()
        fse = request.query_params.get('fse', '').strip()

        sites_qs = Site.objects.all()
        sites_qs = scope_queryset_by_user(sites_qs, request, site_id_field='ihs_site_id', state_field='state')

        total_sites = sites_qs.count()
        sites_down = sites_qs.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
        critical_sites = sites_qs.filter(Q(is_critical=True) | Q(priority__icontains='P1') | Q(priority__icontains='Critical')).count()

        notes_qs = SiteNote.objects.all()
        if sdm and sdm != 'All':
            notes_qs = notes_qs.filter(site__sdm_name__icontains=sdm)
        if fse and fse != 'All':
            notes_qs = notes_qs.filter(site__smc_fse_name__icontains=fse)

        generator_faults = notes_qs.filter(category='Generator', status__in=['Open', 'In Progress', 'Escalated']).count()
        transmission_faults = notes_qs.filter(category='Transmission', status__in=['Open', 'In Progress', 'Escalated']).count()
        battery_faults = notes_qs.filter(category='Battery', status__in=['Open', 'In Progress', 'Escalated']).count()
        
        open_incidents = notes_qs.filter(status__in=['Open', 'In Progress', 'Escalated']).count()
        recent_notes_count = notes_qs.count()
        
        wa_qs = WhatsAppMessage.objects.all()
        if sdm and sdm != 'All':
            wa_qs = wa_qs.filter(site__sdm_name__icontains=sdm)
        recent_whatsapp_count = wa_qs.count()

        ihs_fiber_qs = IHSFiberLink.objects.all()
        ihs_fiber_links_count = ihs_fiber_qs.count()
        ihs_fiber_total_km = round(ihs_fiber_qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        ihs_clusters_count = ihs_fiber_qs.values('cluster_ref').distinct().count()
        
        huawei_fiber_qs = HuaweiFiberLink.objects.all()
        huawei_fiber_links_count = huawei_fiber_qs.count()
        huawei_fiber_total_km = round(huawei_fiber_qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        
        tnl_links_count = TNLLink.objects.count()

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
            'ihs_fiber_links_count': ihs_fiber_links_count,
            'ihs_fiber_total_km': ihs_fiber_total_km,
            'ihs_clusters_count': ihs_clusters_count,
            'huawei_fiber_links_count': huawei_fiber_links_count,
            'huawei_fiber_total_km': huawei_fiber_total_km,
            'tnl_links_count': tnl_links_count,
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


class IHSFiberLinkViewSet(viewsets.ModelViewSet):
    queryset = IHSFiberLink.objects.all()
    serializer_class = IHSFiberLinkSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = IHSFiberLink.objects.all()

        cluster = self.request.query_params.get('cluster', None)
        if cluster and cluster != 'All':
            qs = qs.filter(cluster_ref__iexact=cluster)

        q = self.request.query_params.get('search', None)
        if q:
            qs = qs.filter(
                Q(segment_id__icontains=q) |
                Q(cluster_ref__icontains=q) |
                Q(site_a__icontains=q) |
                Q(site_b__icontains=q) |
                Q(state__icontains=q)
            )

        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        total_links = qs.count()
        total_km = round(qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        clusters_raw = list(IHSFiberLink.objects.values('cluster_ref').annotate(count=Count('id'), total_dist=Sum('distance_km')).order_by('-count'))
        clusters = [
            {
                'cluster_ref': item['cluster_ref'] or 'Unassigned',
                'count': item['count'],
                'total_dist': round(item['total_dist'] or 0.0, 2)
            } for item in clusters_raw
        ]
        
        return Response({
            'total_links': total_links,
            'total_distance_km': total_km,
            'clusters': clusters
        })


class HuaweiFiberLinkViewSet(viewsets.ModelViewSet):
    queryset = HuaweiFiberLink.objects.all()
    serializer_class = HuaweiFiberLinkSerializer
    pagination_class = FlexiblePagination

    def get_queryset(self):
        qs = HuaweiFiberLink.objects.all()

        state = self.request.query_params.get('state', None)
        if state and state != 'All':
            qs = qs.filter(state__iexact=state)

        q = self.request.query_params.get('search', None)
        if q:
            qs = qs.filter(
                Q(segment_name__icontains=q) |
                Q(site_a__icontains=q) |
                Q(site_b__icontains=q) |
                Q(state__icontains=q) |
                Q(region__icontains=q) |
                Q(huawei_fsdm__icontains=q)
            )

        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        total_links = qs.count()
        total_km = round(qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        states = list(HuaweiFiberLink.objects.values('state').annotate(count=Count('id'), total_dist=Sum('distance_km')).order_by('-count'))
        
        return Response({
            'total_links': total_links,
            'total_distance_km': total_km,
            'states': states
        })


from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from .models import DailyAvailabilityRecord, DailyAvailabilityUploadLog, HourlyAvailabilityRecord, HourlyAvailabilityUploadLog
from .daily_availability_importer import process_daily_availability_file, DEFAULT_BASE_AVAILABILITY_PATH
from .hourly_availability_importer import process_hourly_availability_file, DEFAULT_HOURLY_BASE_PATH

def resolve_target_dates(request):
    date_mode = request.query_params.get('date_mode', 'all')
    selected_date = request.query_params.get('selected_date', None)
    selected_month = request.query_params.get('selected_month', None) or request.query_params.get('month', None)
    start_date = request.query_params.get('start_date', None)
    end_date = request.query_params.get('end_date', None)
    upload_log_id = request.query_params.get('upload_log_id', None)

    active_log = None
    if upload_log_id and upload_log_id not in ['All', 'active', '']:
        try:
            active_log = DailyAvailabilityUploadLog.objects.filter(id=int(upload_log_id)).first()
        except (ValueError, TypeError):
            pass
    if not active_log:
        active_log = DailyAvailabilityUploadLog.objects.filter(is_active=True).first() or DailyAvailabilityUploadLog.objects.order_by('-uploaded_at').first()

    month_label = active_log.month_str if active_log else "August 2026"
    
    sample_rec = None
    if active_log:
        sample_rec = DailyAvailabilityRecord.objects.filter(upload_log=active_log).exclude(daily_scores={}).exclude(daily_scores=None).only('daily_scores').first()
    if not sample_rec:
        sample_rec = DailyAvailabilityRecord.objects.exclude(daily_scores={}).exclude(daily_scores=None).only('daily_scores').first()

    all_dates = sorted(list(sample_rec.daily_scores.keys())) if (sample_rec and sample_rec.daily_scores) else []

    if date_mode in ['single_date', 'day']:
        if selected_date and selected_date in all_dates:
            target_dates = [selected_date]
        elif selected_date and any(d == selected_date for d in all_dates):
            target_dates = [selected_date]
        elif all_dates:
            target_dates = [all_dates[-1]]
        else:
            target_dates = []
        date_label = f"Single Day ({target_dates[0]})" if target_dates else "Single Day"
    elif date_mode and (date_mode.startswith('week') or date_mode == 'week' or date_mode == 'latest_week'):
        import re
        week_match = re.match(r'week_(\d+)', str(date_mode))
        if week_match:
            week_idx = int(week_match.group(1)) - 1
            start_i = week_idx * 7
            end_i = min(len(all_dates), start_i + 7)
            if start_i < len(all_dates):
                target_dates = all_dates[start_i:end_i]
            else:
                target_dates = all_dates[-7:] if len(all_dates) >= 7 else all_dates
            date_label = f"Week {week_match.group(1)} ({target_dates[0]} to {target_dates[-1]})" if target_dates else f"Week {week_match.group(1)}"
        elif len(all_dates) >= 7:
            target_dates = all_dates[-7:]
            date_label = f"Latest 7 Days ({target_dates[0]} to {target_dates[-1]})"
        else:
            target_dates = all_dates
            date_label = f"Weekly ({target_dates[0]} to {target_dates[-1]})" if target_dates else "Weekly (7 Days)"
    elif date_mode in ['month', 'monthly']:
        if selected_month and selected_month != 'All':
            clean_m = selected_month.strip()
            month_dates = [d for d in all_dates if d.startswith(clean_m)]
            if month_dates:
                target_dates = month_dates
                date_label = f"Month {clean_m} ({target_dates[0]} to {target_dates[-1]})"
            else:
                target_dates = all_dates[-30:] if len(all_dates) >= 30 else all_dates
                date_label = f"30 Days ({target_dates[0]} to {target_dates[-1]})" if target_dates else "Monthly (30 Days)"
        else:
            target_dates = all_dates[-30:] if len(all_dates) >= 30 else all_dates
            date_label = f"30 Days ({target_dates[0]} to {target_dates[-1]})" if target_dates else "Monthly (30 Days)"
    elif date_mode == 'custom' and start_date and end_date:
        target_dates = [d for d in all_dates if start_date <= d <= end_date]
        date_label = f"Custom Period ({start_date} to {end_date})" if target_dates else f"Custom ({start_date} to {end_date})"
    else: # 'all' or default
        target_dates = all_dates
        date_label = f"All {len(all_dates)} Days ({all_dates[0]} to {all_dates[-1]})" if all_dates else f"All Days ({month_label})"

    return target_dates, date_label

def get_availability_queryset(request):
    is_superuser = request.query_params.get('is_superuser', 'true').lower() == 'true'
    if request.user and request.user.is_authenticated and request.user.is_superuser:
        is_superuser = True

    qs = DailyAvailabilityRecord.objects.all()

    upload_log_id = request.query_params.get('upload_log_id', None)
    month_param = request.query_params.get('month', None)

    if upload_log_id and upload_log_id not in ['All', 'active', '']:
        try:
            qs = qs.filter(upload_log_id=int(upload_log_id))
        except (ValueError, TypeError):
            pass
    elif month_param and month_param != 'All':
        qs = qs.filter(Q(upload_log__month_str__iexact=month_param) | Q(upload_log__month_str__icontains=month_param))
    else:
        active_log = DailyAvailabilityUploadLog.objects.filter(is_active=True).first()
        if not active_log:
            active_log = DailyAvailabilityUploadLog.objects.order_by('-uploaded_at').first()
        if active_log:
            qs = qs.filter(upload_log=active_log)

    qs = scope_queryset_by_user(qs, request, site_id_field='site_id', state_field='state')

    state = request.query_params.get('state', None)
    if state and state != 'All':
        qs = qs.filter(state__iexact=state.strip())

    tech = request.query_params.get('tech', None)
    if tech and tech != 'All':
        qs = qs.filter(tech__iexact=tech.strip())

    tower_co = request.query_params.get('tower_co', None)
    if tower_co and tower_co != 'All':
        qs = qs.filter(tower_co__icontains=tower_co.strip())

    vendor = request.query_params.get('vendor', None)
    if vendor and vendor != 'All':
        qs = qs.filter(vendor__icontains=vendor.strip())

    # ALWAYS exclude Inactive, Decommissioned, Displaced, and Planned sites from Daily Availability Command Center
    qs = qs.exclude(
        status__icontains='Inactive'
    ).exclude(
        status__icontains='Decom'
    ).exclude(
        status__icontains='Displaced'
    ).exclude(
        status__icontains='Planned'
    )

    status_param = request.query_params.get('status', None)
    if status_param and status_param != 'All' and status_param.lower() != 'inactive':
        qs = qs.filter(status__icontains=status_param.strip())

    lga = request.query_params.get('lga', None)
    if lga and lga != 'All':
        clean_lga = lga.strip().upper()
        first_word = clean_lga.split()[0]
        lga_q = Q(lga__iexact=clean_lga) | Q(lga__icontains=clean_lga) | Q(lga__icontains=first_word)
        if clean_lga in ['AMAC', 'MUNICIPAL AREA COUNCIL', 'MUNICIPAL', 'ABUJA MUNICIPAL']:
            lga_q |= Q(lga__icontains='AMAC') | Q(lga__icontains='MUNICIPAL')
        qs = qs.filter(lga_q)

    site_ids_param = request.query_params.get('site_ids', None) or (request.data.get('site_ids', None) if hasattr(request, 'data') and isinstance(request.data, dict) else None)
    search = request.query_params.get('search', None)

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
            q_conditions = [Q(site_id__iexact=t) | Q(site_id__icontains=t) | Q(element_name__icontains=t) for t in clean_tokens]
            qs = qs.filter(reduce(operator.or_, q_conditions))
    elif search:
        import re
        from functools import reduce
        import operator
        search_str = search.strip()
        tokens = [t.strip() for t in re.split(r'[,;\n\r\t]+', search_str) if t.strip()]
        if len(tokens) <= 1 and ' ' in search_str:
            space_tokens = [t.strip() for t in search_str.split() if t.strip()]
            if len(space_tokens) > 1 and any(re.match(r'^[A-Za-z]{1,4}\d{2,6}', st) for st in space_tokens):
                tokens = space_tokens
        
        if len(tokens) > 1:
            clean_tokens = [t.upper() for t in tokens if t]
            q_conditions = [Q(site_id__iexact=t) | Q(site_id__icontains=t) | Q(element_name__icontains=t) for t in clean_tokens]
            qs = qs.filter(reduce(operator.or_, q_conditions))
        else:
            qs = qs.filter(
                Q(site_id__icontains=search_str) |
                Q(element_name__icontains=search_str) |
                Q(lga__icontains=search_str) |
                Q(state__icontains=search_str) |
                Q(tower_co__icontains=search_str) |
                Q(vendor__icontains=search_str)
            )

    fse_param = request.query_params.get('fse', '').strip()
    if fse_param and fse_param != 'All':
        parts = [p for p in fse_param.split() if len(p) >= 3]
        fse_q = Q(smc_fse_name__iexact=fse_param) | Q(smc_fse_name__icontains=fse_param) | Q(mtn_fse_name__icontains=fse_param)
        if len(parts) >= 2:
            fse_q |= (Q(smc_fse_name__icontains=parts[0]) & Q(smc_fse_name__icontains=parts[-1]))
        fse_site_ids = list(Site.objects.filter(fse_q).values_list('ihs_site_id', flat=True))
        if fse_site_ids:
            qs = qs.filter(Q(site_id__in=fse_site_ids) | Q(element_name__icontains=fse_param))
        else:
            qs = qs.filter(Q(site_id__icontains=fse_param) | Q(element_name__icontains=fse_param))

    sla_filter = request.query_params.get('sla_filter', None)
    min_avail = request.query_params.get('min_avail', None)
    max_avail = request.query_params.get('max_avail', None)
    date_mode = request.query_params.get('date_mode', 'all')
    selected_date = request.query_params.get('selected_date', None)

    target_dates, date_label = resolve_target_dates(request)

    if date_mode == 'single_date' and selected_date:
        if sla_filter == 'critical_under_95':
            qs = qs.filter(**{f'daily_scores__{selected_date}__lt': 95.0})
        elif sla_filter == 'degraded_under_98' or sla_filter == 'degraded_under_98_5':
            qs = qs.filter(**{f'daily_scores__{selected_date}__lt': 98.5})
        elif sla_filter == 'warning_95_98' or sla_filter == 'warning_95_98_5':
            qs = qs.filter(**{f'daily_scores__{selected_date}__gte': 95.0, f'daily_scores__{selected_date}__lt': 98.5})
        elif sla_filter == 'high_98_100' or sla_filter == 'high_98_5_100':
            qs = qs.filter(**{f'daily_scores__{selected_date}__gte': 98.5, f'daily_scores__{selected_date}__lt': 100.0})
        elif sla_filter == 'perfect_100':
            qs = qs.filter(**{f'daily_scores__{selected_date}__gte': 100.0})

        if min_avail is not None and min_avail != '':
            try:
                qs = qs.filter(**{f'daily_scores__{selected_date}__gte': float(min_avail)})
            except ValueError:
                pass

        if max_avail is not None and max_avail != '':
            try:
                qs = qs.filter(**{f'daily_scores__{selected_date}__lte': float(max_avail)})
            except ValueError:
                pass
    else:
        if sla_filter == 'critical_under_95':
            qs = qs.filter(avg_availability__lt=95.0)
        elif sla_filter == 'degraded_under_98' or sla_filter == 'degraded_under_98_5':
            qs = qs.filter(avg_availability__lt=98.5)
        elif sla_filter == 'warning_95_98' or sla_filter == 'warning_95_98_5':
            qs = qs.filter(avg_availability__gte=95.0, avg_availability__lt=98.5)
        elif sla_filter == 'high_98_100' or sla_filter == 'high_98_5_100':
            qs = qs.filter(avg_availability__gte=98.5, avg_availability__lt=100.0)
        elif sla_filter == 'perfect_100':
            qs = qs.filter(avg_availability__gte=100.0)

        if min_avail is not None and min_avail != '':
            try:
                qs = qs.filter(avg_availability__gte=float(min_avail))
            except ValueError:
                pass

        if max_avail is not None and max_avail != '':
            try:
                qs = qs.filter(avg_availability__lte=float(max_avail))
            except ValueError:
                pass

    sort_by = request.query_params.get('sort_by', 'worst')
    if sort_by == 'best':
        qs = qs.order_by('-avg_availability')
    elif sort_by == 'site_id':
        qs = qs.order_by('site_id')
    elif sort_by == 'state':
        qs = qs.order_by('state', 'site_id')
    elif sort_by == 'lga':
        qs = qs.order_by('lga', 'site_id')
    else:
        qs = qs.order_by('avg_availability')

    return qs, is_superuser, (target_dates, date_label)


class DailyAvailabilityUploadView(APIView):
    def post(self, request):
        user_role = request.data.get('user_role', '') or request.query_params.get('user_role', '')
        is_fse = (request.user and request.user.is_authenticated and request.user.groups.filter(name__icontains='FSE').exists()) or (user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'])
        if is_fse:
            return Response({'error': 'Uploading spreadsheets is restricted for SMC FSE Engineers. Please contact your State Delivery Manager.'}, status=status.HTTP_403_FORBIDDEN)

        if 'file' not in request.FILES:
            return Response({'error': 'No file uploaded under key "file".'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        filename = uploaded_file.name
        if not (filename.lower().endswith('.xlsb') or filename.lower().endswith('.xlsx') or filename.lower().endswith('.xls')):
            return Response({'error': 'Invalid file format. Please upload a .xlsb or .xlsx spreadsheet.'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_by = request.data.get('uploaded_by', '').strip()
        if not uploaded_by:
            if request.user and request.user.is_authenticated:
                uploaded_by = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
            else:
                uploaded_by = 'State Delivery Manager'

        result = process_daily_availability_file(
            file_source=uploaded_file,
            filename=filename,
            uploaded_by=uploaded_by,
            is_base=False
        )

        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)


class DailyAvailabilityArchivesView(APIView):
    def get(self, request):
        logs = DailyAvailabilityUploadLog.objects.filter(records__isnull=False).distinct().order_by('-uploaded_at')
        archive_list = []
        for log in logs:
            actual_count = log.records.count()
            if actual_count == 0:
                continue
            archive_list.append({
                'id': log.id,
                'filename': log.filename,
                'uploaded_by': log.uploaded_by or 'System Administrator',
                'records_count': actual_count,
                'uploaded_at': log.uploaded_at.isoformat(),
                'date_range': log.date_range or 'N/A',
                'month_str': log.month_str or (log.date_range or f"Log #{log.id}"),
                'start_date': log.start_date,
                'end_date': log.end_date,
                'is_active': log.is_active,
                'is_archived': log.is_archived,
                'is_base': log.is_base
            })
        
        active_log = logs.filter(is_active=True).first() or (logs.first() if logs.exists() else None)
        active_month = active_log.month_str if active_log else 'August 2026'

        return Response({
            'active_month': active_month,
            'active_filename': active_log.filename if active_log else None,
            'active_archive_id': active_log.id if active_log else None,
            'archives': archive_list
        }, status=status.HTTP_200_OK)


class DailyAvailabilityStatsView(APIView):
    def get(self, request):
        upload_log_id = request.query_params.get('upload_log_id', None)
        selected_log = None
        if upload_log_id and upload_log_id not in ['All', 'active', '']:
            try:
                selected_log = DailyAvailabilityUploadLog.objects.filter(id=int(upload_log_id)).first()
            except (ValueError, TypeError):
                pass
        if not selected_log:
            selected_log = DailyAvailabilityUploadLog.objects.filter(is_active=True).first() or DailyAvailabilityUploadLog.objects.order_by('-uploaded_at').first()

        qs, is_superuser, (target_dates, date_label) = get_availability_queryset(request)

        if is_superuser:
            all_states = list(DailyAvailabilityRecord.objects.values_list('state', flat=True).distinct())
        else:
            all_states = list(qs.values_list('state', flat=True).distinct())

        unique_states = sorted(list(set([s.strip().upper() for s in all_states if s])))

        unique_lgas = sorted(list(set([l.strip().upper() for l in qs.values_list('lga', flat=True).distinct() if l])))[:150]
        unique_tower_cos = sorted(list(set([t.strip().upper() for t in qs.values_list('tower_co', flat=True).distinct() if t])))
        unique_vendors = sorted(list(set([v.strip().upper() for v in qs.values_list('vendor', flat=True).distinct() if v])))
        unique_statuses = sorted(list(set([s.strip().title() for s in qs.values_list('status', flat=True).distinct() if s])))

        if is_superuser:
            available_fses = sorted(list(set([f.strip() for f in Site.objects.values_list('smc_fse_name', flat=True) if f and f.strip()])))
        else:
            available_fses = sorted(list(set([f.strip() for f in Site.objects.filter(state__in=unique_states).values_list('smc_fse_name', flat=True) if f and f.strip()])))

        sample_rec = None
        if selected_log:
            sample_rec = DailyAvailabilityRecord.objects.filter(upload_log=selected_log).exclude(daily_scores={}).exclude(daily_scores=None).only('daily_scores').first()
        if not sample_rec:
            sample_rec = DailyAvailabilityRecord.objects.exclude(daily_scores={}).exclude(daily_scores=None).only('daily_scores').first()
        all_detected_dates = sorted(list(sample_rec.daily_scores.keys())) if (sample_rec and sample_rec.daily_scores) else []

        total_elements = qs.count()
        if total_elements == 0:
            return Response({
                'active_filename': selected_log.filename if selected_log else '2026-08-19.xlsb',
                'uploaded_by': selected_log.uploaded_by if selected_log else 'System Base Seeder',
                'uploaded_at': selected_log.uploaded_at.isoformat() if selected_log else None,
                'archive_id': selected_log.id if selected_log else None,
                'archive_filename': selected_log.filename if selected_log else None,
                'archive_date_range': selected_log.date_range if selected_log else None,
                'is_historical_archive': bool(selected_log and not selected_log.is_active),
                'date_range': date_label,
                'all_detected_dates': all_detected_dates,
                'is_superuser': is_superuser,
                'available_states': unique_states,
                'available_lgas': unique_lgas,
                'available_tower_cos': unique_tower_cos,
                'available_vendors': unique_vendors,
                'available_statuses': unique_statuses,
                'available_fses': available_fses,
                'total_elements': 0,
                'overall_avg': 100.0,
                'sla_compliant_count': 0,
                'sla_breached_count': 0,
                'critical_breach_count': 0,
                'tech_breakdown': {},
                'timeline': [],
                'worst_sites': []
            })

        all_records = list(qs.values(
            'id', 'site_id', 'tech', 'element_name', 'state', 'lga', 'tower_co', 'vendor', 'status',
            'avg_availability', 'latest_availability', 'daily_scores'
        ))

        all_period_vals = []
        tech_scores = {}
        tech_counts = {}

        processed = []
        for r in all_records:
            scores_dict = r.get('daily_scores') or {}
            if target_dates and isinstance(scores_dict, dict):
                scores = [float(scores_dict[d]) for d in target_dates if d in scores_dict and scores_dict[d] is not None]
                period_val = round(sum(scores) / len(scores), 2) if scores else round(r['avg_availability'] or 100.0, 2)
                latest_val = round(float(scores_dict[target_dates[-1]]), 2) if (target_dates and target_dates[-1] in scores_dict and scores_dict[target_dates[-1]] is not None) else round(r['latest_availability'] or 100.0, 2)
                filtered_scores = {d: scores_dict[d] for d in target_dates if d in scores_dict}
            else:
                period_val = round(r['avg_availability'] or 100.0, 2)
                latest_val = round(r['latest_availability'] or 100.0, 2)
                filtered_scores = scores_dict

            r['period_availability'] = period_val
            r['avg_availability'] = round(r['avg_availability'] or 100.0, 2)
            r['latest_availability'] = latest_val
            r['daily_scores'] = filtered_scores
            processed.append(r)
            all_period_vals.append(period_val)

            t = r.get('tech') or 'UNKNOWN'
            tech_scores.setdefault(t, []).append(period_val)
            tech_counts[t] = tech_counts.get(t, 0) + 1

        overall_avg = round(sum(all_period_vals) / len(all_period_vals), 2) if all_period_vals else 100.0
        sla_target = 98.5
        sla_compliant_cnt = len([v for v in all_period_vals if v >= sla_target])
        sla_breached_cnt = len([v for v in all_period_vals if v < sla_target])
        critical_breach_cnt = len([v for v in all_period_vals if v < 95.0])

        tech_breakdown = {
            t: {
                'avg': round(sum(tech_scores[t]) / len(tech_scores[t]), 2),
                'count': tech_counts[t]
            }
            for t in tech_scores
        }

        # LGA Breakdown
        lga_dict = {}
        for r in processed:
            lg_name = (r.get('lga') or '').strip().upper()
            if not lg_name:
                continue
            if lg_name not in lga_dict:
                lga_dict[lg_name] = {'scores': [], 'count': 0, 'min_avail': 100.0}
            pv = r['period_availability']
            lga_dict[lg_name]['scores'].append(pv)
            lga_dict[lg_name]['count'] += 1
            if pv < lga_dict[lg_name]['min_avail']:
                lga_dict[lg_name]['min_avail'] = pv

        lga_breakdown = []
        for l_name, l_data in lga_dict.items():
            scs = l_data['scores']
            avg_lga = round(sum(scs) / len(scs), 2) if scs else 100.0
            lga_breakdown.append({
                'lga': l_name,
                'avg': avg_lga,
                'count': l_data['count'],
                'sla_compliant_count': len([v for v in scs if v >= sla_target]),
                'sla_breached_count': len([v for v in scs if v < sla_target]),
                'worst_site_id': None,
                'worst_site_avail': l_data['min_avail'],
                'lowest_3_sites': []
            })
        lga_breakdown.sort(key=lambda x: x['avg'])

        # Worst Degraded Sites ranked by period_availability ascending
        eligible_worst = [
            r for r in processed
            if not any(ex in (r.get('status') or '').lower() for ex in ['inactive', 'decom', 'displaced', 'planned'])
        ]
        eligible_worst.sort(key=lambda x: x['period_availability'])
        worst_sites = eligible_worst[:15]

        # Daily timeline based on target_dates
        timeline_dates = target_dates if target_dates else (all_detected_dates[-30:] if len(all_detected_dates) >= 30 else all_detected_dates)
        daily_values = {d: [] for d in timeline_dates}
        sample_records = list(qs.values_list('daily_scores', flat=True)[:1000])
        for scores in sample_records:
            if isinstance(scores, dict):
                for d_str in timeline_dates:
                    v = scores.get(d_str)
                    if v is not None:
                        try:
                            daily_values[d_str].append(float(v))
                        except (ValueError, TypeError):
                            pass

        timeline = []
        for d_str in sorted(daily_values.keys()):
            vals = daily_values[d_str]
            if vals:
                vals_sorted = sorted(vals)
                avg_d = round(sum(vals) / len(vals), 2)
                min_d = round(vals_sorted[0], 2)
                max_d = round(vals_sorted[-1], 2)
                open_d = round(vals_sorted[int(len(vals_sorted) * 0.25)], 2)
                close_d = round(vals_sorted[int(len(vals_sorted) * 0.75)], 2)
            else:
                avg_d = min_d = max_d = open_d = close_d = 100.0

            timeline.append({
                'date': d_str,
                'avg_availability': avg_d,
                'min_availability': min_d,
                'max_availability': max_d,
                'open': open_d,
                'close': close_d
            })

        return Response({
            'active_filename': selected_log.filename if selected_log else '2026-08-19.xlsb',
            'uploaded_by': selected_log.uploaded_by if selected_log else 'System Base Seeder',
            'uploaded_at': selected_log.uploaded_at.isoformat() if selected_log else None,
            'archive_id': selected_log.id if selected_log else None,
            'archive_filename': selected_log.filename if selected_log else None,
            'archive_date_range': selected_log.date_range if selected_log else None,
            'is_historical_archive': bool(selected_log and not selected_log.is_active),
            'date_range': date_label,
            'all_detected_dates': all_detected_dates,
            'is_superuser': is_superuser,
            'available_states': unique_states,
            'available_lgas': unique_lgas,
            'available_tower_cos': unique_tower_cos,
            'available_vendors': unique_vendors,
            'available_statuses': unique_statuses,
            'available_fses': available_fses,
            'total_elements': total_elements,
            'overall_avg': overall_avg,
            'sla_target': sla_target,
            'sla_compliant_count': sla_compliant_cnt,
            'sla_breached_count': sla_breached_cnt,
            'critical_breach_count': critical_breach_cnt,
            'tech_breakdown': tech_breakdown,
            'lga_breakdown': lga_breakdown,
            'timeline': timeline,
            'worst_sites': worst_sites
        })


class DailyAvailabilityListView(APIView):
    def get(self, request):
        qs, _, (target_dates, date_label) = get_availability_queryset(request)

        records = list(qs.values(
            'id', 'site_id', 'tech', 'element_name', 'state', 'region', 'lga',
            'tower_co', 'vendor', 'status', 'avg_availability', 'latest_availability', 'daily_scores'
        ))

        sla_filter = request.query_params.get('sla_filter', None)
        min_avail = request.query_params.get('min_avail', None)
        max_avail = request.query_params.get('max_avail', None)

        processed = []
        for r in records:
            scores_dict = r.get('daily_scores') or {}
            if target_dates and isinstance(scores_dict, dict):
                scores = [float(scores_dict[d]) for d in target_dates if d in scores_dict and scores_dict[d] is not None]
                period_val = round(sum(scores) / len(scores), 2) if scores else round(r['avg_availability'] or 100.0, 2)
                latest_val = round(float(scores_dict[target_dates[-1]]), 2) if (target_dates and target_dates[-1] in scores_dict and scores_dict[target_dates[-1]] is not None) else round(r['latest_availability'] or 100.0, 2)
                filtered_scores = {d: scores_dict[d] for d in target_dates if d in scores_dict}
            else:
                period_val = round(r['avg_availability'] or 100.0, 2)
                latest_val = round(r['latest_availability'] or 100.0, 2)
                filtered_scores = scores_dict

            r['period_availability'] = period_val
            r['period_label'] = date_label
            r['avg_availability'] = round(r['avg_availability'] or 100.0, 2)
            r['latest_availability'] = latest_val
            r['daily_scores'] = filtered_scores

            # Filter by SLA
            if sla_filter == 'critical_under_95' and period_val >= 95.0:
                continue
            elif sla_filter in ['degraded_under_98', 'degraded_under_98_5'] and period_val >= 98.5:
                continue
            elif sla_filter in ['warning_95_98', 'warning_95_98_5'] and not (95.0 <= period_val < 98.5):
                continue
            elif sla_filter in ['high_98_100', 'high_98_5_100'] and not (98.5 <= period_val < 100.0):
                continue
            elif sla_filter == 'perfect_100' and period_val < 100.0:
                continue

            # Filter by Min / Max
            if min_avail not in [None, '']:
                try:
                    if period_val < float(min_avail):
                        continue
                except ValueError:
                    pass

            if max_avail not in [None, '']:
                try:
                    if period_val > float(max_avail):
                        continue
                except ValueError:
                    pass

            processed.append(r)

        sort_by = request.query_params.get('sort_by', 'worst')
        if sort_by == 'best':
            processed.sort(key=lambda x: x['period_availability'], reverse=True)
        elif sort_by == 'site_id':
            processed.sort(key=lambda x: str(x['site_id']))
        elif sort_by == 'state':
            processed.sort(key=lambda x: (str(x['state']), str(x['site_id'])))
        elif sort_by == 'lga':
            processed.sort(key=lambda x: (str(x['lga']), str(x['site_id'])))
        else: # worst
            processed.sort(key=lambda x: x['period_availability'])

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 25))
        total_count = len(processed)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_results = processed[start_idx:end_idx]

        return Response({
            'count': total_count,
            'next': f"?page={page+1}" if end_idx < total_count else None,
            'previous': f"?page={page-1}" if page > 1 else None,
            'results': paged_results
        })


class ResetBaseAvailabilityView(APIView):
    def post(self, request):
        user_role = request.data.get('user_role', '') or request.query_params.get('user_role', '')
        is_fse = (request.user and request.user.is_authenticated and request.user.groups.filter(name__icontains='FSE').exists()) or (user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'])
        if is_fse:
            return Response({'error': 'Resetting availability datasets is restricted for SMC FSE Engineers. Please contact your State Delivery Manager.'}, status=status.HTTP_403_FORBIDDEN)

        uploaded_by = request.data.get('uploaded_by', '').strip()
        if not uploaded_by:
            if request.user and request.user.is_authenticated:
                uploaded_by = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
            else:
                uploaded_by = 'State Delivery Manager'

        result = process_daily_availability_file(
            file_source=DEFAULT_BASE_AVAILABILITY_PATH,
            filename='2026-07-30.xlsb',
            uploaded_by=uploaded_by,
            is_base=True
        )
        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)


class DailyAvailabilityExportView(APIView):
    def get(self, request):
        import datetime
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from django.http import HttpResponse

        qs, _, (target_dates, date_label) = get_availability_queryset(request)
        records = list(qs)

        wb = Workbook()
        ws_summary = wb.active
        ws_summary.title = "Executive Summary"
        ws_matrix = wb.create_sheet(title="Element Availability Matrix")

        title_font = Font(name='Segoe UI', size=16, bold=True, color='FFFFFF')
        header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
        bold_font = Font(name='Segoe UI', size=11, bold=True, color='0F172A')
        normal_font = Font(name='Segoe UI', size=10, color='334155')
        mono_font = Font(name='Consolas', size=10, bold=True, color='0284C7')

        title_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')
        header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        ws_summary.merge_cells('A1:E2')
        cell = ws_summary['A1']
        cell.value = "DAILY NETWORK AVAILABILITY COMMAND CENTER REPORT"
        cell.font = title_font
        cell.fill = title_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')

        ws_summary.append([])
        ws_summary.append(["KPI METRIC", "VALUE"])
        for col in ['A', 'B']:
            ws_summary[f'{col}4'].font = header_font
            ws_summary[f'{col}4'].fill = header_fill

        total_elements = len(records)
        overall_avg = round(sum(r.avg_availability for r in records) / total_elements, 2) if total_elements > 0 else 100.0
        sla_compliant = sum(1 for r in records if r.avg_availability >= 98.0)
        sla_degraded = sum(1 for r in records if r.avg_availability < 98.0)
        critical_outages = sum(1 for r in records if r.avg_availability < 95.0)

        kpis = [
            ("Report Period / Scope", date_label),
            ("Monitored Network Elements", total_elements),
            ("Overall Average Availability", f"{overall_avg}%"),
            ("SLA Compliant Elements (>= 98%)", sla_compliant),
            ("Degraded Elements (< 98%)", sla_degraded),
            ("Critical Outage Elements (< 95%)", critical_outages),
        ]

        for label, val in kpis:
            ws_summary.append([label, val])
            row = ws_summary.max_row
            ws_summary[f'A{row}'].font = bold_font
            ws_summary[f'B{row}'].font = normal_font
            ws_summary[f'A{row}'].border = thin_border
            ws_summary[f'B{row}'].border = thin_border

        matrix_headers = ["SITE ID", "TECH", "STATE", "LGA", "TOWER CO", "VENDOR", "STATUS", "PERIOD AVAIL %", "MONTH AVG %", "LATEST DAY %", "SLA STATUS"]
        ws_matrix.append(matrix_headers)
        for col_num in range(1, len(matrix_headers) + 1):
            c = ws_matrix.cell(row=1, column=col_num)
            c.font = header_font
            c.fill = header_fill
            c.alignment = Alignment(horizontal='center', vertical='center')

        for r in records:
            if target_dates and isinstance(r.daily_scores, dict):
                scores = [float(r.daily_scores[d]) for d in target_dates if d in r.daily_scores and r.daily_scores[d] is not None]
                period_val = round(sum(scores) / len(scores), 2) if scores else round(r.avg_availability, 2)
            else:
                period_val = round(r.avg_availability, 2)

            sla_status = "🟢 COMPLIANT" if period_val >= 98.0 else ("🔴 CRITICAL OUTAGE" if period_val < 95.0 else "⚠️ DEGRADED")

            row_data = [
                r.site_id,
                r.tech,
                r.state,
                r.lga,
                r.tower_co,
                r.vendor,
                r.status,
                f"{period_val}%",
                f"{round(r.avg_availability, 2)}%",
                f"{round(r.latest_availability, 2)}%",
                sla_status
            ]
            ws_matrix.append(row_data)
            curr_row = ws_matrix.max_row
            ws_matrix[f'A{curr_row}'].font = mono_font

            for col_idx in range(1, len(matrix_headers) + 1):
                ws_matrix.cell(row=curr_row, column=col_idx).border = thin_border

        for ws in [ws_summary, ws_matrix]:
            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="Daily_Network_Availability_Report_{datetime.date.today()}.xlsx"'
        wb.save(response)
        return response


class IdentifyHubSitesView(APIView):
    def post(self, request):
        import datetime
        import re
        from django.utils import timezone

        raw_input = request.data.get('site_ids', '')
        user_state = request.data.get('state', '') or 'FCT'

        if isinstance(raw_input, list):
            input_text = "\n".join(str(x) for x in raw_input)
        else:
            input_text = str(raw_input or '')

        lines_raw = [line.strip() for line in input_text.replace(';', '\n').replace(',', '\n').split('\n') if line.strip()]

        tnl_a = dict(TNLLink.objects.values_list('site_a').annotate(c=Count('id')))
        tnl_b = dict(TNLLink.objects.values_list('site_b').annotate(c=Count('id')))

        hub_degrees = {}
        for s, c in tnl_a.items():
            if s:
                u_s = s.strip().upper()
                hub_degrees[u_s] = hub_degrees.get(u_s, 0) + c
        for s, c in tnl_b.items():
            if s:
                u_s = s.strip().upper()
                hub_degrees[u_s] = hub_degrees.get(u_s, 0) + c

        parsed_items = []
        clean_ids = []

        for line in lines_raw:
            m = re.search(r'([A-Za-z0-9_]+)\s*\+\s*(\d+)', line)
            if m:
                s_code = m.group(1).upper()
                deg_override = int(m.group(2))
            else:
                tokens = re.findall(r'[A-Za-z0-9_]{4,15}', line)
                s_code = tokens[0].upper() if tokens else line.upper()
                deg_override = None

            if s_code not in clean_ids:
                clean_ids.append(s_code)
                parsed_items.append({
                    'original_line': line,
                    'site_id': s_code,
                    'deg_override': deg_override
                })

        sites_map = {}
        for site in Site.objects.filter(Q(ihs_site_id__in=clean_ids) | Q(mtn_id__in=clean_ids)):
            sites_map[site.ihs_site_id.upper()] = site
            if site.mtn_id:
                sites_map[site.mtn_id.upper()] = site

        def calc_duration_str(note):
            if not note or not note.created_at:
                return ""
            end = note.resolved_at or getattr(note, 'updated_at', None) or timezone.now() if note.status == 'Resolved' else timezone.now()
            diff = max(0, int((end - note.created_at).total_seconds()))
            hrs, rem = divmod(diff, 3600)
            mins, _ = divmod(rem, 60)
            if hrs > 0 and mins > 0:
                return f"{hrs}h{mins}m"
            elif hrs > 0:
                return f"{hrs}h"
            elif mins > 0:
                return f"{mins}mins"
            else:
                return "<1min"

        def format_day_suffix(day):
            if 11 <= day <= 13:
                return f"{day}th"
            suffixes = {1: 'st', 2: 'nd', 3: 'rd'}
            return f"{day}{suffixes.get(day % 10, 'th')}"

        results = []
        buckets = {
            'TX': [],
            'Diesel': [],
            'Passive fault': [],
            'Fiber': [],
            'Force Majeure': [],
            'Access': [],
            'Planned work': [],
            'Theft': []
        }

        for item in parsed_items:
            sid = item['site_id']
            site_obj = sites_map.get(sid)
            tnl_deg = hub_degrees.get(sid, 0)

            if item['deg_override'] is not None:
                deg = item['deg_override']
                is_hub = True
            elif tnl_deg > 0:
                deg = tnl_deg
                is_hub = True
            elif site_obj:
                cfg = (str(site_obj.site_configuration or '') + str(site_obj.solution_category or '') + str(site_obj.raw_data or '')).lower()
                if any(k in cfg for k in ['hub', 'bsc', 'rnc', 'core', 'transmission node']):
                    is_hub = True
                    deg = 1
                else:
                    is_hub = False
                    deg = 0
            else:
                is_hub = False
                deg = 0

            display_site_id = f"{sid} + {deg}" if (is_hub and deg > 0) else sid

            note = SiteNote.objects.filter(Q(site__ihs_site_id__iexact=sid) | Q(title__icontains=sid)).order_by('-created_at').first()

            cat = note.category if note else 'General'
            if cat in ['TX', 'Transmission', 'Microwave']:
                b_key = 'TX'
            elif cat in ['Diesel', 'Generator', 'Fuel']:
                b_key = 'Diesel'
            elif cat in ['Fiber']:
                b_key = 'Fiber'
            elif cat in ['Force Majeure', 'Customer']:
                b_key = 'Force Majeure'
            elif cat in ['Access', 'Security']:
                b_key = 'Access'
            elif cat in ['Planned work']:
                b_key = 'Planned work'
            elif cat in ['Theft']:
                b_key = 'Theft'
            else:
                b_key = 'Passive fault'

            title_text = note.title.strip() if (note and note.title) else ''
            desc_text = note.description.strip() if (note and note.description) else ''

            def strip_site_prefix(text, s_id):
                if not text or not s_id:
                    return text
                return re.sub(r'^\s*' + re.escape(s_id) + r'(\s*\+\s*\d+)?[\s\-:]*', '', text, flags=re.I).strip()

            title_clean = strip_site_prefix(title_text, sid)
            desc_clean = strip_site_prefix(desc_text, sid)

            if title_clean and desc_clean and desc_clean != title_clean:
                if not title_clean.endswith(('.', ':', ';', '-')):
                    combined_text = f"{title_clean}, {desc_clean}"
                else:
                    combined_text = f"{title_clean} {desc_clean}"
            elif desc_clean:
                combined_text = desc_clean
            elif title_clean:
                combined_text = title_clean
            else:
                combined_text = "Operational Site Status Monitored"

            dur = calc_duration_str(note) if note else ""
            tower_co_str = note.tower_co if (note and note.tower_co) else (site_obj.smc if site_obj else 'IHS')
            tower_co = f"({tower_co_str or 'IHS'})"

            if dur and dur not in combined_text:
                report_line = f"{display_site_id} {combined_text} {dur} {tower_co}"
            else:
                report_line = f"{display_site_id} {combined_text} {tower_co}"

            buckets[b_key].append(report_line)

            results.append({
                'site_id': sid,
                'is_hub': is_hub,
                'downstream_degree': deg,
                'formatted_site_id': display_site_id,
                'state': site_obj.state if site_obj else user_state,
                'lga': site_obj.lga if site_obj else 'N/A',
                'tower_co': tower_co_str or 'IHS',
                'status': site_obj.operational_status if site_obj else 'Active',
                'note_title': title_text,
                'note_desc': desc_text,
                'report_line': report_line,
                'category': cat
            })

        target_date = datetime.date.today()
        date_str = f"{format_day_suffix(target_date.day)} {target_date.strftime('%B %Y')}"
        title_line = f"{user_state.upper()} - {date_str}"
        total_count = len(clean_ids)

        lines = [
            title_line,
            "",
            f"TX -{len(buckets['TX'])}",
            f"Diesel-{len(buckets['Diesel'])}",
            f"Passive fault-{len(buckets['Passive fault'])}",
            f"Fiber- {len(buckets['Fiber'])}",
            f"Force Majeure -{len(buckets['Force Majeure'])}",
            f"Access-{len(buckets['Access'])}",
            f"Planned work-{len(buckets['Planned work'])}",
            f"Theft - {len(buckets['Theft'])}",
            f"Total- {total_count}",
            ""
        ]

        section_order = ['Passive fault', 'Planned work', 'Fiber', 'TX', 'Diesel', 'Access', 'Theft', 'Force Majeure']
        section_titles = {
            'Passive fault': 'Cause of Degradation',
            'Planned work': 'Planned work',
            'Fiber': 'Fiber',
            'TX': 'TX',
            'Diesel': 'Diesel',
            'Access': 'Access',
            'Theft': 'Theft',
            'Force Majeure': 'Force Majeure'
        }

        for key in section_order:
            items = buckets[key]
            if items:
                lines.append(section_titles[key])
                lines.append("")
                lines.extend(items)
                lines.append("")

        txt_report = "\n".join(lines)
        return Response({
            'total_input': total_count,
            'hub_count': sum(1 for r in results if r['is_hub']),
            'terminal_count': sum(1 for r in results if not r['is_hub']),
            'results': results,
            'txt_report': txt_report
        }, status=status.HTTP_200_OK)


_wsd_april_2026_cache = None

def get_wsd_april_2026_cache():
    import os
    global _wsd_april_2026_cache
    if _wsd_april_2026_cache is not None:
        return _wsd_april_2026_cache

    path = '/home/mrchrys/SDM/working site distribution/Huawei/WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb'
    wsd_map = {}

    if os.path.exists(path):
        try:
            import pyxlsb
            with pyxlsb.open_workbook(path) as wb:
                if 'WSD' in wb.sheets:
                    with wb.get_sheet('WSD') as sheet:
                        for idx, row in enumerate(sheet.rows()):
                            if idx == 0: continue
                            vals = [c.v for c in row]
                            site_id = str(vals[0] or '').strip().upper()
                            if not site_id: continue

                            fse_phone = str(vals[58] or '').replace('.0', '').strip()
                            if fse_phone and not fse_phone.startswith('0') and len(fse_phone) == 10:
                                fse_phone = '0' + fse_phone

                            sdm_phone = str(vals[62] or '').replace('.0', '').strip()
                            if sdm_phone and not sdm_phone.startswith('0') and len(sdm_phone) == 10:
                                sdm_phone = '0' + sdm_phone

                            wsd_map[site_id] = {
                                'site_id': site_id,
                                'site_name': str(vals[29] or '').strip(),
                                'state': str(vals[14] or '').strip().upper(),
                                'lga': str(vals[19] or '').strip(),
                                'cluster': str(vals[5] or '').strip(),
                                'tower_co': str(vals[30] or '').strip(),
                                'vendor': str(vals[28] or '').strip(),
                                'fse_name': str(vals[56] or '').strip(),
                                'fse_phone': fse_phone,
                                'sdm_name': str(vals[60] or '').strip(),
                                'sdm_phone': sdm_phone,
                                'classification': str(vals[42] or '').strip(),
                                'downstream_count': int(vals[43] or 0) if vals[43] is not None else 0,
                                'vvip': str(vals[44] or '').strip()
                            }
        except Exception as e:
            print("Error loading WSD APRIL 2026 xlsb:", e)

    _wsd_april_2026_cache = wsd_map
    return _wsd_april_2026_cache


class SiteToFSELookupView(APIView):
    def post(self, request):
        import datetime
        import re

        raw_input = request.data.get('site_ids', '')
        user_state = request.data.get('state', '') or 'FCT'

        if isinstance(raw_input, list):
            input_text = "\n".join(str(x) for x in raw_input)
        else:
            input_text = str(raw_input or '')

        lines_raw = [line.strip() for line in input_text.replace(';', '\n').replace(',', '\n').split('\n') if line.strip()]

        clean_ids = []
        for line in lines_raw:
            m = re.match(r'^([A-Za-z0-9_-]+)', line)
            if m:
                sid = m.group(1).upper()
                if sid not in clean_ids:
                    clean_ids.append(sid)

        wsd_cache = get_wsd_april_2026_cache()
        db_sites = {s.ihs_site_id.upper(): s for s in Site.objects.filter(ihs_site_id__in=clean_ids) if s.ihs_site_id}

        results = []
        found_count = 0
        missing_count = 0

        for sid in clean_ids:
            wsd_item = wsd_cache.get(sid)
            site_db = db_sites.get(sid)

            if wsd_item:
                found_count += 1
                item_data = {
                    'input_site_id': sid,
                    'matched_site_id': wsd_item['site_id'],
                    'site_name': wsd_item['site_name'] or (site_db.site_address if site_db else 'N/A'),
                    'fse_name': wsd_item['fse_name'] or 'Unassigned FSE',
                    'fse_phone': wsd_item['fse_phone'] or 'N/A',
                    'sdm_name': wsd_item['sdm_name'] or (site_db.sdm_name if site_db else 'N/A'),
                    'state': wsd_item['state'] or (site_db.state if site_db else user_state),
                    'lga': wsd_item['lga'] or (site_db.lga if site_db else 'N/A'),
                    'cluster': wsd_item['cluster'] or (site_db.cluster_name if site_db else 'N/A'),
                    'tower_co': wsd_item['tower_co'] or (getattr(site_db, 'tower_co', None) or getattr(site_db, 'sub_sbc', None) or 'N/A'),
                    'classification': wsd_item['classification'] or ('Hub' if (site_db and getattr(site_db, 'is_hub', False)) else 'Terminal'),
                    'downstream_count': wsd_item['downstream_count'],
                    'is_found': True
                }
            elif site_db:
                found_count += 1
                item_data = {
                    'input_site_id': sid,
                    'matched_site_id': site_db.ihs_site_id,
                    'site_name': site_db.site_address or site_db.ihs_site_id,
                    'fse_name': site_db.smc_fse_name or site_db.mtn_fse_name or 'Unassigned FSE',
                    'fse_phone': site_db.smc_fse_phone or site_db.mtn_fse_phone or 'N/A',
                    'sdm_name': site_db.sdm_name or 'N/A',
                    'state': site_db.state or user_state,
                    'lga': site_db.lga or 'N/A',
                    'cluster': site_db.cluster_name or 'N/A',
                    'tower_co': getattr(site_db, 'tower_co', None) or getattr(site_db, 'sub_sbc', None) or 'N/A',
                    'classification': 'Terminal',
                    'downstream_count': 0,
                    'is_found': True
                }
            else:
                missing_count += 1
                item_data = {
                    'input_site_id': sid,
                    'matched_site_id': sid,
                    'site_name': 'Site ID Not Found in WSD Database',
                    'fse_name': 'N/A',
                    'fse_phone': 'N/A',
                    'sdm_name': 'N/A',
                    'state': user_state,
                    'lga': 'N/A',
                    'cluster': 'N/A',
                    'tower_co': 'N/A',
                    'classification': 'Unknown',
                    'downstream_count': 0,
                    'is_found': False
                }
            results.append(item_data)

        target_date = datetime.date.today()
        def format_day_suffix(day):
            if 11 <= day <= 13:
                return f"{day}th"
            return f"{day}{['th', 'st', 'nd', 'rd', 'th'][min(day % 10, 4)]}"

        date_str = f"{format_day_suffix(target_date.day)} {target_date.strftime('%B %Y')}"

        txt_lines = [
            f"{user_state.upper()} - {date_str}",
            "SITE TO FIELD SERVICE ENGINEER (FSE) MAPPING REPORT",
            "--------------------------------------------------------------------------------",
            f"Total Input Sites: {len(clean_ids)}",
            f"Found Sites: {found_count}",
            f"Unmatched Sites: {missing_count}",
            "--------------------------------------------------------------------------------",
            "",
            "SITE ID & FSE BREAKDOWN LIST:",
            "================================================================================"
        ]

        for idx, item in enumerate(results, 1):
            if item['is_found']:
                fse_str = f"FSE Name: {item['fse_name']} ({item['fse_phone']})"
                txt_lines.append(
                    f"{idx:02d}. {item['matched_site_id']:<10} | {fse_str:<55} | State: {item['state']:<8} | LGA: {item['lga']:<15} | Tower Co: {item['tower_co']:<10} | Type: {item['classification']}"
                )
            else:
                txt_lines.append(
                    f"{idx:02d}. {item['input_site_id']:<10} | NOT FOUND IN WSD DATABASE"
                )

        txt_lines.append("================================================================================")
        txt_lines.append(f"Generated via SDM Operational Command Center on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")

        txt_report = "\n".join(txt_lines)

        return Response({
            'total_input': len(clean_ids),
            'found_count': found_count,
            'missing_count': missing_count,
            'results': results,
            'txt_report': txt_report
        }, status=status.HTTP_200_OK)


class SiteToFSEExportExcelView(APIView):
    def post(self, request):
        import datetime
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from django.http import HttpResponse

        site_ids = request.data.get('site_ids', '')
        user_state = request.data.get('state', '') or 'FCT'

        lookup_view = SiteToFSELookupView()
        lookup_res = lookup_view.post(request)

        if lookup_res.status_code != 200:
            return lookup_res

        data = lookup_res.data
        results = data.get('results', [])

        wb = Workbook()
        ws = wb.active
        ws.title = "Site to FSE Mapping"

        title_font = Font(name='Segoe UI', size=15, bold=True, color='FFFFFF')
        header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
        bold_font = Font(name='Segoe UI', size=10, bold=True, color='0F172A')
        normal_font = Font(name='Segoe UI', size=10, color='334155')
        mono_font = Font(name='Consolas', size=10, bold=True, color='0284C7')

        title_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')
        header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        ws.merge_cells('A1:J2')
        cell = ws['A1']
        cell.value = f"SITE TO FIELD SERVICE ENGINEER (FSE) MAPPING - {user_state.upper()}"
        cell.font = title_font
        cell.fill = title_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')

        headers = [
            "SITE ID", "SITE NAME", "FSE NAME", "FSE PHONE", "SDM NAME",
            "STATE", "LGA", "CLUSTER", "TOWER CO", "CLASSIFICATION"
        ]

        ws.append([])
        ws.append(headers)

        for col_num in range(1, len(headers) + 1):
            c = ws.cell(row=4, column=col_num)
            c.font = header_font
            c.fill = header_fill
            c.alignment = Alignment(horizontal='center', vertical='center')

        for item in results:
            row_data = [
                item['matched_site_id'],
                item['site_name'],
                item['fse_name'],
                item['fse_phone'],
                item['sdm_name'],
                item['state'],
                item['lga'],
                item['cluster'],
                item['tower_co'],
                item['classification']
            ]
            ws.append(row_data)
            curr_row = ws.max_row
            ws[f'A{curr_row}'].font = mono_font

            for col_idx in range(1, len(headers) + 1):
                c = ws.cell(row=curr_row, column=col_idx)
                c.font = bold_font if col_idx == 3 else normal_font
                c.border = thin_border

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="Site_FSE_Mapping_{datetime.date.today()}.xlsx"'
        wb.save(response)
        return response


class HourlyAvailabilityUploadView(APIView):
    def post(self, request):
        user_role = request.data.get('user_role', '') or request.query_params.get('user_role', '')
        is_fse = (request.user and request.user.is_authenticated and request.user.groups.filter(name__icontains='FSE').exists()) or (user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'])
        if is_fse:
            return Response({'error': 'Uploading hourly availability spreadsheets is restricted for SMC FSE Engineers. Please contact your State Delivery Manager.'}, status=status.HTTP_403_FORBIDDEN)

        if 'file' not in request.FILES:
            return Response({'error': 'No file uploaded under key "file".'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        filename = uploaded_file.name
        if not (filename.lower().endswith('.xlsb') or filename.lower().endswith('.xlsx') or filename.lower().endswith('.xls')):
            return Response({'error': 'Invalid file format. Please upload a .xlsb or .xlsx spreadsheet.'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_by = request.data.get('uploaded_by', '').strip()
        if not uploaded_by:
            if request.user and request.user.is_authenticated:
                uploaded_by = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
            else:
                uploaded_by = 'State Delivery Manager'

        result = process_hourly_availability_file(
            file_source=uploaded_file,
            filename=filename,
            uploaded_by=uploaded_by,
            is_base=False
        )

        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)


class HourlyAvailabilityStatsView(APIView):
    def get(self, request):
        active_log = HourlyAvailabilityUploadLog.objects.filter(is_active=True).first()
        if not active_log:
            active_log = HourlyAvailabilityUploadLog.objects.order_by('-uploaded_at').first()

        qs = HourlyAvailabilityRecord.objects.all()
        qs = scope_queryset_by_user(qs, request, site_id_field='site_id', state_field='state')

        state_param = request.query_params.get('state', None)
        if state_param and state_param != 'All':
            qs = qs.filter(state__iexact=state_param)

        lga_param = request.query_params.get('lga', None)
        if lga_param and lga_param != 'All':
            qs = qs.filter(lga__iexact=lga_param)

        tech_param = request.query_params.get('tech', None)
        if tech_param and tech_param != 'All':
            qs = qs.filter(tech__iexact=tech_param)

        tower_co_param = request.query_params.get('tower_co', None)
        if tower_co_param and tower_co_param != 'All':
            qs = qs.filter(tower_co__icontains=tower_co_param)

        # ALWAYS exclude Inactive, Decom, Displaced, and Planned sites from Hourly Availability Command Center
        qs = qs.exclude(
            status__icontains='Inactive'
        ).exclude(
            status__icontains='Decom'
        ).exclude(
            status__icontains='Displaced'
        ).exclude(
            status__icontains='Planned'
        )

        status_param = request.query_params.get('status', None)
        if status_param and status_param != 'All' and status_param.lower() != 'inactive':
            qs = qs.filter(status__iexact=status_param)

        fse_param = request.query_params.get('fse', None)
        if fse_param and fse_param != 'All':
            clean_fse = fse_param.strip()
            fse_site_ids = list(Site.objects.filter(
                Q(smc_fse_name__icontains=clean_fse) | Q(mtn_fse_name__icontains=clean_fse)
            ).values_list('ihs_site_id', flat=True))
            if fse_site_ids:
                qs = qs.filter(Q(site_id__in=fse_site_ids) | Q(element_name__icontains=clean_fse))
            else:
                qs = qs.filter(Q(site_id__icontains=clean_fse) | Q(element_name__icontains=clean_fse))

        all_states = sorted(list(set([s.strip().upper() for s in HourlyAvailabilityRecord.objects.values_list('state', flat=True).distinct() if s])))
        all_lgas = sorted(list(set([l.strip().upper() for l in qs.values_list('lga', flat=True).distinct() if l])))[:150]
        all_tower_cos = sorted(list(set([t.strip() for t in HourlyAvailabilityRecord.objects.values_list('tower_co', flat=True).distinct() if t])))
        all_statuses = sorted(list(set([s.strip() for s in HourlyAvailabilityRecord.objects.values_list('status', flat=True).distinct() if s])))

        sdm_param = request.query_params.get('sdm', None)
        user_state_param = request.query_params.get('user_state', None) or state_param

        is_superuser = request.query_params.get('is_superuser', 'true').lower() == 'true'
        if request.user and request.user.is_authenticated and request.user.is_superuser:
            is_superuser = True

        if is_superuser:
            available_fses = sorted(list(set([f.strip() for f in Site.objects.values_list('smc_fse_name', flat=True) if f and f.strip()])))
        else:
            site_q = Q()
            if sdm_param and sdm_param != 'All':
                site_q |= Q(sdm_name__icontains=sdm_param.strip())
            if user_state_param and user_state_param != 'All':
                clean_st = user_state_param.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                site_q |= Q(state__iexact=clean_st)

            if site_q:
                fse_qs = Site.objects.filter(site_q)
            else:
                fse_qs = Site.objects.filter(state__in=all_states)

            available_fses = sorted(list(set([f.strip() for f in fse_qs.values_list('smc_fse_name', flat=True) if f and f.strip()])))

        hours_list = active_log.hours_list if active_log and active_log.hours_list else []
        if not hours_list:
            hours_list = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]

        total_elements = qs.count()
        if total_elements == 0:
            return Response({
                'active_filename': active_log.filename if active_log else '12AM.xlsb',
                'uploaded_by': active_log.uploaded_by if active_log else 'System Administrator',
                'uploaded_at': active_log.uploaded_at.isoformat() if active_log else None,
                'date_str': active_log.date_str if active_log else 'Aug 07, 2026',
                'hours_list': hours_list,
                'available_states': all_states,
                'available_lgas': all_lgas,
                'available_tower_cos': all_tower_cos,
                'available_statuses': all_statuses,
                'available_fses': available_fses,
                'total_elements': 0,
                'overall_avg': 100.0,
                'sla_compliant_count': 0,
                'sla_breached_count': 0,
                'critical_breach_count': 0,
                'tech_breakdown': {},
                'lga_breakdown': [],
                'national_regional_data': active_log.national_regional_data if active_log else []
            })

        avg_agg = qs.aggregate(avg=Avg('avg_availability'))['avg'] or 100.0
        sla_target = 98.5
        sla_compliant_cnt = qs.filter(avg_availability__gte=sla_target).count()
        sla_breached_cnt = qs.filter(avg_availability__lt=sla_target).count()
        critical_breach_cnt = qs.filter(avg_availability__lt=95.0).count()

        tech_list = list(qs.values('tech').annotate(avg_score=Avg('avg_availability'), cnt=Count('id')).order_by('tech'))
        tech_breakdown = {item['tech']: {'avg': round(item['avg_score'] or 100.0, 2), 'count': item['cnt']} for item in tech_list}

        lga_stats = list(qs.exclude(lga='').values('lga').annotate(
            avg_score=Avg('avg_availability'),
            cnt=Count('id')
        ).order_by('avg_score'))

        lga_breakdown = []
        for lstat in lga_stats:
            l_name = lstat['lga']
            worst_in_lga = qs.filter(lga=l_name).order_by('avg_availability').first()
            lga_breakdown.append({
                'lga': l_name,
                'avg': round(lstat['avg_score'] or 100.0, 2),
                'count': lstat['cnt'],
                'worst_site': worst_in_lga.site_id if worst_in_lga else None,
                'worst_score': worst_in_lga.avg_availability if worst_in_lga else 100.0
            })

        return Response({
            'active_filename': active_log.filename if active_log else '12AM.xlsb',
            'uploaded_by': active_log.uploaded_by if active_log else 'System Administrator',
            'uploaded_at': active_log.uploaded_at.isoformat() if active_log else None,
            'date_str': active_log.date_str if active_log else 'Aug 07, 2026',
            'hours_list': hours_list,
            'available_states': all_states,
            'available_lgas': all_lgas,
            'available_tower_cos': all_tower_cos,
            'available_statuses': all_statuses,
            'available_fses': available_fses,
            'total_elements': total_elements,
            'overall_avg': round(avg_agg, 2),
            'sla_compliant_count': sla_compliant_cnt,
            'sla_breached_count': sla_breached_cnt,
            'critical_breach_count': critical_breach_cnt,
            'tech_breakdown': tech_breakdown,
            'lga_breakdown': lga_breakdown,
            'national_regional_data': active_log.national_regional_data if active_log else []
        })


class HourlyAvailabilityListView(APIView):
    def get(self, request):
        qs = HourlyAvailabilityRecord.objects.all()
        qs = scope_queryset_by_user(qs, request, site_id_field='site_id', state_field='state')

        q = request.query_params.get('search', None)
        if q:
            q_clean = q.strip()
            qs = qs.filter(
                Q(site_id__icontains=q_clean) |
                Q(element_name__icontains=q_clean) |
                Q(site_name__icontains=q_clean) |
                Q(lga__icontains=q_clean) |
                Q(state__icontains=q_clean) |
                Q(area_name__icontains=q_clean)
            )

        state_param = request.query_params.get('state', None)
        if state_param and state_param != 'All':
            qs = qs.filter(state__iexact=state_param)

        lga_param = request.query_params.get('lga', None)
        if lga_param and lga_param != 'All':
            qs = qs.filter(lga__iexact=lga_param)

        tech_param = request.query_params.get('tech', None)
        if tech_param and tech_param != 'All':
            qs = qs.filter(tech__iexact=tech_param)

        tower_co_param = request.query_params.get('tower_co', None)
        if tower_co_param and tower_co_param != 'All':
            qs = qs.filter(tower_co__icontains=tower_co_param)

        # ALWAYS exclude Inactive, Decom, Displaced, and Planned sites from Hourly Availability Command Center
        qs = qs.exclude(
            status__icontains='Inactive'
        ).exclude(
            status__icontains='Decom'
        ).exclude(
            status__icontains='Displaced'
        ).exclude(
            status__icontains='Planned'
        )

        status_param = request.query_params.get('status', None)
        if status_param and status_param != 'All' and status_param.lower() != 'inactive':
            qs = qs.filter(status__iexact=status_param)

        fse_param = request.query_params.get('fse', None)
        if fse_param and fse_param != 'All':
            clean_fse = fse_param.strip()
            fse_site_ids = list(Site.objects.filter(
                Q(smc_fse_name__icontains=clean_fse) | Q(mtn_fse_name__icontains=clean_fse)
            ).values_list('ihs_site_id', flat=True))
            if fse_site_ids:
                qs = qs.filter(Q(site_id__in=fse_site_ids) | Q(element_name__icontains=clean_fse))
            else:
                qs = qs.filter(Q(site_id__icontains=clean_fse) | Q(element_name__icontains=clean_fse))

        min_avail = request.query_params.get('min_avail', None)
        if min_avail:
            try: qs = qs.filter(avg_availability__gte=float(min_avail))
            except ValueError: pass

        max_avail = request.query_params.get('max_avail', None)
        if max_avail:
            try: qs = qs.filter(avg_availability__lte=float(max_avail))
            except ValueError: pass

        sort = request.query_params.get('sort', '-avg_availability')
        if sort in ['avg_availability', '-avg_availability', 'site_id', '-site_id', 'tech', '-tech', 'lga', '-lga']:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by('avg_availability')

        paginator = FlexiblePagination()
        paginated_records = paginator.paginate_queryset(qs, request)

        results = []
        for rec in paginated_records:
            results.append({
                'id': rec.id,
                'site_id': rec.site_id,
                'tech': rec.tech,
                'element_name': rec.element_name,
                'site_name': rec.site_name,
                'state': rec.state,
                'region': rec.region,
                'lga': rec.lga,
                'territory': rec.territory,
                'tower_co': rec.tower_co,
                'area_name': rec.area_name,
                'status': rec.status,
                'hourly_scores': rec.hourly_scores,
                'avg_availability': rec.avg_availability,
                'latest_availability': rec.latest_availability,
                'latest_hour': rec.latest_hour
            })

        return paginator.get_paginated_response(results)


class ResetHourlyBaseAvailabilityView(APIView):
    def post(self, request):
        user_role = request.data.get('user_role', '') or request.query_params.get('user_role', '')
        is_fse = (request.user and request.user.is_authenticated and request.user.groups.filter(name__icontains='FSE').exists()) or (user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE'])
        if is_fse:
            return Response({'error': 'Resetting hourly availability datasets is restricted for SMC FSE Engineers. Please contact your State Delivery Manager.'}, status=status.HTTP_403_FORBIDDEN)

        if not os.path.exists(DEFAULT_HOURLY_BASE_PATH):
            return Response({'error': f'Base file not found at {DEFAULT_HOURLY_BASE_PATH}'}, status=status.HTTP_404_NOT_FOUND)

        uploaded_by = request.data.get('uploaded_by', 'System Administrator')
        result = process_hourly_availability_file(
            file_source=DEFAULT_HOURLY_BASE_PATH,
            filename='12AM.xlsb',
            uploaded_by=uploaded_by,
            is_base=True
        )

        if result.get('success'):
            return Response({'message': 'Successfully reset Hourly Availability to base dataset 12AM.xlsb.', 'details': result}, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
