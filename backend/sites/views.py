import time
import re
import json
import urllib.request
import urllib.parse
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q, Count, Sum, Avg, Min, Max
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Site, Notification, TNLLink, IHSFiberLink, HuaweiFiberLink, CellSector, UserProfile
from notes.models import SiteNote
from whatsapp.models import WhatsAppMessage
from .serializers import SiteSerializer, SiteDetailSerializer, NotificationSerializer, TNLLinkSerializer, IHSFiberLinkSerializer, HuaweiFiberLinkSerializer, CellSectorSerializer
from .kml_importer import parse_and_import_kml

# Brute-Force Lockout Tracking (5 attempts per 15 mins)
FAILED_LOGIN_ATTEMPTS = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes

# High-speed In-Memory API Response & Lookup Cache
_API_CACHE = {}
_PI_WEIGHT_CACHE = {'ts': 0, 'data': None}
_BASE_MAP_SITES_CACHE = {'ts': 0, 'by_id': None}

def get_cached_response(key, ttl=120):
    entry = _API_CACHE.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None

def set_cached_response(key, data):
    if len(_API_CACHE) > 300:
        now = time.time()
        expired = [k for k, v in list(_API_CACHE.items()) if now - v[0] > 180]
        for k in expired:
            _API_CACHE.pop(k, None)
        if len(_API_CACHE) > 300:
            _API_CACHE.clear()
    _API_CACHE[key] = (time.time(), data)

def invalidate_api_cache():
    _API_CACHE.clear()
    _BASE_MAP_SITES_CACHE['ts'] = 0
    _BASE_MAP_SITES_CACHE['by_id'] = None

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
    rdm_param = request.query_params.get('rdm', '') or request.query_params.get('rdm_name', '')

    if request.user and request.user.is_authenticated:
        full_n = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        is_rdm_group = request.user.groups.filter(name__icontains='RDM').exists()
        is_fse_group = request.user.groups.filter(name__icontains='FSE').exists()

        if is_rdm_group or user_role in ['MTN RDM', 'Regional Delivery Manager', 'RDM'] or request.user.username.startswith('rdm_'):
            user_role = 'MTN RDM'
            rdm_param = rdm_param or full_n
        elif is_fse_group or user_role in ['SMC FSE Engineer', 'FSE Engineer', 'FSE']:
            user_role = 'SMC FSE Engineer'
            fse_param = fse_param or full_n
        else:
            if not user_role and not request.user.is_superuser:
                user_role = 'State Delivery Manager'
            sdm_param = sdm_param or full_n

    # 2. MTN RDM: Regional Delivery Manager sees all sites & SDMs under their regional command
    if user_role in ['MTN RDM', 'Regional Delivery Manager', 'RDM'] or (rdm_param and rdm_param != 'All' and rdm_param != 'undefined'):
        target_rdm = rdm_param if (rdm_param and rdm_param != 'All' and rdm_param != 'undefined') else None
        if not target_rdm and request.user and request.user.is_authenticated:
            target_rdm = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username

        if target_rdm:
            clean_rdm = target_rdm.strip()
            parts = [p for p in clean_rdm.split() if len(p) >= 3]
            rdm_q = Q(mtn_rdm_name__iexact=clean_rdm) | Q(mtn_rdm_name__icontains=clean_rdm)
            if len(parts) >= 2:
                rdm_q |= (Q(mtn_rdm_name__icontains=parts[0]) & Q(mtn_rdm_name__icontains=parts[-1]))
            elif len(parts) == 1:
                rdm_q |= Q(mtn_rdm_name__icontains=parts[0])

            # If RDM selected a specific SDM under them to filter by:
            if sdm_param and sdm_param != 'All' and sdm_param != 'undefined':
                rdm_q &= (Q(sdm_name__iexact=sdm_param.strip()) | Q(sdm_name__icontains=sdm_param.strip()))

            if site_id_field == 'site_id':
                # For DailyAvailabilityRecord / HourlyAvailabilityRecord
                rdm_site_ids = list(Site.objects.filter(rdm_q).values_list('ihs_site_id', flat=True))
                if rdm_site_ids:
                    expanded_ids = set(rdm_site_ids)
                    for sid in rdm_site_ids:
                        expanded_ids.add('U' + sid)
                        expanded_ids.add('L' + sid)
                        expanded_ids.add('N' + sid)
                        expanded_ids.add('LTE' + sid)
                    return qs.filter(Q(site_id__in=expanded_ids) | Q(element_name__in=expanded_ids))
                return qs.filter(Q(site_id__icontains=clean_rdm))
            else:
                # For Site model
                return qs.filter(rdm_q)

    # 3. SMC FSE Engineer: Sees ONLY their own assigned sites
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
                    expanded_ids = set(fse_site_ids)
                    for sid in fse_site_ids:
                        expanded_ids.add('U' + sid)
                        expanded_ids.add('L' + sid)
                        expanded_ids.add('N' + sid)
                        expanded_ids.add('LTE' + sid)
                    return qs.filter(Q(site_id__in=expanded_ids) | Q(element_name__in=expanded_ids) | Q(element_name__icontains=clean_fse))
                return qs.filter(Q(site_id__icontains=clean_fse) | Q(element_name__icontains=clean_fse))
            else:
                # For Site model
                return qs.filter(fse_q)

    # 4. State Delivery Manager (SDM): If an explicit state filter is provided, enforce it directly
    if explicit_state and explicit_state != 'All':
        clean_st = explicit_state.strip().upper()
        if clean_st.startswith('RT') and len(clean_st) > 2:
            clean_st = clean_st[2:]
        if clean_st in ('FC', 'FCT', 'ABUJA'):
            return qs.filter(**{f'{state_field}__in': ['FCT', 'RTFCT', 'FC', 'ABUJA']})
        return qs.filter(Q(**{f'{state_field}__iexact': clean_st}) | Q(**{f'{state_field}__iexact': 'RT' + clean_st}))

    matched_states = []
    if user_state and user_state != 'ALL' and user_state != 'All':
        clean_st = user_state.strip().upper()
        if clean_st.startswith('RT') and len(clean_st) > 2:
            clean_st = clean_st[2:]
        if clean_st in ('FC', 'FCT', 'ABUJA'):
            matched_states.extend(['FCT', 'RTFCT', 'FC', 'ABUJA'])
        else:
            matched_states.extend([clean_st, 'RT' + clean_st])

    if sdm_param and sdm_param != 'All':
        sdm_states_raw = Site.objects.filter(
            Q(sdm_name__iexact=sdm_param) | Q(sdm_name__icontains=sdm_param)
        ).values_list(state_field, flat=True).distinct()
        for st in sdm_states_raw:
            if not st: continue
            clean_st = st.strip().upper()
            if clean_st.startswith('RT') and len(clean_st) > 2:
                clean_st = clean_st[2:]
            if clean_st in ('FC', 'FCT', 'ABUJA'):
                for fct_alias in ['FCT', 'RTFCT', 'FC', 'ABUJA']:
                    if fct_alias not in matched_states:
                        matched_states.append(fct_alias)
            elif clean_st and clean_st not in matched_states:
                matched_states.extend([clean_st, 'RT' + clean_st])

    if matched_states:
        return qs.filter(**{f'{state_field}__in': list(set(matched_states))})

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
                Q(smc_fse_phone__icontains=q) |
                Q(efs_name__icontains=q) |
                Q(efs_phone__icontains=q) |
                Q(rto_name__icontains=q) |
                Q(rto_phone__icontains=q) |
                Q(smc__icontains=q) |
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

        region = self.request.query_params.get('region', None)
        if region and region != 'All' and exclude_param != 'region':
            qs = qs.filter(region__iexact=region)

        lga = self.request.query_params.get('lga', None)
        if lga and lga != 'All' and exclude_param != 'lga':
            qs = qs.filter(lga__iexact=lga)

        matrix_only = self.request.query_params.get('matrix_only', None) or self.request.query_params.get('ihs_matrix', None)
        if matrix_only and matrix_only.lower() in ['true', '1', 'yes']:
            qs = qs.filter(raw_data__has_key='Tenant Region')

        return qs

    def get_queryset(self):
        return self.get_filtered_queryset().order_by('ihs_site_id')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            if len(page) <= 250:
                page_ids = [s.id for s in page]
                notes_map = dict(
                    SiteNote.objects.filter(site_id__in=page_ids)
                    .values_list('site_id')
                    .annotate(c=Count('id'))
                )
                wa_map = dict(
                    WhatsAppMessage.objects.filter(site_id__in=page_ids)
                    .values_list('site_id')
                    .annotate(c=Count('id'))
                )
                for s in page:
                    s.notes_count = notes_map.get(s.id, 0)
                    s.whatsapp_count = wa_map.get(s.id, 0)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def map_sites(self, request):
        cache_key = f"map_sites:{request.get_full_path()}:{getattr(request.user, 'id', 0)}"
        cached = get_cached_response(cache_key, ttl=180)
        if cached is not None:
            return Response(cached)

        now = time.time()
        if not _BASE_MAP_SITES_CACHE['by_id'] or (now - _BASE_MAP_SITES_CACHE['ts']) > 300:
            fields = [
                'id', 'ihs_site_id', 'mtn_id', 'cluster_name', 'site_address',
                'latitude', 'longitude', 'operational_status', 'priority',
                'is_down', 'is_critical', 'lga', 'state', 'smc_fse_name',
                'smc_fse_phone', 'sdm_name', 'sdm_phone', 'efs_name',
                'efs_phone', 'rto_name', 'rto_phone', 'smc', 'raw_data'
            ]
            all_sites = list(Site.objects.all().order_by('ihs_site_id').values(*fields))
            cluster_terr_map = {}
            for s in all_sites:
                db_raw = s.get('raw_data') or {}
                t = (
                    db_raw.get('TERRITORY') or 
                    db_raw.get('Territory') or 
                    db_raw.get('territory') or 
                    db_raw.get('AREA NAME') or 
                    db_raw.get('Area Name')
                )
                c = s.get('cluster_name')
                if t and c and str(c).strip() and str(c).strip() not in cluster_terr_map:
                    cluster_terr_map[str(c).strip()] = str(t).strip()

            by_id = {}
            for s in all_sites:
                db_raw = s.pop('raw_data', None) or {}
                territory = (
                    db_raw.get('TERRITORY') or 
                    db_raw.get('Territory') or 
                    db_raw.get('territory') or 
                    db_raw.get('AREA NAME') or 
                    db_raw.get('Area Name')
                )
                if not territory and s.get('cluster_name') and str(s['cluster_name']).strip() in cluster_terr_map:
                    territory = cluster_terr_map[str(s['cluster_name']).strip()]

                clean_terr = str(territory).strip() if (territory and str(territory).strip() not in ['0', 'None', 'null', '-', 'nan', 'NAN']) else ''

                tower_co = (
                    db_raw.get('Tower Co') or 
                    db_raw.get('TowerCo') or 
                    db_raw.get('TOWER CO') or 
                    db_raw.get('OEM') or 
                    s.get('smc') or 
                    'IHS Tower'
                )
                clean_tower_co = str(tower_co).strip() if tower_co else 'IHS Tower'

                s['territory'] = clean_terr
                s['tower_co'] = clean_tower_co

                s['raw_data'] = {
                    'Site Name': db_raw.get('Site Name') or s.get('cluster_name') or '',
                    'Site Cluster': db_raw.get('Site Cluster') or s.get('cluster_name') or '',
                    'Tech': db_raw.get('Tech') or '2G/3G/4G',
                    'Tower Co': clean_tower_co,
                    'TERRITORY': clean_terr,
                    'Territory': clean_terr,
                    'AREA NAME': db_raw.get('AREA NAME') or clean_terr,
                    'LGA': s.get('lga') or db_raw.get('LGA') or '',
                    'Lat': s.get('latitude'),
                    'Long': s.get('longitude'),
                    'SMC FSE': s.get('smc_fse_name') or db_raw.get('FSE NAME') or '',
                }
                by_id[s['id']] = s

            _BASE_MAP_SITES_CACHE['by_id'] = by_id
            _BASE_MAP_SITES_CACHE['ts'] = now

        by_id = _BASE_MAP_SITES_CACHE['by_id']
        qs = self.get_filtered_queryset()
        matching_ids = list(qs.order_by('ihs_site_id').values_list('id', flat=True))
        sites = [by_id[sid] for sid in matching_ids if sid in by_id]
        set_cached_response(cache_key, sites)
        return Response(sites)

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
        cache_key = f"filter_options:{request.get_full_path()}:{getattr(request.user, 'id', 0)}"
        cached = get_cached_response(cache_key, ttl=180)
        if cached is not None:
            return Response(cached)

        def get_distinct(field_name, custom_qs):
            return list(custom_qs.values_list(field_name, flat=True).distinct().exclude(**{f"{field_name}": ''}))

        qs_state = self.get_filtered_queryset(exclude_param='state')
        qs_region = self.get_filtered_queryset(exclude_param='region')
        qs_lga = self.get_filtered_queryset(exclude_param='lga')
        qs_sdm = self.get_filtered_queryset(exclude_param='sdm')
        qs_fse = self.get_filtered_queryset(exclude_param='fse')
        qs_rdm = self.get_filtered_queryset(exclude_param='rdm')

        res_data = {
            'states': sorted([s for s in get_distinct('state', qs_state) if s]),
            'regions': sorted([r for r in get_distinct('region', qs_region) if r]),
            'lgas': sorted([l for l in get_distinct('lga', qs_lga) if l]),
            'sdm_names': sorted([s for s in get_distinct('sdm_name', qs_sdm) if s]),
            'fse_names': sorted([f for f in get_distinct('smc_fse_name', qs_fse) if f]),
            'rdm_names': sorted([r for r in get_distinct('mtn_rdm_name', qs_rdm) if r]),
        }
        set_cached_response(cache_key, res_data)
        return Response(res_data)

    @staticmethod
    def _parse_coordinate_query(query):
        if not query:
            return None
        q = str(query).strip()

        # 1. Labeled format: lat: 9.0765, lng: 7.3986
        m = re.search(r'(?:lat(?:itude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?))\s*[,;\s]\s*(?:l(?:ng|on|ongitude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?))', q, re.I)
        if m:
            try:
                lat, lng = float(m.group(1)), float(m.group(2))
                if -90 <= lat <= 90 and -180 <= lng <= 180:
                    return lat, lng
            except ValueError:
                pass

        # 2. DMS: 9°4'35.4"N 7°23'55.0"E
        dms_matches = re.findall(r'([0-9.]+)\s*°\s*([0-9.]+)?\s*[\'′]?\s*([0-9.]+)?\s*[\"″]?\s*([NSEW])', q, re.I)
        if len(dms_matches) == 2:
            try:
                parts = []
                for m_match in dms_matches:
                    deg = float(m_match[0])
                    mins = float(m_match[1]) if m_match[1] else 0.0
                    sec = float(m_match[2]) if m_match[2] else 0.0
                    direction = m_match[3].upper()
                    val = deg + mins / 60.0 + sec / 3600.0
                    if direction in ['S', 'W']:
                        val = -val
                    parts.append((val, direction))

                if parts[0][1] in ['N', 'S'] and parts[1][1] in ['E', 'W']:
                    lat, lng = parts[0][0], parts[1][0]
                elif parts[0][1] in ['E', 'W'] and parts[1][1] in ['N', 'S']:
                    lng, lat = parts[0][0], parts[1][0]
                else:
                    lat, lng = parts[0][0], parts[1][0]

                if -90 <= lat <= 90 and -180 <= lng <= 180:
                    return lat, lng
            except Exception:
                pass

        # 3. Simple Decimal: '9.0765, 7.3986' or '9.0765 7.3986' or '[9.0765, 7.3986]'
        clean_q = re.sub(r'[()[\]{}]', '', q).strip()
        m2 = re.match(r'^([+-]?\d+(?:\.\d+)?)\s*[,;\s/]\s*([+-]?\d+(?:\.\d+)?)$', clean_q)
        if m2:
            try:
                lat, lng = float(m2.group(1)), float(m2.group(2))
                if -90 <= lat <= 90 and -180 <= lng <= 180:
                    return lat, lng
            except ValueError:
                pass

        return None

    @action(detail=False, methods=['get'])
    def geocode(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'results': []})

        # 1. Check if query is a coordinate (decimal, DMS, labeled)
        coords = self._parse_coordinate_query(query)
        if coords:
            lat, lng = coords
            return Response({
                'results': [{
                    'type': 'coordinate',
                    'title': f'Coordinates ({lat:.5f}, {lng:.5f})',
                    'display_name': f'Target Coordinates: {lat:.6f}, {lng:.6f}',
                    'lat': lat,
                    'lng': lng,
                    'category': 'coordinate'
                }]
            })

        user_state = request.query_params.get('state', '').strip()

        # 2. Query OpenStreetMap Nominatim for streets, areas, districts, landmarks
        osm_results = []
        try:
            viewbox_param = "&viewbox=6.75,9.40,7.80,8.25" if (not user_state or 'FCT' in user_state.upper() or 'ABUJA' in user_state.upper()) else ""
            encoded_q = urllib.parse.quote(query)
            url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_q}&countrycodes=ng{viewbox_param}&limit=6&addressdetails=1"
            req = urllib.request.Request(url, headers={'User-Agent': 'SDMDashboard/1.0'})
            with urllib.request.urlopen(req, timeout=7) as response:
                osm_data = json.loads(response.read().decode('utf-8'))
                for item in osm_data:
                    lat = float(item.get('lat', 0))
                    lon = float(item.get('lon', 0))
                    if lat and lon:
                        osm_results.append({
                            'type': 'street_or_area',
                            'title': item.get('name') or (item.get('display_name', '').split(',')[0]),
                            'display_name': item.get('display_name'),
                            'lat': lat,
                            'lng': lon,
                            'category': item.get('type') or item.get('class') or 'place'
                        })
        except Exception as e:
            pass

        # 3. Match against local telecom sites database (Site Address, Cluster, LGA)
        db_results = []
        try:
            site_qs = Site.objects.all()
            if user_state and user_state.upper() != 'ALL':
                site_qs = site_qs.filter(state__icontains=user_state)

            matched_sites = site_qs.filter(
                Q(site_address__icontains=query) |
                Q(cluster_name__icontains=query) |
                Q(lga__icontains=query) |
                Q(ihs_site_id__iexact=query)
            ).exclude(latitude__isnull=True).exclude(longitude__isnull=True)[:4]

            for s in matched_sites:
                if s.latitude and s.longitude:
                    db_results.append({
                        'type': 'site_location',
                        'title': s.cluster_name or s.site_address or s.ihs_site_id,
                        'display_name': f"{s.ihs_site_id} - {s.cluster_name or s.site_address or ''} ({s.lga or s.state or ''})",
                        'lat': float(s.latitude),
                        'lng': float(s.longitude),
                        'site_id': s.ihs_site_id,
                        'category': 'telecom_site'
                    })
        except Exception:
            pass

        # Deduplicate & prioritize results
        combined = osm_results + db_results
        return Response({'results': combined})


