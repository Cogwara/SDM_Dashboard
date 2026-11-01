import os
import zipfile
import xml.etree.ElementTree as ET
import logging
from django.db import transaction
from django.db.models import Q
from .models import Site, CellSector

logger = logging.getLogger(__name__)

def parse_and_import_kml(kml_or_kmz_path, region_name='Abuja Region', source_kml_name=None, replace_existing=True):
    """
    Parses a 4G/5G Telecom KML or KMZ file (such as 'ABJ WK31 PRB.kmz' or 'ABUJA REGION KML 07292026 (4G).kml')
    and populates CellSector records, links Site foreign keys, and enriches Site coordinates.
    """
    if not os.path.exists(kml_or_kmz_path):
        raise FileNotFoundError(f"File not found at: {kml_or_kmz_path}")

    filename = source_kml_name or os.path.basename(kml_or_kmz_path)
    logger.info(f"Starting KML/KMZ ingestion for file: {filename}")

    # Build Site lookup map for fast foreign key resolution
    all_sites = Site.objects.all()
    sites_by_ihs = {s.ihs_site_id.strip().upper(): s for s in all_sites if s.ihs_site_id}
    sites_by_mtn = {s.mtn_id.strip().upper(): s for s in all_sites if s.mtn_id}

    site_points = {}
    sectors_batch = []
    sites_to_update_coords = []
    updated_sites_set = set()
    new_sites_dict = {}

    total_sectors_parsed = 0
    total_sites_parsed = 0

    is_kmz = filename.lower().endswith('.kmz') or zipfile.is_zipfile(kml_or_kmz_path)

    def _process_stream(xml_file_stream):
        nonlocal total_sites_parsed, total_sectors_parsed
        for event, elem in ET.iterparse(xml_file_stream, events=('end',)):
            tag = elem.tag.split('}')[-1]

            if tag == 'Placemark':
                name = ''
                desc = ''
                pt_coords_str = ''
                poly_coords_str = ''

                for child in elem:
                    child_tag = child.tag.split('}')[-1]
                    if child_tag == 'name':
                        name = (child.text or '').strip()
                    elif child_tag == 'description':
                        desc = child.text or ''
                    elif child_tag == 'Point':
                        for sc in child.iter():
                            if sc.tag.split('}')[-1] == 'coordinates' and sc.text:
                                pt_coords_str = sc.text.strip()
                                break
                    elif child_tag == 'Polygon':
                        for sc in child.iter():
                            if sc.tag.split('}')[-1] == 'coordinates' and sc.text:
                                poly_coords_str = sc.text.strip()
                                break

                # 1. Point placemark (Tower coordinates)
                if pt_coords_str and name:
                    total_sites_parsed += 1
                    parts = pt_coords_str.split(',')
                    if len(parts) >= 2:
                        try:
                            lng = float(parts[0])
                            lat = float(parts[1])
                            clean_name = name.upper()
                            if clean_name not in site_points:
                                site_points[clean_name] = (lat, lng)

                            # Check if site exists and needs coordinate update
                            target_site = sites_by_ihs.get(clean_name) or sites_by_mtn.get(clean_name)
                            if target_site and (not target_site.latitude or not target_site.longitude or target_site.latitude == 0.0):
                                if target_site.id not in updated_sites_set:
                                    target_site.latitude = lat
                                    target_site.longitude = lng
                                    sites_to_update_coords.append(target_site)
                                    updated_sites_set.add(target_site.id)
                        except Exception as e:
                            logger.debug(f"Failed to parse point coordinates for {name}: {e}")

                # 2. Polygon placemark (RF Sector coverage wedge)
                elif poly_coords_str:
                    # Parse key=value pairs in description text
                    data = {}
                    for line in desc.splitlines():
                        line = line.strip()
                        if '=' in line:
                            k, v = line.split('=', 1)
                            data[k.strip()] = v.strip()

                    # Convert polygon coordinates into list of [lat, lng] pairs for Leaflet
                    poly_points = []
                    for tuple_str in poly_coords_str.split():
                        parts = tuple_str.split(',')
                        if len(parts) >= 2:
                            try:
                                poly_lng = float(parts[0])
                                poly_lat = float(parts[1])
                                poly_points.append([poly_lat, poly_lng])
                            except Exception:
                                pass

                    # Extract site ID & cell identifiers
                    site_id = data.get('Site') or data.get('SITE ID') or name
                    cell_name = data.get('4G CELL') or data.get('Cell name') or name
                    layer = data.get('Layer') or ''
                    enodeb = data.get('4G eNodeB') or ''
                    state_val = data.get('State') or ''
                    if state_val in ('0', '#N/A', 'OTHERS'):
                        state_val = 'FCT'

                    # Numerical fields parsing
                    lat = None
                    lng = None
                    try:
                        lat_val = data.get('Lat') or data.get('LAT')
                        lat = float(lat_val) if lat_val else None
                    except Exception:
                        pass

                    try:
                        lng_val = data.get('Long') or data.get('LONG')
                        lng = float(lng_val) if lng_val else None
                    except Exception:
                        pass

                    # Fallback to site_points or polygon centroid if lat/lng not in description
                    clean_site_id = site_id.strip().upper()
                    if (lat is None or lng is None) and clean_site_id in site_points:
                        lat, lng = site_points[clean_site_id]
                    elif (lat is None or lng is None) and poly_points:
                        lat, lng = poly_points[0][0], poly_points[0][1]

                    pci = None
                    try:
                        pci_val = data.get('PCI')
                        pci = int(pci_val) if pci_val else None
                    except Exception:
                        pass

                    cell_id = None
                    try:
                        cid_val = data.get('CellID') or data.get('Cell ID')
                        cell_id = int(cid_val) if cid_val else None
                    except Exception:
                        pass

                    tac = None
                    try:
                        tac_val = data.get('TAC')
                        tac = int(tac_val) if tac_val else None
                    except Exception:
                        pass

                    azimuth = None
                    try:
                        az_val = data.get('Azimuth') or data.get('ANTENNA Azimuth')
                        azimuth = float(az_val) if az_val else None
                    except Exception:
                        pass

                    prb_util = None
                    try:
                        prb_val = data.get('PRB Utilization')
                        prb_util = float(prb_val) if prb_val else None
                    except Exception:
                        pass

                    prb_range = data.get('Ranges PRB') or ''

                    # Resolve Site Foreign Key
                    site_ref = sites_by_ihs.get(clean_site_id) or sites_by_mtn.get(clean_site_id)

                    # Update coordinates on existing site if missing
                    if site_ref and lat and lng and (not site_ref.latitude or not site_ref.longitude or site_ref.latitude == 0.0):
                        if site_ref.id not in updated_sites_set:
                            site_ref.latitude = lat
                            site_ref.longitude = lng
                            if state_val and (not site_ref.state or site_ref.state in ('FCT', '', 'Unknown')):
                                site_ref.state = state_val
                            sites_to_update_coords.append(site_ref)
                            updated_sites_set.add(site_ref.id)

                    # Stage new lightweight site if it doesn't exist in DB at all
                    if not site_ref and clean_site_id not in new_sites_dict:
                        site_lat = lat or (site_points.get(clean_site_id)[0] if clean_site_id in site_points else None)
                        site_lng = lng or (site_points.get(clean_site_id)[1] if clean_site_id in site_points else None)
                        if site_lat and site_lng:
                            new_sites_dict[clean_site_id] = Site(
                                ihs_site_id=clean_site_id,
                                state=state_val or 'FCT',
                                region=region_name,
                                cluster_name=f"{state_val or 'Abuja'} Cluster",
                                operational_status='Operational',
                                latitude=site_lat,
                                longitude=site_lng,
                                raw_data={'Source': filename, 'Layer': layer, 'Coverage': 'Abuja Region'}
                            )

                    sector_obj = CellSector(
                        site_id=clean_site_id,
                        site_ref=site_ref,
                        tech='4G',
                        cell_name=cell_name,
                        cell_id=cell_id,
                        pci=pci,
                        tac=tac,
                        azimuth=azimuth,
                        latitude=lat,
                        longitude=lng,
                        polygon_coords=poly_points,
                        region=region_name,
                        source_kml=filename,
                        layer=layer,
                        enodeb=enodeb,
                        prb_utilization=prb_util,
                        prb_range=prb_range,
                        state=state_val
                    )
                    sectors_batch.append(sector_obj)
                    total_sectors_parsed += 1

                elem.clear()

    # Ingest from KMZ (Zip) or direct KML stream
    if is_kmz:
        with zipfile.ZipFile(kml_or_kmz_path, 'r') as z:
            kml_members = [name for name in z.namelist() if name.lower().endswith('.kml')]
            if not kml_members:
                raise ValueError(f"No .kml files found inside KMZ archive: {kml_or_kmz_path}")
            kml_target = 'doc.kml' if 'doc.kml' in kml_members else kml_members[0]
            logger.info(f"Opening internal KML '{kml_target}' from KMZ archive...")
            with z.open(kml_target) as kml_stream:
                _process_stream(kml_stream)
    else:
        with open(kml_or_kmz_path, 'rb') as kml_stream:
            _process_stream(kml_stream)

    logger.info(f"Parsed {total_sites_parsed} site points and {total_sectors_parsed} sectors. Saving to database...")

    # Save to database inside atomic transaction
    with transaction.atomic():
        # Create any missing Sites first
        if new_sites_dict:
            logger.info(f"Creating {len(new_sites_dict)} new Site records from {filename}...")
            created_sites = Site.objects.bulk_create(list(new_sites_dict.values()), batch_size=1000)
            for s in created_sites:
                sites_by_ihs[s.ihs_site_id.strip().upper()] = s

            # Backfill site_ref on sectors for newly created sites
            for sec in sectors_batch:
                if not sec.site_ref and sec.site_id in sites_by_ihs:
                    sec.site_ref = sites_by_ihs[sec.site_id]

        # Clean out old sectors
        if replace_existing:
            CellSector.objects.filter(Q(source_kml=filename) | Q(source_kml='ABUJA REGION KML 07292026 (4G).kml')).delete()
        else:
            CellSector.objects.filter(source_kml=filename).delete()

        # Bulk insert sectors in chunks of 2500
        chunk_size = 2500
        for i in range(0, len(sectors_batch), chunk_size):
            CellSector.objects.bulk_create(sectors_batch[i:i + chunk_size])

        # Bulk update site coordinates
        if sites_to_update_coords:
            Site.objects.bulk_update(sites_to_update_coords, ['latitude', 'longitude', 'state'], batch_size=1000)

    matched_sites_count = CellSector.objects.filter(source_kml=filename, site_ref__isnull=False).values('site_id').distinct().count()
    unique_sites_in_kml = CellSector.objects.filter(source_kml=filename).values('site_id').distinct().count()
    total_saved = CellSector.objects.filter(source_kml=filename).count()

    logger.info(f"KML/KMZ Ingestion complete: {total_saved} sectors for {unique_sites_in_kml} sites ({matched_sites_count} matched in DB).")

    return {
        'success': True,
        'filename': filename,
        'region': region_name,
        'total_sectors': total_saved,
        'unique_sites': unique_sites_in_kml,
        'matched_sites': matched_sites_count,
        'new_sites_created': len(new_sites_dict),
        'updated_sites_coords': len(sites_to_update_coords)
    }
