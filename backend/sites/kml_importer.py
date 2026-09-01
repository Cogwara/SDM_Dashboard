import os
import xml.etree.ElementTree as ET
import logging
from django.db import transaction
from .models import Site, CellSector

logger = logging.getLogger(__name__)

def parse_and_import_kml(kml_file_path, region_name='Abuja Region', source_kml_name=None):
    """
    Parses a 4G/5G Telecom KML file (such as ABUJA REGION KML 07292026 (4G).kml)
    and populates CellSector records, links Site foreign keys, and enriches Site coordinates.
    """
    if not os.path.exists(kml_file_path):
        raise FileNotFoundError(f"KML file not found at: {kml_file_path}")

    filename = source_kml_name or os.path.basename(kml_file_path)
    logger.info(f"Starting KML ingestion for file: {filename}")

    # Build Site lookup map for fast foreign key resolution
    sites_by_ihs = {s.ihs_site_id.strip().upper(): s for s in Site.objects.all()}
    sites_by_mtn = {s.mtn_id.strip().upper(): s for s in Site.objects.exclude(mtn_id__isnull=True).exclude(mtn_id='')}

    site_points = {}
    sectors_batch = []
    sites_to_update_coords = []
    updated_sites_set = set()

    total_sectors_parsed = 0
    total_sites_parsed = 0

    # Stream parse XML to handle large files (e.g. 45MB+) with minimal memory footprint
    for event, elem in ET.iterparse(kml_file_path, events=('end',)):
        tag = elem.tag.split('}')[-1]

        if tag == 'Placemark':
            name = (elem.findtext('{http://earth.google.com/kml/2.2}name') or elem.findtext('name') or '').strip()
            has_point = elem.find('{http://earth.google.com/kml/2.2}Point') is not None or elem.find('Point') is not None
            has_polygon = elem.find('{http://earth.google.com/kml/2.2}Polygon') is not None or elem.find('Polygon') is not None

            if has_point and name:
                total_sites_parsed += 1
                pt = elem.find('{http://earth.google.com/kml/2.2}Point')
                if pt is None:
                    pt = elem.find('Point')
                coords_str = (pt.findtext('{http://earth.google.com/kml/2.2}coordinates') or pt.findtext('coordinates') or '').strip() if pt is not None else ''

                if coords_str and name not in site_points:
                    parts = coords_str.split(',')
                    if len(parts) >= 2:
                        try:
                            lng = float(parts[0])
                            lat = float(parts[1])
                            site_points[name] = (lat, lng)

                            # If site in DB has no coordinates, stage for update
                            clean_name = name.upper()
                            target_site = sites_by_ihs.get(clean_name) or sites_by_mtn.get(clean_name)
                            if target_site and (not target_site.latitude or not target_site.longitude or target_site.latitude == 0.0):
                                if target_site.id not in updated_sites_set:
                                    target_site.latitude = lat
                                    target_site.longitude = lng
                                    sites_to_update_coords.append(target_site)
                                    updated_sites_set.add(target_site.id)
                        except Exception as e:
                            logger.debug(f"Failed to parse point coordinates for {name}: {e}")

            elif has_polygon and name:
                desc = elem.findtext('{http://earth.google.com/kml/2.2}description') or elem.findtext('description') or ''
                poly = elem.find('{http://earth.google.com/kml/2.2}Polygon')
                if poly is None:
                    poly = elem.find('Polygon')
                coords_str = ''
                if poly is not None:
                    coords_str = (poly.findtext('.//{http://earth.google.com/kml/2.2}coordinates') or poly.findtext('.//coordinates') or '').strip()

                # Parse key=value pairs in description text
                data = {}
                for line in desc.split('\n'):
                    line = line.strip()
                    if '=' in line:
                        k, v = line.split('=', 1)
                        data[k.strip()] = v.strip()

                # Convert polygon coordinates into list of [lat, lng] pairs for Leaflet/React
                poly_points = []
                if coords_str:
                    for tuple_str in coords_str.split():
                        parts = tuple_str.split(',')
                        if len(parts) >= 2:
                            try:
                                poly_lng = float(parts[0])
                                poly_lat = float(parts[1])
                                poly_points.append([poly_lat, poly_lng])
                            except Exception:
                                pass

                # Numerical fields parsing
                try:
                    lat = float(data.get('LAT')) if data.get('LAT') else None
                except Exception:
                    lat = None

                try:
                    lng = float(data.get('LONG')) if data.get('LONG') else None
                except Exception:
                    lng = None

                try:
                    pci = int(data.get('PCI')) if data.get('PCI') else None
                except Exception:
                    pci = None

                try:
                    cell_id = int(data.get('CellID')) if data.get('CellID') else None
                except Exception:
                    cell_id = None

                try:
                    tac = int(data.get('TAC')) if data.get('TAC') else None
                except Exception:
                    tac = None

                try:
                    azimuth = float(data.get('ANTENNA Azimuth')) if data.get('ANTENNA Azimuth') else None
                except Exception:
                    azimuth = None

                clean_name = name.upper()
                site_ref = sites_by_ihs.get(clean_name) or sites_by_mtn.get(clean_name)

                # If lat/long wasn't in point, use sector center
                if site_ref and (not site_ref.latitude or not site_ref.longitude) and lat and lng:
                    if site_ref.id not in updated_sites_set:
                        site_ref.latitude = lat
                        site_ref.longitude = lng
                        sites_to_update_coords.append(site_ref)
                        updated_sites_set.add(site_ref.id)

                sector_obj = CellSector(
                    site_id=name,
                    site_ref=site_ref,
                    tech='4G',
                    cell_name=data.get('Cell name', ''),
                    cell_id=cell_id,
                    pci=pci,
                    tac=tac,
                    azimuth=azimuth,
                    latitude=lat,
                    longitude=lng,
                    polygon_coords=poly_points,
                    region=region_name,
                    source_kml=filename
                )
                sectors_batch.append(sector_obj)
                total_sectors_parsed += 1

            elem.clear()

    logger.info(f"Parsed {total_sites_parsed} site points and {total_sectors_parsed} sectors. Saving to database...")

    # Save to database inside transaction
    with transaction.atomic():
        # Clean out any old sectors from this source KML
        CellSector.objects.filter(source_kml=filename).delete()

        # Bulk insert sectors in chunks of 2500
        chunk_size = 2500
        for i in range(0, len(sectors_batch), chunk_size):
            CellSector.objects.bulk_create(sectors_batch[i:i + chunk_size])

        # Bulk update site coordinates
        if sites_to_update_coords:
            Site.objects.bulk_update(sites_to_update_coords, ['latitude', 'longitude'], batch_size=1000)

    matched_sites_count = CellSector.objects.filter(source_kml=filename, site_ref__isnull=False).values('site_id').distinct().count()
    unique_sites_in_kml = CellSector.objects.filter(source_kml=filename).values('site_id').distinct().count()
    total_saved = CellSector.objects.filter(source_kml=filename).count()

    logger.info(f"KML Ingestion complete: {total_saved} sectors for {unique_sites_in_kml} sites ({matched_sites_count} matched in DB).")

    return {
        'success': True,
        'filename': filename,
        'region': region_name,
        'total_sectors': total_saved,
        'unique_sites': unique_sites_in_kml,
        'matched_sites': matched_sites_count,
        'updated_sites_coords': len(sites_to_update_coords)
    }