class UserProfileView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def _resolve_user(self, request):
        if request.user and request.user.is_authenticated:
            return request.user
        username = request.data.get('username') or request.query_params.get('username') or request.data.get('user') or request.query_params.get('user')
        if username:
            clean_u = str(username).strip().lower().replace(' ', '_')
            user = User.objects.filter(Q(username__iexact=clean_u) | Q(first_name__icontains=username) | Q(email__iexact=username)).first()
            if user:
                return user
        user_id = request.data.get('user_id') or request.query_params.get('user_id')
        if user_id and str(user_id).isdigit():
            return User.objects.filter(pk=int(user_id)).first()
        return None

    def _get_user_role_and_sites(self, user):
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        clean_user_name = full_name if (user.first_name and user.last_name) else user.username.replace('_', ' ')
        parts = [p for p in clean_user_name.split() if len(p) >= 3]

        is_fse_group = user.groups.filter(name='SMC FSE Engineer').exists()
        fse_query = Q(smc_fse_name__iexact=full_name) | Q(smc_fse_name__iexact=clean_user_name) | Q(smc_fse_name__icontains=full_name)
        if len(parts) >= 2:
            fse_query |= (Q(smc_fse_name__icontains=parts[0]) & Q(smc_fse_name__icontains=parts[-1]))
        elif user.first_name:
            fse_query |= Q(smc_fse_name__icontains=user.first_name)
        fse_sites_qs = Site.objects.filter(fse_query)

        is_rdm_group = user.groups.filter(name='MTN RDM').exists() or user.username.startswith('rdm_') or user.username in ['mtn_rdm', 'rdmadmin']
        rdm_query = Q(mtn_rdm_name__iexact=full_name) | Q(mtn_rdm_name__icontains=full_name) | Q(mtn_rdm_name__iexact=clean_user_name)
        if len(parts) >= 2:
            rdm_query |= (Q(mtn_rdm_name__icontains=parts[0]) & Q(mtn_rdm_name__icontains=parts[-1]))
        elif user.first_name:
            rdm_query |= Q(mtn_rdm_name__icontains=user.first_name)

        rdm_sites_qs = Site.objects.filter(rdm_query)
        if (is_rdm_group or user.username in ['mtn_rdm', 'rdmadmin']) and not rdm_sites_qs.exists():
            rdm_sites_qs = Site.objects.filter(mtn_rdm_name__icontains='Onikola')

        sdm_sites_qs = Site.objects.filter(sdm_name__iexact=full_name)
        if not sdm_sites_qs.exists() and full_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=full_name)
        if not sdm_sites_qs.exists() and user.first_name and user.last_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name).filter(sdm_name__icontains=user.last_name)
        if not sdm_sites_qs.exists() and user.first_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name)

        is_rdm = is_rdm_group or (rdm_sites_qs.exists() and not is_fse_group and not sdm_sites_qs.exists())
        is_fse = is_fse_group or (fse_sites_qs.exists() and not sdm_sites_qs.exists() and not is_rdm)

        if user.is_superuser:
            role = 'Super Administrator'
            assigned_sites_qs = Site.objects.all()
            assigned_count = assigned_sites_qs.count()
            user_state = 'ALL'
            all_assigned_states = ['ALL']
        elif is_rdm:
            role = 'MTN RDM'
            assigned_sites_qs = rdm_sites_qs
            assigned_count = assigned_sites_qs.count()
            all_states_raw = assigned_sites_qs.values_list('state', flat=True).distinct()
            all_assigned_states = []
            for st in all_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in all_assigned_states:
                    all_assigned_states.append(clean_st)
            user_state = ', '.join(all_assigned_states[:3]) if all_assigned_states else 'Regional Command'
        elif is_fse:
            role = 'SMC FSE Engineer'
            assigned_sites_qs = fse_sites_qs
            assigned_count = assigned_sites_qs.count()
            user_state = 'FSE_ONLY'
            all_assigned_states = ['FSE_ONLY']
        else:
            role = 'State Delivery Manager'
            assigned_sites_qs = sdm_sites_qs
            assigned_count = assigned_sites_qs.count()
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

        return role, assigned_count, user_state, all_assigned_states

    def get(self, request):
        user = self._resolve_user(request)
        if not user:
            return Response({'error': 'User not found or unauthenticated.'}, status=status.HTTP_401_UNAUTHORIZED)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        role, assigned_count, user_state, all_assigned_states = self._get_user_role_and_sites(user)

        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        avatar_url = profile.avatar.url if (profile.avatar and hasattr(profile.avatar, 'url')) else None

        default_company = profile.company or ('MTN Nigeria' if role == 'MTN RDM' else ('Huawei / SMC' if role == 'SMC FSE Engineer' else ('IHS Towers' if role == 'State Delivery Manager' else 'FCT Telecom Network')))
        default_job_title = profile.job_title or (role if role != 'State Delivery Manager' else 'State Delivery Manager (SDM)')

        return Response({
            'id': user.id,
            'username': user.username,
            'full_name': full_name,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email or f"{user.username}@fcttelecom.ng",
            'avatar_url': avatar_url,
            'phone_number': profile.phone_number or getattr(user, 'phone', '') or '',
            'phone': profile.phone_number or getattr(user, 'phone', '') or '',
            'job_title': default_job_title,
            'company': default_company,
            'bio': profile.bio or '',
            'whatsapp_number': profile.whatsapp_number or profile.phone_number or '',
            'department': profile.department or 'Network Operations',
            'preferred_language': profile.preferred_language or 'en',
            'role': role,
            'is_superuser': user.is_superuser,
            'assigned_sites_count': assigned_count,
            'state': user_state,
            'assigned_states': all_assigned_states,
            'date_joined': user.date_joined,
            'last_login': user.last_login
        })

    def post(self, request):
        user = self._resolve_user(request)
        if not user:
            return Response({'error': 'User not found or unauthenticated.'}, status=status.HTTP_401_UNAUTHORIZED)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        data = request.data

        # 1. Update Profile Picture / Avatar
        if 'avatar' in request.FILES:
            profile.avatar = request.FILES['avatar']
        elif data.get('remove_avatar') in [True, 'true', '1']:
            if profile.avatar:
                profile.avatar.delete(save=False)
            profile.avatar = None

        # 2. Update Name
        if 'full_name' in data and data['full_name'].strip():
            raw_full = data['full_name'].strip()
            parts = raw_full.split(maxsplit=1)
            user.first_name = parts[0]
            user.last_name = parts[1] if len(parts) > 1 else ''
        else:
            if 'first_name' in data:
                user.first_name = data['first_name'].strip()
            if 'last_name' in data:
                user.last_name = data['last_name'].strip()

        # 3. Update Email
        if 'email' in data and data['email'].strip():
            user.email = data['email'].strip()

        # 4. Update Profile Details
        if 'phone_number' in data:
            profile.phone_number = str(data['phone_number']).strip()
        if 'job_title' in data:
            profile.job_title = str(data['job_title']).strip()
        if 'company' in data:
            profile.company = str(data['company']).strip()
        if 'bio' in data:
            profile.bio = str(data['bio']).strip()
        if 'whatsapp_number' in data:
            profile.whatsapp_number = str(data['whatsapp_number']).strip()
        if 'department' in data:
            profile.department = str(data['department']).strip()
        if 'preferred_language' in data:
            profile.preferred_language = str(data['preferred_language']).strip()

        # 5. Handle Password Change if requested
        new_password = data.get('new_password', '').strip()
        if new_password:
            current_password = data.get('current_password', '').strip()
            if not user.is_superuser and not user.check_password(current_password):
                return Response({'error': 'Current password does not match. Please verify and try again.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(new_password) < 6:
                return Response({'error': 'New password must be at least 6 characters long.'}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(new_password)

        user.save()
        profile.save()

        # Sync updated phone number to site database records for SDMs, RDMs, and FSEs
        if profile.phone_number:
            full_name = f"{user.first_name} {user.last_name}".strip() or user.username
            Site.objects.filter(sdm_name__iexact=full_name).update(sdm_phone=profile.phone_number)
            Site.objects.filter(mtn_rdm_name__iexact=full_name).update(mtn_rdm_phone=profile.phone_number)
            Site.objects.filter(smc_fse_name__iexact=full_name).update(smc_fse_phone=profile.phone_number)

        role, assigned_count, user_state, all_assigned_states = self._get_user_role_and_sites(user)
        avatar_url = profile.avatar.url if (profile.avatar and hasattr(profile.avatar, 'url')) else None

        return Response({
            'message': 'Profile updated successfully!',
            'user': {
                'id': user.id,
                'username': user.username,
                'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email': user.email or f"{user.username}@fcttelecom.ng",
                'avatar_url': avatar_url,
                'phone': profile.phone_number,
                'phone_number': profile.phone_number,
                'job_title': profile.job_title or role,
                'company': profile.company,
                'bio': profile.bio,
                'whatsapp_number': profile.whatsapp_number or profile.phone_number,
                'department': profile.department,
                'preferred_language': profile.preferred_language,
                'role': role,
                'is_superuser': user.is_superuser,
                'assigned_sites_count': assigned_count,
                'state': user_state,
                'assigned_states': all_assigned_states
            }
        }, status=status.HTTP_200_OK)

    def put(self, request):
        return self.post(request)

    def patch(self, request):
        return self.post(request)


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
        user = authenticate(username=norm_username, password=password) or authenticate(username=username_or_name, password=password)

        if not user:
            # Fallback check across username, full name parts, email, and known aliases
            name_parts = [p for p in username_or_name.replace('_', ' ').split() if p]
            cand_q = (
                Q(username__iexact=norm_username) |
                Q(username__iexact=username_or_name) |
                Q(first_name__icontains=username_or_name) |
                Q(last_name__icontains=username_or_name) |
                Q(email__iexact=username_or_name) |
                Q(email__icontains=norm_username)
            )
            if len(name_parts) >= 2:
                cand_q |= (
                    (Q(first_name__icontains=name_parts[0]) & Q(last_name__icontains=name_parts[-1])) |
                    (Q(first_name__icontains=name_parts[-1]) & Q(last_name__icontains=name_parts[0]))
                )
            if norm_username in ('chris_ogwara', 'christian_ogwara', 'ogwara_christian', 'chris', 'mrchrys'):
                cand_q |= Q(username__in=['mrchrys', 'chrys'])

            candidates = list(User.objects.filter(cand_q).distinct())
            for cand in candidates:
                if cand.check_password(password):
                    user = cand
                    break

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

        # Ensure user profile exists
        profile, _ = UserProfile.objects.get_or_create(user=user)
        avatar_url = profile.avatar.url if (profile.avatar and hasattr(profile.avatar, 'url')) else None

        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        clean_user_name = full_name if (user.first_name and user.last_name) else user.username.replace('_', ' ')
        parts = [p for p in clean_user_name.split() if len(p) >= 3]
        
        # Check if user is in 'SMC FSE Engineer' group or has matching FSE sites
        is_fse_group = user.groups.filter(name='SMC FSE Engineer').exists()
        fse_query = Q(smc_fse_name__iexact=full_name) | Q(smc_fse_name__iexact=clean_user_name) | Q(smc_fse_name__icontains=full_name)
        if len(parts) >= 2:
            fse_query |= (Q(smc_fse_name__icontains=parts[0]) & Q(smc_fse_name__icontains=parts[-1]))
        elif user.first_name:
            fse_query |= Q(smc_fse_name__icontains=user.first_name)
        fse_sites_qs = Site.objects.filter(fse_query)

        # Check if user is in 'MTN RDM' group or has matching RDM sites
        is_rdm_group = user.groups.filter(name='MTN RDM').exists() or user.username.startswith('rdm_') or user.username in ['mtn_rdm', 'rdmadmin']
        rdm_query = Q(mtn_rdm_name__iexact=full_name) | Q(mtn_rdm_name__icontains=full_name) | Q(mtn_rdm_name__iexact=clean_user_name)
        if len(parts) >= 2:
            rdm_query |= (Q(mtn_rdm_name__icontains=parts[0]) & Q(mtn_rdm_name__icontains=parts[-1]))
        elif user.first_name:
            rdm_query |= Q(mtn_rdm_name__icontains=user.first_name)

        rdm_sites_qs = Site.objects.filter(rdm_query)
        if (is_rdm_group or user.username in ['mtn_rdm', 'rdmadmin']) and not rdm_sites_qs.exists():
            rdm_sites_qs = Site.objects.filter(mtn_rdm_name__icontains='Onikola')

        sdm_sites_qs = Site.objects.filter(sdm_name__iexact=full_name)
        if not sdm_sites_qs.exists() and full_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=full_name)
        if not sdm_sites_qs.exists() and user.first_name and user.last_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name).filter(sdm_name__icontains=user.last_name)
        if not sdm_sites_qs.exists() and user.first_name:
            sdm_sites_qs = Site.objects.filter(sdm_name__icontains=user.first_name)

        is_rdm = is_rdm_group or (rdm_sites_qs.exists() and not is_fse_group and not sdm_sites_qs.exists())
        is_fse = is_fse_group or (fse_sites_qs.exists() and not sdm_sites_qs.exists() and not is_rdm)

        sdms_under_rdm = []
        if user.is_superuser:
            role = 'Super Administrator'
            assigned_sites_qs = Site.objects.all()
            assigned_count = assigned_sites_qs.count()
            user_state = 'ALL'
            all_assigned_states = ['ALL']
            phone = profile.phone_number or '0800-000-000'
        elif is_rdm:
            role = 'MTN RDM'
            assigned_sites_qs = rdm_sites_qs
            assigned_count = assigned_sites_qs.count()
            site_sample = assigned_sites_qs.first()
            phone = profile.phone_number or getattr(site_sample, 'mtn_rdm_phone', None) or '0800-000-000'

            all_states_raw = assigned_sites_qs.values_list('state', flat=True).distinct()
            all_assigned_states = []
            for st in all_states_raw:
                if not st: continue
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in all_assigned_states:
                    all_assigned_states.append(clean_st)

            user_state = ', '.join(all_assigned_states[:3]) if all_assigned_states else 'Regional Command'

            # Extract list of SDMs under this RDM with live status
            for s_name in assigned_sites_qs.exclude(sdm_name='').exclude(sdm_name__isnull=True).values_list('sdm_name', flat=True).distinct():
                s_sites = assigned_sites_qs.filter(sdm_name=s_name)
                s_sample = s_sites.first()
                s_states = list(s_sites.exclude(state='').exclude(state__isnull=True).values_list('state', flat=True).distinct())
                clean_s_states = []
                for st in s_states:
                    cst = st.strip().upper()
                    if cst.startswith('RT') and len(cst) > 2:
                        cst = cst[2:]
                    if cst and cst not in clean_s_states:
                        clean_s_states.append(cst)

                cnt = s_sites.count()
                down_cnt = s_sites.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
                crit_cnt = s_sites.filter(Q(is_critical=True) | Q(priority__icontains='P1')).count()

                sdms_under_rdm.append({
                    'name': s_name,
                    'phone': getattr(s_sample, 'sdm_phone', None) or 'N/A',
                    'states': clean_s_states,
                    'primary_state': clean_s_states[0] if clean_s_states else 'FCT',
                    'sites_count': cnt,
                    'sites_down': down_cnt,
                    'critical_sites': crit_cnt,
                    'operational_percentage': round(100.0 - (down_cnt / max(1, cnt) * 100.0), 2)
                })
            sdms_under_rdm.sort(key=lambda x: x['sites_count'], reverse=True)
        elif is_fse:
            role = 'SMC FSE Engineer'
            assigned_sites_qs = fse_sites_qs
            assigned_count = assigned_sites_qs.count()
            site_sample = assigned_sites_qs.first()
            phone = profile.phone_number or getattr(site_sample, 'smc_fse_phone', None) or '0800-000-000'
            user_state = 'FSE_ONLY'
            all_assigned_states = ['FSE_ONLY']
        else:
            role = 'State Delivery Manager'
            assigned_sites_qs = sdm_sites_qs
            assigned_count = assigned_sites_qs.count()
            site_sample = assigned_sites_qs.first()
            phone = profile.phone_number or getattr(site_sample, 'sdm_phone', None) or '0800-000-000'

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
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email': user.email or f"{user.username}@fcttelecom.ng",
                'avatar_url': avatar_url,
                'phone': phone,
                'phone_number': profile.phone_number or phone,
                'job_title': profile.job_title or role,
                'company': profile.company or ('MTN Nigeria' if role == 'MTN RDM' else ('Huawei / SMC' if role == 'SMC FSE Engineer' else ('IHS Towers' if role == 'State Delivery Manager' else 'FCT Telecom Network'))),
                'bio': profile.bio or '',
                'whatsapp_number': profile.whatsapp_number or phone,
                'department': profile.department or 'Network Operations',
                'preferred_language': profile.preferred_language or 'en',
                'role': role,
                'is_superuser': user.is_superuser,
                'assigned_sites_count': assigned_count,
                'state': user_state,
                'assigned_states': all_assigned_states,
                'sdms_under_rdm': sdms_under_rdm,
                'assigned_sdms_count': len(sdms_under_rdm),
                'region': f"MTN Regional Command ({len(sdms_under_rdm)} SDMs • {assigned_count:,} Sites)" if role == 'MTN RDM' else (f"{user_state} Territory" if role != 'Super Administrator' and role != 'SMC FSE Engineer' else ('All Nigeria State Territories' if user.is_superuser else f'Assigned FSE Sites ({assigned_count} Sites)'))
            }
        })


class SDMListView(APIView):
    def get(self, request):
        total_sites_count = Site.objects.count()

        counts_raw = Site.objects.exclude(sdm_name__isnull=True).exclude(sdm_name='').values('sdm_name').annotate(cnt=Count('id'))
        counts_dict = {item['sdm_name'].strip().lower(): item['cnt'] for item in counts_raw}

        rdm_counts_raw = Site.objects.exclude(mtn_rdm_name__isnull=True).exclude(mtn_rdm_name='').values('mtn_rdm_name').annotate(cnt=Count('id'))
        rdm_counts_dict = {item['mtn_rdm_name'].strip().lower(): item['cnt'] for item in rdm_counts_raw}

        fse_counts_raw = Site.objects.exclude(smc_fse_name__isnull=True).exclude(smc_fse_name='').values('smc_fse_name').annotate(cnt=Count('id'))
        fse_counts_dict = {item['smc_fse_name'].strip().lower(): item['cnt'] for item in fse_counts_raw}

        users = User.objects.all().select_related('profile').order_by('-is_superuser', 'first_name')
        sdm_list = []
        registered_names = set()
        registered_usernames = set()

        for u in users:
            full_name = f"{u.first_name} {u.last_name}".strip() or u.username
            registered_usernames.add(u.username.lower())
            registered_names.add(full_name.lower())
            if u.first_name:
                registered_names.add(u.first_name.lower())

            prof = getattr(u, 'profile', None)
            avatar_url = prof.avatar.url if (prof and prof.avatar and hasattr(prof.avatar, 'url')) else None
            phone_val = prof.phone_number if prof else ''

            is_rdm_group = u.groups.filter(name='MTN RDM').exists() or u.username.startswith('rdm_') or u.username in ['mtn_rdm', 'rdmadmin']
            is_fse_group = u.groups.filter(name='SMC FSE Engineer').exists()
            if u.is_superuser:
                role = 'Super Administrator'
                cnt = total_sites_count
            elif is_rdm_group:
                role = 'MTN RDM'
                cnt = rdm_counts_dict.get(full_name.lower(), 0)
                if cnt == 0 and u.first_name:
                    cnt = rdm_counts_dict.get(u.first_name.lower(), 0)
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
                'avatar_url': avatar_url,
                'phone': phone_val,
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

        if role in ['MTN RDM', 'Regional Delivery Manager', 'RDM']:
            from django.contrib.auth.models import Group
            group, _ = Group.objects.get_or_create(name='MTN RDM')
            user.groups.add(group)
        elif role == 'SMC FSE Engineer':
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


class RDMSupervisedSDMsView(APIView):
    def get(self, request):
        rdm_param = request.query_params.get('rdm', '') or request.query_params.get('user_name', '')
        if request.user and request.user.is_authenticated:
            full_n = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
            if request.user.groups.filter(name__icontains='RDM').exists() or not rdm_param:
                rdm_param = rdm_param or full_n

        if not rdm_param or rdm_param.lower() in ['all', 'admin', 'superuser', 'rdmadmin', 'mtn_rdm']:
            # Fallback check
            rdm_match = Site.objects.filter(mtn_rdm_name__icontains=rdm_param).first() if rdm_param else None
            if rdm_match:
                rdm_param = rdm_match.mtn_rdm_name
            else:
                rdm_param = 'Onikola Lukman Adesina'

        rdm_q = Q(mtn_rdm_name__iexact=rdm_param) | Q(mtn_rdm_name__icontains=rdm_param)
        parts = [p for p in rdm_param.split() if len(p) >= 3]
        if len(parts) >= 2:
            rdm_q |= (Q(mtn_rdm_name__icontains=parts[0]) & Q(mtn_rdm_name__icontains=parts[-1]))
        elif len(parts) == 1:
            rdm_q |= Q(mtn_rdm_name__icontains=parts[0])

        rdm_sites = Site.objects.filter(rdm_q)
        total_regional_sites = rdm_sites.count()
        total_sites_down = rdm_sites.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
        total_critical = rdm_sites.filter(Q(is_critical=True) | Q(priority__icontains='P1')).count()

        sdms_list = []
        for s_name in rdm_sites.exclude(sdm_name='').exclude(sdm_name__isnull=True).values_list('sdm_name', flat=True).distinct():
            s_sites = rdm_sites.filter(sdm_name=s_name)
            s_sample = s_sites.first()
            s_states = list(s_sites.exclude(state='').exclude(state__isnull=True).values_list('state', flat=True).distinct())
            clean_states = []
            for st in s_states:
                clean_st = st.strip().upper()
                if clean_st.startswith('RT') and len(clean_st) > 2:
                    clean_st = clean_st[2:]
                if clean_st and clean_st not in clean_states:
                    clean_states.append(clean_st)

            cnt = s_sites.count()
            down_cnt = s_sites.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
            crit_cnt = s_sites.filter(Q(is_critical=True) | Q(priority__icontains='P1')).count()
            op_pct = round(100.0 - (down_cnt / max(1, cnt) * 100.0), 2)

            sdms_list.append({
                'name': s_name,
                'phone': getattr(s_sample, 'sdm_phone', None) or 'N/A',
                'states': clean_states,
                'primary_state': clean_states[0] if clean_states else 'FCT',
                'sites_count': cnt,
                'sites_down': down_cnt,
                'critical_sites': crit_cnt,
                'operational_percentage': op_pct
            })

        sdms_list.sort(key=lambda x: x['sites_count'], reverse=True)

        return Response({
            'rdm_name': rdm_param,
            'total_sites': total_regional_sites,
            'total_sites_down': total_sites_down,
            'total_critical': total_critical,
            'total_sdms': len(sdms_list),
            'sdms': sdms_list
        })


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
        cache_key = f"dashboard_stats:{request.get_full_path()}:{getattr(request.user, 'id', 0)}"
        cached = get_cached_response(cache_key, ttl=45)
        if cached is not None:
            return Response(cached)

        user_role = request.query_params.get('user_role', '') or request.query_params.get('role', '')
        rdm = request.query_params.get('rdm', '').strip()
        sdm = request.query_params.get('sdm', '').strip()
        fse = request.query_params.get('fse', '').strip()

        sites_qs = Site.objects.all()
        sites_qs = scope_queryset_by_user(sites_qs, request, site_id_field='ihs_site_id', state_field='state')

        total_sites = sites_qs.count()
        sites_down = sites_qs.filter(Q(is_down=True) | Q(operational_status__icontains='down')).count()
        critical_sites = sites_qs.filter(Q(is_critical=True) | Q(priority__icontains='P1') | Q(priority__icontains='Critical')).count()

        is_superuser = (
            request.query_params.get('is_superuser', '').lower() == 'true' or
            getattr(request.user, 'is_superuser', False)
        )
        is_rdm = user_role in ['MTN RDM', 'Regional Delivery Manager', 'RDM'] or (rdm and rdm != 'All')

        notes_qs = SiteNote.objects.all()
        wa_qs = WhatsAppMessage.objects.all()

        if not is_superuser:
            if is_rdm:
                rdm_target = rdm or (f"{request.user.first_name} {request.user.last_name}".strip() if request.user.is_authenticated else 'Onikola')
                rdm_site_ids = list(sites_qs.values_list('id', flat=True))
                notes_qs = notes_qs.filter(
                    Q(site_id__in=rdm_site_ids) | 
                    Q(site__mtn_rdm_name__icontains=rdm_target) | 
                    Q(created_by__icontains=rdm_target)
                )
                wa_qs = wa_qs.filter(
                    Q(site_id__in=rdm_site_ids) | 
                    Q(site__mtn_rdm_name__icontains=rdm_target)
                )
                if sdm and sdm != 'All':
                    notes_qs = notes_qs.filter(Q(site__sdm_name__icontains=sdm) | Q(created_by__icontains=sdm))
                    wa_qs = wa_qs.filter(site__sdm_name__icontains=sdm)
            elif sdm and sdm != 'All':
                notes_qs = notes_qs.filter(Q(site__sdm_name__icontains=sdm) | Q(created_by__icontains=sdm))
                wa_qs = wa_qs.filter(site__sdm_name__icontains=sdm)
            elif fse and fse != 'All':
                notes_qs = notes_qs.filter(Q(site__smc_fse_name__icontains=fse) | Q(created_by__icontains=fse))
                wa_qs = wa_qs.filter(site__smc_fse_name__icontains=fse)

        generator_faults = notes_qs.filter(category='Generator', status__in=['Open', 'In Progress', 'Escalated']).count()
        transmission_faults = notes_qs.filter(category='Transmission', status__in=['Open', 'In Progress', 'Escalated']).count()
        battery_faults = notes_qs.filter(category='Battery', status__in=['Open', 'In Progress', 'Escalated']).count()
        
        open_incidents = notes_qs.filter(status__in=['Open', 'In Progress', 'Escalated']).count()
        recent_notes_count = notes_qs.count()
        recent_whatsapp_count = wa_qs.count()

        ihs_fiber_qs = IHSFiberLink.objects.all()
        ihs_fiber_links_count = ihs_fiber_qs.count()
        ihs_fiber_total_km = round(ihs_fiber_qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        ihs_clusters_count = ihs_fiber_qs.values('cluster_ref').distinct().count()
        
        huawei_fiber_qs = HuaweiFiberLink.objects.all()
        huawei_fiber_links_count = huawei_fiber_qs.count()
        huawei_fiber_total_km = round(huawei_fiber_qs.aggregate(total=Sum('distance_km'))['total'] or 0.0, 2)
        
        tnl_links_count = TNLLink.objects.count()

        res_data = {
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
        }
        set_cached_response(cache_key, res_data)
        return Response(res_data)


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
        target_name = request.data.get('rdm_name', '') or request.data.get('sdm_name', '') or request.data.get('name', '').strip()
        target_role = request.data.get('role', '') or request.data.get('target_type', 'sdm').strip()
        raw_states = request.data.get('states', None) or request.data.get('state', '')
        site_ids = request.data.get('site_ids', None)
        phone = request.data.get('phone', '') or request.data.get('sdm_phone', '') or request.data.get('rdm_phone', '').strip()

        if not target_name:
            return Response({'error': 'Manager / RDM Name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if target is an RDM
        is_rdm = target_role.lower() in ['rdm', 'mtn rdm', 'regional delivery manager'] or 'rdm' in target_role.lower()
        if not is_rdm:
            # Check user groups / username
            u = User.objects.filter(Q(first_name__iexact=target_name) | Q(username__iexact=target_name.lower().replace(' ', '_'))).first()
            if u and (u.groups.filter(name__icontains='RDM').exists() or u.username.startswith('rdm_') or u.username in ['mtn_rdm', 'rdmadmin']):
                is_rdm = True

        matching_sites = Site.objects.none()
        clean_states = []

        if site_ids:
            if isinstance(site_ids, str):
                s_list = [s.strip().upper() for s in site_ids.split(',') if s.strip()]
            elif isinstance(site_ids, list):
                s_list = [str(s).strip().upper() for s in site_ids if str(s).strip()]
            else:
                s_list = []
            matching_sites = Site.objects.filter(ihs_site_id__in=s_list)

        elif raw_states:
            raw_list = []
            if isinstance(raw_states, list):
                raw_list = raw_states
            elif isinstance(raw_states, str):
                raw_list = [s.strip() for s in raw_states.split(',') if s.strip()]

            for raw in raw_list:
                st = str(raw).split('(')[0].strip().upper()
                if st.startswith('RT') and len(st) > 2:
                    st = st[2:]
                if st and st not in clean_states:
                    clean_states.append(st)

            if clean_states:
                state_q = Q()
                for st in clean_states:
                    state_q |= Q(state__iexact=st) | Q(state__iexact=f"RT{st}") | Q(state__icontains=st)
                matching_sites = Site.objects.filter(state_q)

        total_matching = matching_sites.count()
        if total_matching == 0:
            return Response({'error': 'No matching telecom sites found for the specified states/sites.'}, status=status.HTTP_404_NOT_FOUND)

        # Apply update depending on whether target is RDM or SDM
        if is_rdm:
            update_data = {'mtn_rdm_name': target_name}
            if phone:
                update_data['mtn_rdm_phone'] = phone
            updated_rows = matching_sites.update(**update_data)
            
            sdms_count = matching_sites.exclude(sdm_name='').exclude(sdm_name__isnull=True).values('sdm_name').distinct().count()
            msg = f"Successfully assigned {len(clean_states)} State(s) ({', '.join(clean_states)}) with {updated_rows:,} sites and {sdms_count} supervised SDMs to MTN RDM {target_name}!"
        else:
            update_data = {'sdm_name': target_name}
            if phone:
                update_data['sdm_phone'] = phone
            updated_rows = matching_sites.update(**update_data)
            msg = f"Successfully assigned {len(clean_states) if clean_states else 1} State(s) ({', '.join(clean_states) if clean_states else 'Custom Sites'}) with {updated_rows:,} site(s) to SDM Manager {target_name}!"

        # Sync Django user object if exists
        user_obj = User.objects.filter(Q(first_name__iexact=target_name) | Q(username__iexact=target_name.lower().replace(' ', '_'))).first()
        if user_obj and not user_obj.first_name:
            parts = target_name.split()
            user_obj.first_name = parts[0]
            user_obj.last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
            user_obj.save()

        return Response({
            'message': msg,
            'target_name': target_name,
            'role': 'MTN RDM' if is_rdm else 'State Delivery Manager',
            'states': clean_states,
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
from .models import DailyAvailabilityRecord, DailyAvailabilityUploadLog, HourlyAvailabilityRecord, HourlyAvailabilityUploadLog, PIWeightageRecord
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

    log_cache_key = f"log_dates:{active_log.id if active_log else 0}"
    all_dates = get_cached_response(log_cache_key, ttl=600)
    if all_dates is None:
        sample_rec = None
        if active_log:
            sample_rec = DailyAvailabilityRecord.objects.filter(upload_log=active_log).order_by('upload_log_id').only('daily_scores').first()
        if not sample_rec:
            sample_rec = DailyAvailabilityRecord.objects.order_by('-id').only('daily_scores').first()
        all_dates = sorted(list(sample_rec.daily_scores.keys())) if (sample_rec and sample_rec.daily_scores) else []
        set_cached_response(log_cache_key, all_dates)

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
        clean_st = state.strip().upper()
        if clean_st.startswith('RT') and len(clean_st) > 2:
            clean_st = clean_st[2:]
        if clean_st in ('FC', 'FCT', 'ABUJA'):
            qs = qs.filter(state__in=['FCT', 'RTFCT', 'FC', 'ABUJA', 'Abuja', 'fct'])
        else:
            qs = qs.filter(state__in=[clean_st, 'RT' + clean_st, state.strip(), state.strip().title(), state.strip().lower()])

    tech = request.query_params.get('tech', None)
    if tech and tech != 'All':
        t_clean = tech.strip().upper()
        qs = qs.filter(tech__in=[t_clean, tech.strip(), tech.strip().lower()])

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

    territory = request.query_params.get('territory', None)
    if territory and territory != 'All':
        clean_terr = territory.strip().upper()
        qs = qs.filter(Q(territory__iexact=clean_terr) | Q(territory__icontains=clean_terr))

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
            expanded_tokens = set(clean_tokens)
            for t in clean_tokens:
                expanded_tokens.add('U' + t)
                expanded_tokens.add('L' + t)
                expanded_tokens.add('N' + t)
                expanded_tokens.add('LTE' + t)
                if len(t) >= 5 and (t.startswith('L') or t.startswith('U') or t.startswith('N')):
                    expanded_tokens.add(t[1:])
                elif len(t) >= 6 and t.startswith('LTE'):
                    expanded_tokens.add(t[3:])
            q_conditions = [
                Q(site_id__in=expanded_tokens) | Q(element_name__in=expanded_tokens) |
                Q(site_id__iexact=t) | Q(site_id__icontains=t) | Q(element_name__icontains=t)
                for t in clean_tokens
            ]
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
            expanded_tokens = set(clean_tokens)
            for t in clean_tokens:
                expanded_tokens.add('U' + t)
                expanded_tokens.add('L' + t)
                expanded_tokens.add('N' + t)
                expanded_tokens.add('LTE' + t)
                if len(t) >= 5 and (t.startswith('L') or t.startswith('U') or t.startswith('N')):
                    expanded_tokens.add(t[1:])
                elif len(t) >= 6 and t.startswith('LTE'):
                    expanded_tokens.add(t[3:])
            q_conditions = [
                Q(site_id__in=expanded_tokens) | Q(element_name__in=expanded_tokens) |
                Q(site_id__iexact=t) | Q(site_id__icontains=t) | Q(element_name__icontains=t)
                for t in clean_tokens
            ]
            qs = qs.filter(reduce(operator.or_, q_conditions))
        else:
            qs = qs.filter(
                Q(site_id__icontains=search_str) |
                Q(element_name__icontains=search_str) |
                Q(lga__icontains=search_str) |
                Q(territory__icontains=search_str) |
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
    only_bad = request.query_params.get('only_bad', 'false').lower() in ['true', '1', 'yes'] or \
               request.query_params.get('bad_only', 'false').lower() in ['true', '1', 'yes']
    critical_only = request.query_params.get('critical_only', 'false').lower() in ['true', '1', 'yes']

    if critical_only and not sla_filter:
        sla_filter = 'critical_under_95'
    elif only_bad and not sla_filter:
        sla_filter = 'degraded_under_98_5'

    min_avail = request.query_params.get('min_avail', None)
    max_avail = request.query_params.get('max_avail', None)
    date_mode = request.query_params.get('date_mode', 'all')
    selected_date = request.query_params.get('selected_date', None)

    target_dates, date_label = resolve_target_dates(request)

    if date_mode == 'single_date' and selected_date:
        if sla_filter == 'critical_under_95':
            qs = qs.filter(**{f'daily_scores__{selected_date}__lt': 95.0})
        elif sla_filter in ['degraded_under_98', 'degraded_under_98_5']:
            qs = qs.filter(**{f'daily_scores__{selected_date}__lt': 98.5})
        elif sla_filter in ['warning_95_98', 'warning_95_98_5']:
            qs = qs.filter(**{f'daily_scores__{selected_date}__gte': 95.0, f'daily_scores__{selected_date}__lt': 98.5})
        elif sla_filter in ['high_98_100', 'high_98_5_100']:
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
        if date_mode not in ['week', 'custom']:
            if sla_filter == 'critical_under_95':
                qs = qs.filter(avg_availability__lt=95.0)
            elif sla_filter in ['degraded_under_98', 'degraded_under_98_5']:
                qs = qs.filter(avg_availability__lt=98.5)
            elif sla_filter in ['warning_95_98', 'warning_95_98_5']:
                qs = qs.filter(avg_availability__gte=95.0, avg_availability__lt=98.5)
            elif sla_filter in ['high_98_100', 'high_98_5_100']:
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
    elif sort_by == 'territory':
        qs = qs.order_by('territory', 'site_id')
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
            invalidate_api_cache()
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)


def get_pi_weight_cache():
    now = time.time()
    if _PI_WEIGHT_CACHE['data'] is not None and (now - _PI_WEIGHT_CACHE['ts']) < 600:
        return _PI_WEIGHT_CACHE['data']
    pi_cache = {}
    for p in PIWeightageRecord.objects.values('tech', 'element_id', 'site_id', 'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'):
        pi_cache[(p['tech'], p['element_id'])] = p
        if (p['tech'], p['site_id']) not in pi_cache:
            pi_cache[(p['tech'], p['site_id'])] = p
    _PI_WEIGHT_CACHE['data'] = pi_cache
    _PI_WEIGHT_CACHE['ts'] = now
    return pi_cache


class DailyAvailabilityArchivesView(APIView):
    def get(self, request):
        cache_key = "avail_archives_list"
        cached = get_cached_response(cache_key, ttl=120)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        logs = list(DailyAvailabilityUploadLog.objects.all().order_by('-uploaded_at'))
        archive_list = []
        active_log = None
        for log in logs:
            actual_count = log.records_count or 0
            if actual_count == 0:
                actual_count = log.records.count()
                if actual_count > 0:
                    DailyAvailabilityUploadLog.objects.filter(id=log.id).update(records_count=actual_count)
            if actual_count == 0:
                continue
            if log.is_active and active_log is None:
                active_log = log
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

        if not active_log and logs:
            active_log = logs[0]
        active_month = active_log.month_str if active_log else 'August 2026'

        res_data = {
            'active_month': active_month,
            'active_filename': active_log.filename if active_log else None,
            'active_archive_id': active_log.id if active_log else None,
            'archives': archive_list
        }
        set_cached_response(cache_key, res_data)
        return Response(res_data, status=status.HTTP_200_OK)


class DailyAvailabilityStatsView(APIView):
    def get(self, request):
        cache_key = f"avail_stats:{request.get_full_path()}:{getattr(request.user, 'id', 0)}"
        cached = get_cached_response(cache_key, ttl=180)
        if cached is not None:
            return Response(cached)

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

        # Avoid loading huge daily_scores JSONB across 58,965 rows when viewing full period ('all')
        is_full_period = request.query_params.get('date_mode', 'all') in ('all', '', None)
        need_row_daily_scores = bool(target_dates and not is_full_period)

        value_fields = [
            'id', 'site_id', 'tech', 'element_name', 'state', 'region', 'lga', 'territory', 'tower_co', 'vendor', 'status',
            'avg_availability', 'latest_availability',
            'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'
        ]
        if need_row_daily_scores:
            value_fields.append('daily_scores')

        all_records = list(qs.values(*value_fields))
        total_elements = len(all_records)

        if is_superuser:
            all_states = list(DailyAvailabilityRecord.objects.filter(upload_log=selected_log).order_by().values_list('state', flat=True).distinct()) if selected_log else [r.get('state') for r in all_records]
        else:
            all_states = [r.get('state') for r in all_records]

        unique_states = sorted(list(set([s.strip().upper() for s in all_states if s])))
        unique_territories = sorted(list(set([r['territory'].strip().upper() for r in all_records if r.get('territory')])))
        unique_lgas = sorted(list(set([r['lga'].strip().upper() for r in all_records if r.get('lga')])))[:150]
        unique_tower_cos = sorted(list(set([r['tower_co'].strip().upper() for r in all_records if r.get('tower_co')])))
        unique_vendors = sorted(list(set([r['vendor'].strip().upper() for r in all_records if r.get('vendor')])))
        unique_statuses = sorted(list(set([r['status'].strip().title() for r in all_records if r.get('status')])))

        if is_superuser:
            available_fses = sorted(list(set([f.strip() for f in Site.objects.order_by().values_list('smc_fse_name', flat=True).distinct() if f and f.strip()])))
        else:
            available_fses = sorted(list(set([f.strip() for f in Site.objects.filter(state__in=unique_states).order_by().values_list('smc_fse_name', flat=True).distinct() if f and f.strip()])))

        log_cache_key = f"log_dates:{selected_log.id if selected_log else 0}"
        all_detected_dates = get_cached_response(log_cache_key, ttl=600)
        if all_detected_dates is None:
            sample_rec = None
            if selected_log:
                sample_rec = DailyAvailabilityRecord.objects.filter(upload_log=selected_log).order_by('upload_log_id').only('daily_scores').first()
            if not sample_rec:
                sample_rec = DailyAvailabilityRecord.objects.order_by('-id').only('daily_scores').first()
            all_detected_dates = sorted(list(sample_rec.daily_scores.keys())) if (sample_rec and sample_rec.daily_scores) else []
            set_cached_response(log_cache_key, all_detected_dates)

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
                'available_territories': unique_territories,
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

        pi_cache = get_pi_weight_cache()

        all_period_vals = []
        weighted_sum = 0.0
        total_pi_weight = 0.0

        tech_data = {}
        processed = []
        for r in all_records:
            if need_row_daily_scores:
                scores_dict = r.get('daily_scores') or {}
                if isinstance(scores_dict, dict):
                    scores = [float(scores_dict[d]) for d in target_dates if d in scores_dict and scores_dict[d] is not None]
                    period_val = round(sum(scores) / len(scores), 2) if scores else round(r['avg_availability'] or 100.0, 2)
                    latest_val = round(float(scores_dict[target_dates[-1]]), 2) if (target_dates and target_dates[-1] in scores_dict and scores_dict[target_dates[-1]] is not None) else round(r['latest_availability'] or 100.0, 2)
                    filtered_scores = {d: scores_dict[d] for d in target_dates if d in scores_dict}
                else:
                    period_val = round(r['avg_availability'] or 100.0, 2)
                    latest_val = round(r['latest_availability'] or 100.0, 2)
                    filtered_scores = {}
            else:
                period_val = round(r['avg_availability'] or 100.0, 2)
                latest_val = round(r['latest_availability'] or 100.0, 2)
                filtered_scores = {}

            t = r.get('tech') or '2G'
            elem = (r.get('element_name') or '').strip().upper()
            sid = (r.get('site_id') or '').strip().upper()
            pi_rec = pi_cache.get((t, elem)) or pi_cache.get((t, sid)) or {}

            # Determine appropriate PI weight for this element based on scope
            pi_w = float(r.get('pi_national') or pi_rec.get('pi_national') or 0.0)
            if pi_w <= 0.0:
                pi_w = float(r.get('pi_state') or pi_rec.get('pi_state') or 0.0) or float(r.get('pi_territory') or pi_rec.get('pi_territory') or 0.0) or 0.00005

            r['pi_national'] = float(r.get('pi_national') or pi_rec.get('pi_national') or 0.0)
            r['pi_state'] = float(r.get('pi_state') or pi_rec.get('pi_state') or 0.0)
            r['pi_territory'] = float(r.get('pi_territory') or pi_rec.get('pi_territory') or 0.0)
            r['configured_capacity'] = float(r.get('configured_capacity') or pi_rec.get('configured_capacity') or 0.0)

            r['period_availability'] = period_val
            r['avg_availability'] = round(r['avg_availability'] or 100.0, 2)
            r['latest_availability'] = latest_val
            r['daily_scores'] = filtered_scores
            r['pi_weight'] = pi_w
            processed.append(r)
            all_period_vals.append(period_val)

            weighted_sum += period_val * pi_w
            total_pi_weight += pi_w

            t = r.get('tech') or 'UNKNOWN'
            if t not in tech_data:
                tech_data[t] = {'scores': [], 'weights': [], 'count': 0}
            tech_data[t]['scores'].append(period_val)
            tech_data[t]['weights'].append(pi_w)
            tech_data[t]['count'] += 1

        unweighted_overall_avg = round(sum(all_period_vals) / len(all_period_vals), 2) if all_period_vals else 100.0
        weighted_overall_avg = round(weighted_sum / total_pi_weight, 2) if total_pi_weight > 0 else unweighted_overall_avg
        overall_avg = weighted_overall_avg

        sla_target = 98.5
        sla_compliant_cnt = len([v for v in all_period_vals if v >= sla_target])
        sla_breached_cnt = len([v for v in all_period_vals if v < sla_target])
        critical_breach_cnt = len([v for v in all_period_vals if v < 95.0])

        tech_breakdown = {}
        for t, td in tech_data.items():
            t_w_sum = sum(s * w for s, w in zip(td['scores'], td['weights']))
            t_tot_w = sum(td['weights'])
            t_w_avg = round(t_w_sum / t_tot_w, 2) if t_tot_w > 0 else round(sum(td['scores'])/len(td['scores']), 2)
            tech_breakdown[t] = {
                'avg': t_w_avg,
                'unweighted_avg': round(sum(td['scores']) / len(td['scores']), 2),
                'count': td['count'],
                'total_pi_weight': round(t_tot_w, 6)
            }

        # LGA Breakdown with PI weighting
        lga_dict = {}
        for r in processed:
            lg_name = (r.get('lga') or '').strip().upper()
            if not lg_name:
                continue
            if lg_name not in lga_dict:
                lga_dict[lg_name] = {'scores': [], 'weights': [], 'count': 0, 'min_avail': 100.0}
            pv = r['period_availability']
            pw = r['pi_weight']
            lga_dict[lg_name]['scores'].append(pv)
            lga_dict[lg_name]['weights'].append(pw)
            lga_dict[lg_name]['count'] += 1
            if pv < lga_dict[lg_name]['min_avail']:
                lga_dict[lg_name]['min_avail'] = pv

        lga_breakdown = []
        for l_name, l_data in lga_dict.items():
            scs = l_data['scores']
            wts = l_data['weights']
            l_w_sum = sum(s * w for s, w in zip(scs, wts))
            l_tot_w = sum(wts)
            avg_lga = round(l_w_sum / l_tot_w, 2) if l_tot_w > 0 else (round(sum(scs) / len(scs), 2) if scs else 100.0)
            lga_breakdown.append({
                'lga': l_name,
                'avg': avg_lga,
                'unweighted_avg': round(sum(scs) / len(scs), 2) if scs else 100.0,
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
        if not need_row_daily_scores and worst_sites:
            worst_ids = [w['id'] for w in worst_sites]
            worst_scores_map = dict(
                DailyAvailabilityRecord.objects.filter(id__in=worst_ids).values_list('id', 'daily_scores')
            )
            for w in worst_sites:
                w['daily_scores'] = worst_scores_map.get(w['id']) or {}

        # Daily timeline based on target_dates with PI weighted daily curve
        timeline_dates = target_dates if (target_dates and len(target_dates) <= 31) else (all_detected_dates[-30:] if len(all_detected_dates) >= 30 else all_detected_dates)
        daily_values = {d: [] for d in timeline_dates}
        daily_weights = {d: [] for d in timeline_dates}

        if need_row_daily_scores:
            timeline_sample = processed[:1500]
        else:
            sample_rows = list(qs.values('daily_scores', 'pi_national')[:400])
            timeline_sample = [
                {'daily_scores': sr.get('daily_scores'), 'pi_weight': float(sr.get('pi_national') or 0.00005)}
                for sr in sample_rows
            ]

        for r in timeline_sample:
            scores = r.get('daily_scores')
            pw = r.get('pi_weight', 0.00005) or 0.00005
            if isinstance(scores, dict):
                for d_str in timeline_dates:
                    v = scores.get(d_str)
                    if v is not None:
                        try:
                            fv = float(v)
                            daily_values[d_str].append(fv)
                            daily_weights[d_str].append(pw)
                        except (ValueError, TypeError):
                            pass

        timeline = []
        for d_str in sorted(daily_values.keys()):
            vals = daily_values[d_str]
            wts = daily_weights[d_str]
            if vals:
                vals_sorted = sorted(vals)
                w_sum = sum(v * w for v, w in zip(vals, wts))
                t_w = sum(wts)
                avg_d = round(w_sum / t_w, 2) if t_w > 0 else round(sum(vals) / len(vals), 2)
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

        res_data = {
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
            'is_pi_weighted': True,
            'pi_weightage_source': '31st of August..xlsb (MTN Official Weightage)',
            'overall_avg': overall_avg,
            'unweighted_overall_avg': unweighted_overall_avg,
            'available_states': unique_states,
            'available_territories': unique_territories,
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
        }
        set_cached_response(cache_key, res_data)
        return Response(res_data)


class DailyAvailabilityListView(APIView):
    def get(self, request):
        cache_key = f"avail_list:{request.get_full_path()}:{getattr(request.user, 'id', 0)}"
        cached = get_cached_response(cache_key, ttl=120)
        if cached is not None:
            return Response(cached)

        qs, _, (target_dates, date_label) = get_availability_queryset(request)
        sort_by = request.query_params.get('sort_by', 'worst')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 25))
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size

        pi_cache = get_pi_weight_cache()
        is_full_period = request.query_params.get('date_mode', 'all') in ('all', '', None)

        # Fast SQL-paginated path when using default full-period availability & standard sort
        if is_full_period and sort_by not in ('pi_weight', 'weight', 'pi_worst'):
            total_count = qs.count()
            page_records = list(qs[start_idx:end_idx].values(
                'id', 'site_id', 'tech', 'element_name', 'state', 'region', 'lga', 'territory',
                'tower_co', 'vendor', 'status', 'avg_availability', 'latest_availability', 'daily_scores',
                'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'
            ))
            paged_results = []
            for r in page_records:
                period_val = round(r['avg_availability'] or 100.0, 2)
                latest_val = round(r['latest_availability'] or 100.0, 2)
                t = r.get('tech') or '2G'
                elem = (r.get('element_name') or '').strip().upper()
                sid = (r.get('site_id') or '').strip().upper()
                pi_rec = pi_cache.get((t, elem)) or pi_cache.get((t, sid)) or {}

                r['pi_national'] = float(r.get('pi_national') or pi_rec.get('pi_national') or 0.0)
                r['pi_state'] = float(r.get('pi_state') or pi_rec.get('pi_state') or 0.0)
                r['pi_territory'] = float(r.get('pi_territory') or pi_rec.get('pi_territory') or 0.0)
                r['configured_capacity'] = float(r.get('configured_capacity') or pi_rec.get('configured_capacity') or 0.0)
                r['period_availability'] = period_val
                r['period_label'] = date_label
                r['avg_availability'] = period_val
                r['latest_availability'] = latest_val
                r['daily_scores'] = r.get('daily_scores') or {}
                paged_results.append(r)

            res_data = {
                'count': total_count,
                'next': f"?page={page+1}" if end_idx < total_count else None,
                'previous': f"?page={page-1}" if page > 1 else None,
                'results': paged_results
            }
            set_cached_response(cache_key, res_data)
            return Response(res_data)

        records = list(qs.values(
            'id', 'site_id', 'tech', 'element_name', 'state', 'region', 'lga', 'territory',
            'tower_co', 'vendor', 'status', 'avg_availability', 'latest_availability', 'daily_scores',
            'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'
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

            t = r.get('tech') or '2G'
            elem = (r.get('element_name') or '').strip().upper()
            sid = (r.get('site_id') or '').strip().upper()
            pi_rec = pi_cache.get((t, elem)) or pi_cache.get((t, sid)) or {}

            r['pi_national'] = float(r.get('pi_national') or pi_rec.get('pi_national') or 0.0)
            r['pi_state'] = float(r.get('pi_state') or pi_rec.get('pi_state') or 0.0)
            r['pi_territory'] = float(r.get('pi_territory') or pi_rec.get('pi_territory') or 0.0)
            r['configured_capacity'] = float(r.get('configured_capacity') or pi_rec.get('configured_capacity') or 0.0)

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

        if sort_by == 'best':
            processed.sort(key=lambda x: x['period_availability'], reverse=True)
        elif sort_by == 'pi_weight' or sort_by == 'weight':
            processed.sort(key=lambda x: (float(x.get('pi_national') or 0.0), float(x.get('pi_state') or 0.0)), reverse=True)
        elif sort_by == 'pi_worst':
            # Impact rank = (100 - availability) * pi_weight
            processed.sort(key=lambda x: (100.0 - x['period_availability']) * (float(x.get('pi_national') or 0.00001)), reverse=True)
        elif sort_by == 'site_id':
            processed.sort(key=lambda x: str(x['site_id']))
        elif sort_by == 'state':
            processed.sort(key=lambda x: (str(x['state']), str(x['site_id'])))
        elif sort_by == 'territory':
            processed.sort(key=lambda x: (str(x.get('territory') or ''), str(x['site_id'])))
        elif sort_by == 'lga':
            processed.sort(key=lambda x: (str(x['lga']), str(x['site_id'])))
        else: # worst
            processed.sort(key=lambda x: x['period_availability'])

        total_count = len(processed)
        paged_results = processed[start_idx:end_idx]

        res_data = {
            'count': total_count,
            'next': f"?page={page+1}" if end_idx < total_count else None,
            'previous': f"?page={page-1}" if page > 1 else None,
            'results': paged_results
        }
        set_cached_response(cache_key, res_data)
        return Response(res_data)


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
            invalidate_api_cache()
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)


class DailyAvailabilityExportView(APIView):
    def get(self, request):
        import datetime
        import re
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from django.http import HttpResponse

        only_bad = request.query_params.get('only_bad', 'false').lower() in ['true', '1', 'yes'] or \
                   request.query_params.get('bad_only', 'false').lower() in ['true', '1', 'yes']
        critical_only = request.query_params.get('critical_only', 'false').lower() in ['true', '1', 'yes']
        sla_filter = request.query_params.get('sla_filter', None)
        limit_param = request.query_params.get('limit', None)
        try:
            limit = int(limit_param) if limit_param else None
        except (ValueError, TypeError):
            limit = None

        if critical_only:
            only_bad = True
        if sla_filter in ['critical_under_95', 'degraded_under_98', 'degraded_under_98_5']:
            only_bad = True

        qs, is_superuser, (target_dates, date_label) = get_availability_queryset(request)
        raw_records = list(qs)

        # Build site FSE lookup map for fast operational dispatch
        site_lookup = {
            s['ihs_site_id'].strip().upper(): s
            for s in Site.objects.values('ihs_site_id', 'smc_fse_name', 'smc_fse_phone', 'cluster_name')
            if s['ihs_site_id']
        }

        # Build PI weight lookup map
        pi_cache = {}
        for p in PIWeightageRecord.objects.values('tech', 'element_id', 'site_id', 'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'):
            pi_cache[(p['tech'], p['element_id'])] = p
            if (p['tech'], p['site_id']) not in pi_cache:
                pi_cache[(p['tech'], p['site_id'])] = p

        processed = []
        for r in raw_records:
            scores_dict = r.daily_scores if isinstance(r.daily_scores, dict) else {}
            scores = []
            day_score_map = {}
            if target_dates:
                for d in target_dates:
                    v = scores_dict.get(d)
                    if v is not None:
                        try:
                            fv = float(v)
                            scores.append(fv)
                            day_score_map[d] = fv
                        except (ValueError, TypeError):
                            day_score_map[d] = None
                    else:
                        day_score_map[d] = None
                period_val = round(sum(scores) / len(scores), 2) if scores else round(r.avg_availability or 100.0, 2)
                latest_val = round(scores[-1], 2) if scores else round(r.latest_availability or 100.0, 2)
            else:
                period_val = round(r.avg_availability or 100.0, 2)
                latest_val = round(r.latest_availability or 100.0, 2)

            # Worst day calculation
            worst_day_str = "N/A"
            if scores and target_dates:
                valid_days = [(d, day_score_map[d]) for d in target_dates if day_score_map.get(d) is not None]
                if valid_days:
                    min_d, min_s = min(valid_days, key=lambda x: x[1])
                    worst_day_str = f"{min_d} ({min_s}%)"

            outage_days_cnt = sum(1 for s in scores if s < 98.5)
            critical_days_cnt = sum(1 for s in scores if s < 95.0)

            t = r.tech or '2G'
            elem = (r.element_name or '').strip().upper()
            sid = (r.site_id or '').strip().upper()
            pi_rec = pi_cache.get((t, elem)) or pi_cache.get((t, sid)) or {}
            pi_w = float(r.pi_national or pi_rec.get('pi_national') or 0.0)
            if pi_w <= 0.0:
                pi_w = float(r.pi_state or pi_rec.get('pi_state') or 0.0) or float(r.pi_territory or pi_rec.get('pi_territory') or 0.0) or 0.00005

            site_info = site_lookup.get(sid, {})
            fse_name = site_info.get('smc_fse_name') or ''
            fse_phone = site_info.get('smc_fse_phone') or ''
            cluster = site_info.get('cluster_name') or ''

            is_crit = period_val < 95.0
            is_deg = period_val < 98.5
            sla_status = "🔴 CRITICAL OUTAGE" if is_crit else ("⚠️ DEGRADED" if is_deg else "🟢 COMPLIANT")

            processed.append({
                'record': r,
                'site_id': r.site_id,
                'tech': r.tech,
                'element_name': r.element_name or '',
                'state': r.state,
                'territory': r.territory or '',
                'lga': r.lga,
                'cluster': cluster,
                'fse_name': fse_name,
                'fse_phone': fse_phone,
                'tower_co': r.tower_co,
                'vendor': r.vendor,
                'status': r.status,
                'period_availability': period_val,
                'avg_availability': round(r.avg_availability or 100.0, 2),
                'latest_availability': latest_val,
                'worst_day': worst_day_str,
                'outage_days': outage_days_cnt,
                'critical_days': critical_days_cnt,
                'sla_status': sla_status,
                'is_critical': is_crit,
                'is_degraded': is_deg,
                'pi_weight': pi_w,
                'day_score_map': day_score_map
            })

        # Calculate summary metrics across all processed in scope
        total_scope_count = len(processed)
        all_period_vals = [p['period_availability'] for p in processed]
        overall_scope_avg = round(sum(all_period_vals) / len(all_period_vals), 2) if all_period_vals else 100.0
        all_degraded = [p for p in processed if p['is_degraded']]
        all_critical = [p for p in processed if p['is_critical']]
        all_warning = [p for p in processed if p['is_degraded'] and not p['is_critical']]
        all_compliant = [p for p in processed if not p['is_degraded']]

        # Filter active records for primary export
        if critical_only or sla_filter == 'critical_under_95':
            export_records = all_critical
        elif only_bad or sla_filter in ['degraded_under_98', 'degraded_under_98_5']:
            export_records = all_degraded
        else:
            export_records = processed

        # Sort order
        sort_by = request.query_params.get('sort_by', 'worst' if only_bad else 'site_id')
        if sort_by == 'best':
            export_records.sort(key=lambda x: x['period_availability'], reverse=True)
        elif sort_by == 'pi_worst':
            export_records.sort(key=lambda x: (100.0 - x['period_availability']) * x['pi_weight'], reverse=True)
        elif sort_by == 'site_id':
            export_records.sort(key=lambda x: str(x['site_id']))
        elif sort_by == 'state':
            export_records.sort(key=lambda x: (str(x['state']), str(x['site_id'])))
        elif sort_by == 'lga':
            export_records.sort(key=lambda x: (str(x['lga']), str(x['site_id'])))
        else:  # worst
            export_records.sort(key=lambda x: x['period_availability'])

        if limit and limit > 0:
            export_records = export_records[:limit]

        # Always sort degraded list by worst availability first
        all_degraded_sorted = sorted(all_degraded, key=lambda x: x['period_availability'])

        wb = Workbook()
        ws_summary = wb.active
        ws_summary.title = "Executive Summary"

        # Fonts & Styles
        title_font = Font(name='Segoe UI', size=14, bold=True, color='FFFFFF')
        header_font = Font(name='Segoe UI', size=10, bold=True, color='FFFFFF')
        bold_font = Font(name='Segoe UI', size=10, bold=True, color='0F172A')
        normal_font = Font(name='Segoe UI', size=10, color='334155')
        mono_font = Font(name='Consolas', size=10, bold=True, color='0369A1')

        title_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')
        header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        subheader_fill = PatternFill(start_color='334155', end_color='334155', fill_type='solid')

        # Status fills & fonts
        crit_fill = PatternFill(start_color='FEE2E2', end_color='FEE2E2', fill_type='solid')
        crit_font = Font(name='Segoe UI', size=10, bold=True, color='991B1B')

        deg_fill = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')
        deg_font = Font(name='Segoe UI', size=10, bold=True, color='92400E')

        comp_fill = PatternFill(start_color='DCFCE7', end_color='DCFCE7', fill_type='solid')
        comp_font = Font(name='Segoe UI', size=10, bold=True, color='166534')

        na_fill = PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')
        na_font = Font(name='Segoe UI', size=10, color='94A3B8')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        # -------------------------------------------------------------
        # 1. EXECUTIVE SUMMARY SHEET
        # -------------------------------------------------------------
        ws_summary.merge_cells('A1:F2')
        top_cell = ws_summary['A1']
        if critical_only:
            top_cell.value = "DAILY AVAILABILITY EXCEPTION REPORT: CRITICAL OUTAGE SITES (<95%)"
        elif only_bad:
            top_cell.value = "DAILY AVAILABILITY EXCEPTION REPORT: BAD & DEGRADED SITES (<98.5%)"
        else:
            top_cell.value = "DAILY NETWORK AVAILABILITY COMMAND CENTER EXECUTIVE REPORT"
        top_cell.font = title_font
        top_cell.fill = title_fill
        top_cell.alignment = Alignment(horizontal='center', vertical='center')

        ws_summary.append([])
        ws_summary.append(["KPI METRIC", "VALUE", "CLASSIFICATION / CONTEXT"])
        summary_row = ws_summary.max_row
        for col in ['A', 'B', 'C']:
            c = ws_summary[f'{col}{summary_row}']
            c.font = header_font
            c.fill = header_fill

        bad_vals = [p['period_availability'] for p in all_degraded]
        avg_bad_avail = round(sum(bad_vals) / len(bad_vals), 2) if bad_vals else 100.0

        # Find most impacted LGA
        lga_counts = {}
        for p in all_degraded:
            l = (p.get('lga') or 'Unknown').strip().upper()
            lga_counts[l] = lga_counts.get(l, 0) + 1
        most_impacted_lga = max(lga_counts.items(), key=lambda x: x[1])[0] if lga_counts else 'None'
        lga_impact_cnt = lga_counts.get(most_impacted_lga, 0)

        # Worst site
        worst_site = all_degraded_sorted[0] if all_degraded_sorted else None
        worst_str = f"{worst_site['site_id']} ({worst_site['tech']}) - {worst_site['period_availability']}% [{worst_site['lga']}]" if worst_site else 'None'

        kpis = [
            ("Report Period / Scope", date_label, "Monitored time window"),
            ("Export Filter Scope", "Bad / Degraded Sites Only (< 98.5%)" if only_bad else "Full Network Portfolio", "Selected export mode"),
            ("Total Monitored Elements", total_scope_count, "All elements meeting geographic/operational filter"),
            ("Degraded Elements Breaching SLA (< 98.5%)", len(all_degraded), f"{round(len(all_degraded)/total_scope_count*100, 1) if total_scope_count else 0}% of scope requiring engineering intervention"),
            ("Critical Outage Elements (< 95.0%)", len(all_critical), f"{round(len(all_critical)/total_scope_count*100, 1) if total_scope_count else 0}% severe priority outages"),
            ("Warning Degraded Elements (95.0% - 98.49%)", len(all_warning), "Sub-optimal elements approaching outage"),
            ("SLA Compliant Elements (>= 98.5%)", len(all_compliant), f"{round(len(all_compliant)/total_scope_count*100, 1) if total_scope_count else 100}% meeting contractual target"),
            ("Average Availability of Degraded Elements", f"{avg_bad_avail}%", "Mean availability of affected elements"),
            ("Overall Average Availability (All Scope)", f"{overall_scope_avg}%", "MTN Network Health Benchmark"),
            ("Most Impacted LGA", f"{most_impacted_lga} ({lga_impact_cnt} degraded elements)", "Geographic priority hotspot"),
            ("Worst Impacted Site", worst_str, "Lowest availability recorded in period"),
            ("Report Generated At", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "Timestamp of export generation")
        ]

        for label, val, desc in kpis:
            ws_summary.append([label, val, desc])
            r_idx = ws_summary.max_row
            ws_summary[f'A{r_idx}'].font = bold_font
            ws_summary[f'B{r_idx}'].font = Font(name='Segoe UI', size=10, bold=True, color='0F172A')
            ws_summary[f'C{r_idx}'].font = normal_font
            for c_idx in range(1, 4):
                ws_summary.cell(row=r_idx, column=c_idx).border = thin_border

        # Helper function to populate matrix sheets
        def populate_matrix_sheet(ws, items, sheet_title_text):
            # Display target dates (up to 31 dates)
            use_dates = target_dates[:31] if target_dates else []

            base_headers = [
                "RANK", "SITE ID", "TECH", "STATE", "TERRITORY", "LGA", "CLUSTER",
                "SMC FSE", "FSE PHONE", "TOWER CO", "VENDOR", "STATUS",
                "PERIOD AVAIL %", "MONTH AVG %", "LATEST DAY %", "WORST DAY",
                "OUTAGE DAYS", "SLA STATUS"
            ]
            full_headers = base_headers + [f"DAY {d}" for d in use_dates]
            ws.append(full_headers)

            # Style header row
            for col_num in range(1, len(full_headers) + 1):
                c = ws.cell(row=1, column=col_num)
                c.font = header_font
                c.fill = header_fill
                c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

            ws.row_dimensions[1].height = 26

            for idx, item in enumerate(items, 1):
                pval = item['period_availability']
                mval = item['avg_availability']
                lval = item['latest_availability']

                row_data = [
                    idx,
                    item['site_id'],
                    item['tech'],
                    item['state'],
                    item['territory'] or '',
                    item['lga'],
                    item['cluster'] or '',
                    item['fse_name'] or 'Unassigned',
                    item['fse_phone'] or '',
                    item['tower_co'] or '',
                    item['vendor'] or '',
                    item['status'] or '',
                    f"{pval}%",
                    f"{mval}%",
                    f"{lval}%",
                    item['worst_day'],
                    item['outage_days'],
                    item['sla_status']
                ]

                # Append daily score values
                for d in use_dates:
                    score = item['day_score_map'].get(d)
                    row_data.append(f"{score}%" if score is not None else "N/A")

                ws.append(row_data)
                curr_row = ws.max_row

                # Fonts & cell styling
                ws[f'A{curr_row}'].font = bold_font
                ws[f'A{curr_row}'].alignment = Alignment(horizontal='center')
                ws[f'B{curr_row}'].font = mono_font

                # Period Avail cell color
                p_cell = ws[f'M{curr_row}']
                p_cell.font = Font(name='Segoe UI', size=10, bold=True)
                p_cell.alignment = Alignment(horizontal='center')
                if pval < 95.0:
                    p_cell.fill = crit_fill
                    p_cell.font = crit_font
                elif pval < 98.5:
                    p_cell.fill = deg_fill
                    p_cell.font = deg_font
                else:
                    p_cell.fill = comp_fill
                    p_cell.font = comp_font

                # SLA status cell color
                status_cell = ws[f'R{curr_row}']
                status_cell.alignment = Alignment(horizontal='center')
                if item['is_critical']:
                    status_cell.fill = crit_fill
                    status_cell.font = crit_font
                elif item['is_degraded']:
                    status_cell.fill = deg_fill
                    status_cell.font = deg_font
                else:
                    status_cell.fill = comp_fill
                    status_cell.font = comp_font

                # Color daily score cells
                for d_idx, d in enumerate(use_dates):
                    c_num = len(base_headers) + 1 + d_idx
                    day_c = ws.cell(row=curr_row, column=c_num)
                    day_c.alignment = Alignment(horizontal='center')
                    score = item['day_score_map'].get(d)
                    if score is not None:
                        if score < 95.0:
                            day_c.fill = crit_fill
                            day_c.font = crit_font
                        elif score < 98.5:
                            day_c.fill = deg_fill
                            day_c.font = deg_font
                        else:
                            day_c.fill = comp_fill
                            day_c.font = comp_font
                    else:
                        day_c.fill = na_fill
                        day_c.font = na_font

                for c_num in range(1, len(full_headers) + 1):
                    ws.cell(row=curr_row, column=c_num).border = thin_border

            # Freeze headers & enable auto-filter
            ws.freeze_panes = 'A2'
            if len(items) > 0:
                last_col_letter = get_column_letter(len(full_headers))
                ws.auto_filter.ref = f"A1:{last_col_letter}{len(items) + 1}"

            # Auto column widths
            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col[:150])
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 11)

        # -------------------------------------------------------------
        # 2. MATRIX SHEET(S)
        # -------------------------------------------------------------
        if only_bad:
            # Dedicated Bad Sites report
            matrix_title = "Critical Outages (<95%)" if critical_only else "Degraded Sites (<98.5%)"
            ws_matrix = wb.create_sheet(title=matrix_title)
            populate_matrix_sheet(ws_matrix, export_records, matrix_title)

            # Sheet 3: LGA & Vendor Outage Breakdown
            ws_breakdown = wb.create_sheet(title="LGA & Vendor Breakdown")
            ws_breakdown.append(["LGA", "DEGRADED SITES COUNT", "CRITICAL COUNT (<95%)", "LOWEST AVAILABILITY SITE", "LOWEST AVAIL %"])
            for col in ['A', 'B', 'C', 'D', 'E']:
                ws_breakdown[f'{col}1'].font = header_font
                ws_breakdown[f'{col}1'].fill = header_fill
                ws_breakdown[f'{col}1'].alignment = Alignment(horizontal='center')

            lga_stats = {}
            for p in export_records:
                lg = (p.get('lga') or 'Unknown').strip().upper()
                if lg not in lga_stats:
                    lga_stats[lg] = {'count': 0, 'critical': 0, 'worst_site': p['site_id'], 'min_avail': p['period_availability']}
                lga_stats[lg]['count'] += 1
                if p['is_critical']:
                    lga_stats[lg]['critical'] += 1
                if p['period_availability'] < lga_stats[lg]['min_avail']:
                    lga_stats[lg]['min_avail'] = p['period_availability']
                    lga_stats[lg]['worst_site'] = p['site_id']

            for lg_name, l_data in sorted(lga_stats.items(), key=lambda x: x[1]['count'], reverse=True):
                ws_breakdown.append([
                    lg_name,
                    l_data['count'],
                    l_data['critical'],
                    l_data['worst_site'],
                    f"{l_data['min_avail']}%"
                ])
                r_idx = ws_breakdown.max_row
                ws_breakdown[f'A{r_idx}'].font = bold_font
                for col_idx in range(1, 6):
                    ws_breakdown.cell(row=r_idx, column=col_idx).border = thin_border

            ws_breakdown.freeze_panes = 'A2'
            for col in ws_breakdown.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws_breakdown.column_dimensions[col_letter].width = max(max_len + 3, 14)

        else:
            # Full Report: Include Degraded Sites tab (sorted worst first) AND All Elements tab!
            ws_bad = wb.create_sheet(title="Degraded Sites (<98.5%)")
            populate_matrix_sheet(ws_bad, all_degraded_sorted, "Degraded Sites (<98.5%)")

            ws_all = wb.create_sheet(title="All Elements Matrix")
            populate_matrix_sheet(ws_all, export_records, "All Elements Matrix")

        # Column widths for Summary sheet
        for col in ws_summary.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_summary.column_dimensions[col_letter].width = max(max_len + 4, 18)

        # Output filename
        clean_period = re.sub(r'[^a-zA-Z0-9_\-]', '_', date_label or 'Period')
        if critical_only:
            filename = f"Critical_Outage_Sites_{clean_period}_{datetime.date.today()}.xlsx"
        elif only_bad:
            filename = f"Bad_Degraded_Sites_{clean_period}_{datetime.date.today()}.xlsx"
        else:
            filename = f"Daily_Network_Availability_Report_{clean_period}_{datetime.date.today()}.xlsx"

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
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


_wsd_cache = None

def get_wsd_cache():
    import os
    from django.conf import settings
    global _wsd_cache
    if _wsd_cache is not None:
        return _wsd_cache

    candidates = [
        '/home/mrchrys/SDM/working site distribution/Huawei/WSD October  2026 v1.0.xlsx',
        '/app/data/WSD October  2026 v1.0.xlsx',
        os.path.join(settings.BASE_DIR, 'data', 'WSD October  2026 v1.0.xlsx'),
        '/home/mrchrys/SDM/working site distribution/Huawei/WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb',
        '/app/data/WSD July 2026 V5.1.xlsb',
        os.path.join(settings.BASE_DIR, 'data', 'WSD July 2026 V5.1.xlsb'),
    ]
    path = None
    for c in candidates:
        if os.path.exists(c):
            path = c
            break

    wsd_map = {}
    if path and os.path.exists(path):
        try:
            import pyxlsb
            with pyxlsb.open_workbook(path) as wb:
                sheet_name = 'WSD' if 'WSD' in wb.sheets else wb.sheets[0]
                with wb.get_sheet(sheet_name) as sheet:
                    col_map = {}
                    for idx, row in enumerate(sheet.rows()):
                        if idx == 0:
                            col_map = {str(c.v).strip(): i for i, c in enumerate(row) if c.v is not None}
                            continue
                        vals = [c.v for c in row]

                        def get_v(name, fallback=None):
                            if name in col_map:
                                idx_c = col_map[name]
                                return vals[idx_c] if idx_c < len(vals) else None
                            return fallback

                        site_id = str(get_v('SiteID', '') or '').strip().upper()
                        if not site_id or site_id == 'NAN':
                            continue

                        fse_phone = str(get_v('FSE CONTACT NO.', '') or '').replace('.0', '').strip()
                        if fse_phone and not fse_phone.startswith('0') and not fse_phone.startswith('+') and len(fse_phone) == 10:
                            fse_phone = '0' + fse_phone

                        sdm_phone = str(get_v('SDM CONTACT NO.', get_v('SDM CONTACT NO. ', '')) or '').replace('.0', '').strip()
                        if sdm_phone and not sdm_phone.startswith('0') and not sdm_phone.startswith('+') and len(sdm_phone) == 10:
                            sdm_phone = '0' + sdm_phone

                        downstream_val = get_v('Count of Direct site dependecies', 0)
                        try:
                            downstream_cnt = int(downstream_val or 0)
                        except (ValueError, TypeError):
                            downstream_cnt = 0

                        wsd_map[site_id] = {
                            'site_id': site_id,
                            'site_name': str(get_v('Site Name', '') or '').strip(),
                            'state': str(get_v('STATE', '') or '').strip().upper(),
                            'lga': str(get_v('LGA', '') or '').strip(),
                            'cluster': str(get_v('Site Cluster', '') or '').strip(),
                            'tower_co': str(get_v('Tower Co', '') or '').strip(),
                            'vendor': str(get_v('OEM', '') or '').strip(),
                            'fse_name': str(get_v('FSE NAME', '') or '').strip(),
                            'fse_phone': fse_phone,
                            'sdm_name': str(get_v('SDM NAME', '') or '').strip(),
                            'sdm_phone': sdm_phone,
                            'classification': str(get_v('Site Classifications (Hub/Terminal)', '') or '').strip(),
                            'downstream_count': downstream_cnt,
                            'vvip': str(get_v('VVIP', '') or '').strip()
                        }
        except Exception as e:
            print(f"Error loading WSD cache from {path}:", e)

    _wsd_cache = wsd_map
    return _wsd_cache

get_wsd_april_2026_cache = get_wsd_cache



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
            invalidate_api_cache()
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


# -------------------------------------------------------------
# 📡 4G LTE KML/KMZ CELL SECTORS & COVERAGE VIEWS
# -------------------------------------------------------------

DEFAULT_KML_BASE_PATH = '/app/data/kml/ABJ WK31 PRB.kmz'

class SiteCellSectorsView(APIView):
    """
    Returns all 4G LTE cell sectors for a given Site ID
    Includes antenna azimuths, PCIs, TACs, Cell IDs, layers, PRB metrics, and polygon coverage coordinates.
    """
    def get(self, request, site_id):
        clean_id = site_id.strip()
        sectors = CellSector.objects.filter(
            Q(site_id__iexact=clean_id) |
            Q(site_ref__ihs_site_id__iexact=clean_id) |
            Q(site_ref__mtn_id__iexact=clean_id)
        ).order_by('cell_name')

        serializer = CellSectorSerializer(sectors, many=True)
        return Response({
            'site_id': clean_id,
            'total_sectors': sectors.count(),
            'sectors': serializer.data
        }, status=status.HTTP_200_OK)


class CellSectorListView(APIView):
    """
    Query cell sectors across the network by Site ID, Layer, State, PCI, TAC, Cell Name, Search Query, or Map Bounding Box.
    """
    def get(self, request):
        qs = CellSector.objects.all()

        site_ids = request.query_params.get('site_ids')
        if site_ids:
            s_list = [x.strip().upper() for x in site_ids.split(',') if x.strip()]
            if s_list:
                qs = qs.filter(site_id__in=s_list)

        site_id = request.query_params.get('site_id')
        if site_id:
            qs = qs.filter(site_id__icontains=site_id.strip())

        layer = request.query_params.get('layer')
        if layer and layer.upper() != 'ALL':
            qs = qs.filter(layer__iexact=layer.strip())

        state_param = request.query_params.get('state')
        if state_param and state_param.upper() != 'ALL':
            qs = qs.filter(state__iexact=state_param.strip())

        pci = request.query_params.get('pci')
        if pci:
            try:
                qs = qs.filter(pci=int(pci.strip()))
            except ValueError:
                pass

        tac = request.query_params.get('tac')
        if tac:
            try:
                qs = qs.filter(tac=int(tac.strip()))
            except ValueError:
                pass

        cell_name = request.query_params.get('cell_name')
        if cell_name:
            qs = qs.filter(cell_name__icontains=cell_name.strip())

        search = request.query_params.get('search')
        if search:
            s = search.strip()
            try:
                num_s = int(s)
                qs = qs.filter(
                    Q(site_id__icontains=s) |
                    Q(cell_name__icontains=s) |
                    Q(layer__icontains=s) |
                    Q(pci=num_s) |
                    Q(tac=num_s) |
                    Q(cell_id=num_s)
                )
            except ValueError:
                qs = qs.filter(
                    Q(site_id__icontains=s) |
                    Q(cell_name__icontains=s) |
                    Q(layer__icontains=s)
                )

        # Bounding box filter for map viewport optimization: bbox=min_lat,min_lng,max_lat,max_lng
        bbox = request.query_params.get('bbox')
        if bbox:
            try:
                parts = [float(x.strip()) for x in bbox.split(',')]
                if len(parts) == 4:
                    min_lat, min_lng, max_lat, max_lng = parts
                    qs = qs.filter(
                        latitude__gte=min_lat,
                        latitude__lte=max_lat,
                        longitude__gte=min_lng,
                        longitude__lte=max_lng
                    )
            except Exception:
                pass

        limit_param = request.query_params.get('limit', '500')
        try:
            limit = min(int(limit_param), 2500)
        except ValueError:
            limit = 500

        total_count = qs.count()
        sectors = qs[:limit]
        serializer = CellSectorSerializer(sectors, many=True)

        return Response({
            'count': total_count,
            'limit': limit,
            'results': serializer.data
        }, status=status.HTTP_200_OK)


class KmlStatsView(APIView):
    """
    Returns high-level statistics and metadata about the imported 4G LTE KML/KMZ coverage dataset.
    """
    def get(self, request):
        from django.db.models import Avg
        total_sectors = CellSector.objects.count()
        unique_sites = CellSector.objects.values('site_id').distinct().count()
        matched_sites = CellSector.objects.filter(site_ref__isnull=False).values('site_id').distinct().count()
        unique_pcis = CellSector.objects.exclude(pci__isnull=True).values('pci').distinct().count()
        unique_tacs = CellSector.objects.exclude(tac__isnull=True).values('tac').distinct().count()

        top_pcis = list(CellSector.objects.exclude(pci__isnull=True).values('pci').annotate(count=Count('id')).order_by('-count')[:10])
        top_tacs = list(CellSector.objects.exclude(tac__isnull=True).values('tac').annotate(count=Count('id')).order_by('-count')[:10])
        layers = list(CellSector.objects.exclude(layer__isnull=True).exclude(layer='').values('layer').annotate(count=Count('id')).order_by('-count'))
        states = list(CellSector.objects.exclude(state__isnull=True).exclude(state='').values('state').annotate(count=Count('id')).order_by('-count'))
        avg_prb_val = CellSector.objects.exclude(prb_utilization__isnull=True).aggregate(avg=Avg('prb_utilization'))['avg']

        first_sector = CellSector.objects.first()
        dataset_name = first_sector.source_kml if first_sector else 'ABJ WK31 PRB.kmz'

        return Response({
            'dataset_name': dataset_name,
            'tech': '4G LTE',
            'region': 'Abuja Region (FCT, Niger, Nasarawa, Kogi, Plateau, Kaduna, Benue, Bauchi, Taraba)',
            'total_sectors': total_sectors,
            'unique_sites': unique_sites,
            'matched_sites_in_db': matched_sites,
            'unique_pcis': unique_pcis,
            'unique_tacs': unique_tacs,
            'layers': layers,
            'states': states,
            'avg_prb_utilization': round(avg_prb_val, 2) if avg_prb_val else None,
            'top_pcis': top_pcis,
            'top_tacs': top_tacs,
            'is_integrated': total_sectors > 0
        }, status=status.HTTP_200_OK)


class KmlImportView(APIView):
    """
    API endpoint to trigger KML/KMZ re-ingestion or upload a new file.
    """
    def post(self, request):
        kml_file = request.FILES.get('file')
        region = request.data.get('region', 'Abuja Region')

        if kml_file:
            save_dir = '/app/data/kml' if os.path.exists('/app/data/kml') else '/home/mrchrys/projects/SDM_Dashboard/backend/data/kml'
            os.makedirs(save_dir, exist_ok=True)
            save_path = os.path.join(save_dir, kml_file.name)
            with open(save_path, 'wb+') as dest:
                for chunk in kml_file.chunks():
                    dest.write(chunk)
            kml_path = save_path
        else:
            candidates = [
                DEFAULT_KML_BASE_PATH,
                '/home/mrchrys/projects/SDM_Dashboard/backend/data/kml/ABJ WK31 PRB.kmz',
                '/home/mrchrys/Downloads/WhatSie/ABJ WK31 PRB.kmz',
                '/app/data/kml/ABUJA REGION KML 07292026 (4G).kml',
                '/home/mrchrys/projects/SDM_Dashboard/backend/data/kml/ABUJA REGION KML 07292026 (4G).kml'
            ]
            kml_path = None
            for cand in candidates:
                if os.path.exists(cand):
                    kml_path = cand
                    break

        if not kml_path or not os.path.exists(kml_path):
            return Response({'error': f'KML/KMZ file not found at {DEFAULT_KML_BASE_PATH}'}, status=status.HTTP_404_NOT_FOUND)

        res = parse_and_import_kml(kml_path, region_name=region)
        return Response(res, status=status.HTTP_200_OK)


class WSDStatusView(APIView):
    def get(self, request):
        from .models import WSDUploadLog
        from .wsd_importer import get_base_wsd_path
        latest_log = WSDUploadLog.objects.filter(is_active=True).first() or WSDUploadLog.objects.last()
        base_path = get_base_wsd_path()
        filename = latest_log.filename if latest_log else os.path.basename(base_path)
        
        down_count = Site.objects.filter(is_down=True).count()
        critical_count = Site.objects.filter(is_critical=True).count()
        states_count = Site.objects.exclude(state__isnull=True).exclude(state='').values('state').distinct().count()
        site_count = Site.objects.count()

        return Response({
            'active_filename': filename,
            'is_base': latest_log.is_base if latest_log else True,
            'uploaded_by': latest_log.uploaded_by if latest_log else 'System Base Seeder',
            'uploaded_at': latest_log.uploaded_at.isoformat() if latest_log else None,
            'site_count': site_count,
            'down_count': down_count,
            'critical_count': critical_count,
            'states_count': states_count
        }, status=status.HTTP_200_OK)


class WSDUploadView(APIView):
    def post(self, request):
        from .wsd_importer import process_wsd_file
        f = request.FILES.get('file')
        if not f:
            return Response({'error': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)
        uploaded_by = request.data.get('uploaded_by', request.user.get_full_name() or request.user.username or 'SDM Operations')
        result = process_wsd_file(f, filename=f.name, uploaded_by=uploaded_by, is_base=False)
        if result.get('success'):
            global _wsd_cache
            _wsd_cache = None
            return Response(result, status=status.HTTP_200_OK)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)


class WSDResetBaseView(APIView):
    def post(self, request):
        from .wsd_importer import process_wsd_file, get_base_wsd_path
        base_path = get_base_wsd_path()
        uploaded_by = request.data.get('uploaded_by', 'System Administrator')
        result = process_wsd_file(base_path, filename=os.path.basename(base_path), uploaded_by=uploaded_by, is_base=True)
        if result.get('success'):
            global _wsd_cache
            _wsd_cache = None
            return Response(result, status=status.HTTP_200_OK)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)


