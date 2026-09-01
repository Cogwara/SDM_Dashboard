import os
import re
from datetime import datetime, timedelta
import pandas as pd
from pyxlsb import open_workbook
from django.db import transaction, connection
from django.db.models import Q
from django.conf import settings
from .models import DailyAvailabilityRecord, DailyAvailabilityUploadLog

DEFAULT_BASE_AVAILABILITY_PATH = "/home/mrchrys/SDM/Daily Availibility/2026-08-03.xlsb"

def clean_str(val):
    if val is None or pd.isnull(val): return ''
    s = str(val).strip()
    if s.endswith('.0'): s = s[:-2]
    return '' if s.lower() == 'nan' else s

def clean_float(val):
    try:
        if val is None or pd.isnull(val): return None
        v = float(val)
        return max(0.0, min(100.0, round(v, 2)))
    except Exception:
        return None

def excel_serial_to_date_str(serial):
    try:
        if isinstance(serial, (int, float)) and serial > 40000:
            dt = datetime(1899, 12, 30) + timedelta(days=int(serial))
            return dt.strftime('%Y-%m-%d')
        s = str(serial).strip()
        if len(s) == 10 and '-' in s:
            return s
    except Exception:
        pass
    return None

def process_daily_availability_file(file_source, filename="2026-07-30.xlsb", uploaded_by="System Administrator", is_base=False):
    """
    Parses a Daily Availability Excel/XLSB file across 2G, 3G, 4G, 5G sheets using low-memory row-level streaming,
    calculates month boundaries, auto-archives completed months, and preserves historical data.
    """
    temp_path = None
    file_to_read = file_source

    if not isinstance(file_source, str):
        temp_dir = os.path.join(settings.BASE_DIR, 'media', 'temp_uploads')
        os.makedirs(temp_dir, exist_ok=True)
        suffix = ".xlsb" if filename.lower().endswith(".xlsb") else ".xlsx"
        temp_file = os.path.join(temp_dir, f"daily_upload_{int(datetime.now().timestamp())}{suffix}")
        with open(temp_file, 'wb+') as destination:
            for chunk in file_source.chunks():
                destination.write(chunk)
        temp_path = temp_file
        file_to_read = temp_path

    try:
        if not os.path.exists(file_to_read):
            return {'success': False, 'error': f"File path not found: {file_to_read}"}

        all_detected_dates = set()
        clean_filename = os.path.basename(filename)

        if file_to_read.lower().endswith('.xlsb'):
            wb = open_workbook(file_to_read)
            tech_sheets = [s for s in ['2G', '3G', '4G', '5G'] if s in wb.sheets]
            if not tech_sheets:
                tech_sheets = [s for s in wb.sheets if s.upper() != 'SEARCH ENGINE']

            # Header scan to detect dates
            for sheet_name in tech_sheets:
                sheet = wb.get_sheet(sheet_name)
                rows_iter = iter(sheet)
                try:
                    header_row = [c.v for c in next(rows_iter)]
                    for val in header_row:
                        d_str = excel_serial_to_date_str(val)
                        if d_str:
                            all_detected_dates.add(d_str)
                except StopIteration:
                    pass

            all_sorted_dates = sorted(list(all_detected_dates))
            start_date = all_sorted_dates[0] if all_sorted_dates else None
            end_date = all_sorted_dates[-1] if all_sorted_dates else None
            date_range_str = f"{start_date} to {end_date}" if (start_date and end_date) else "N/A"

            month_str = "Unknown Month"
            if end_date:
                try:
                    dt_end = datetime.strptime(end_date, '%Y-%m-%d')
                    month_str = dt_end.strftime('%B %Y')
                except Exception:
                    month_str = end_date[:7]

            if 'sqlite' in connection.vendor:
                with connection.cursor() as cursor:
                    cursor.execute("PRAGMA busy_timeout = 30000;")
                    cursor.execute("PRAGMA journal_mode = DELETE;")

            with transaction.atomic():
                existing_log = DailyAvailabilityUploadLog.objects.filter(filename=clean_filename).first()
                DailyAvailabilityUploadLog.objects.all().update(is_active=False, is_archived=True)

                if existing_log:
                    DailyAvailabilityRecord.objects.filter(upload_log=existing_log).delete()
                    log = existing_log
                    log.filename = clean_filename
                    log.uploaded_by = uploaded_by
                    log.uploaded_at = datetime.now()
                    log.date_range = date_range_str
                    log.start_date = start_date
                    log.end_date = end_date
                    log.is_active = True
                    log.is_archived = False
                    log.save()
                else:
                    log = DailyAvailabilityUploadLog.objects.create(
                        filename=clean_filename,
                        uploaded_by=uploaded_by,
                        records_count=0,
                        date_range=date_range_str,
                        month_str=month_str,
                        start_date=start_date,
                        end_date=end_date,
                        is_active=True,
                        is_archived=False,
                        is_base=is_base
                    )

            # Pre-load PI Weightage reference dictionary
            try:
                from .management.commands.load_pi_weights import load_pi_weights_from_file
                pi_weights_dict = load_pi_weights_from_file()
            except Exception as e:
                print(f"[DailyAvailabilityImporter] Warning: Could not pre-load PI weights: {e}")
                pi_weights_dict = {}

            total_created = 0
            seen_keys = set()
            tech_counts = {}

            for sheet_name in tech_sheets:
                sheet = wb.get_sheet(sheet_name)
                rows_iter = iter(sheet)
                try:
                    header_row = [c.v for c in next(rows_iter)]
                except StopIteration:
                    continue

                col_index_map = {str(val).strip().upper(): idx for idx, val in enumerate(header_row) if val is not None}
                
                # Priority: Look for 'SITE ID' / 'SITE_ID' first, then fallback to tech-specific headers
                site_col_idx = col_index_map.get('SITE ID', col_index_map.get('SITE_ID', col_index_map.get('2G', col_index_map.get('3G NODEB', col_index_map.get('4G ENODEB', col_index_map.get('5G GNODEB', 1))))))
                elem_col_idx = col_index_map.get('4G ENODEB', col_index_map.get('5G GNODEB', col_index_map.get('3G NODEB', col_index_map.get('2G', site_col_idx))))

                state_idx = col_index_map.get('STATE')
                region_idx = col_index_map.get('NEW REGION', col_index_map.get('REGION'))
                lga_idx = col_index_map.get('LGA')
                territory_idx = col_index_map.get('TERRITORY')
                tower_co_idx = col_index_map.get('TOWER CO')
                vendor_idx = col_index_map.get('VENDOR')
                status_idx = col_index_map.get('STATUS')
                vvip_idx = col_index_map.get('VVIP')

                date_col_map = {}
                for idx, val in enumerate(header_row):
                    d_str = excel_serial_to_date_str(val)
                    if d_str:
                        date_col_map[idx] = d_str

                sheet_created = 0
                batch = []
                sheet_tech = sheet_name.upper()
                for r in rows_iter:
                    row_vals = [c.v for c in r]
                    if not row_vals or site_col_idx >= len(row_vals) or row_vals[site_col_idx] is None:
                        continue
                    raw_s_id = clean_str(row_vals[site_col_idx]).upper()
                    raw_elem = clean_str(row_vals[elem_col_idx]).upper() if elem_col_idx < len(row_vals) and row_vals[elem_col_idx] is not None else raw_s_id
                    
                    if not raw_s_id or raw_s_id in ['NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY']:
                        if raw_elem and raw_elem not in ['NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY']:
                            raw_s_id = raw_elem
                        else:
                            continue

                    elem_name = raw_elem or raw_s_id

                    # Resolve canonical site_id by stripping carrier tech prefix (L/U/N/LTE) if needed
                    s_id = raw_s_id
                    if len(s_id) >= 5 and (s_id.startswith('L') or s_id.startswith('U') or s_id.startswith('N')):
                        cand = s_id[1:]
                        if re.match(r'^[A-Z]{2}\d{2,6}$', cand) or re.match(r'^T\d{2,6}$', cand):
                            s_id = cand
                    elif len(s_id) >= 6 and s_id.startswith('LTE'):
                        cand = s_id[3:]
                        if re.match(r'^[A-Z]{2}\d{2,6}$', cand) or re.match(r'^T\d{2,6}$', cand):
                            s_id = cand

                    rec_key = (s_id, sheet_tech)
                    if rec_key in seen_keys:
                        continue
                    seen_keys.add(rec_key)

                    state_val = clean_str(row_vals[state_idx]) if (state_idx is not None and state_idx < len(row_vals)) else ''
                    region_val = clean_str(row_vals[region_idx]) if (region_idx is not None and region_idx < len(row_vals)) else ''
                    lga_val = clean_str(row_vals[lga_idx]) if (lga_idx is not None and lga_idx < len(row_vals)) else ''
                    territory_val = clean_str(row_vals[territory_idx]) if (territory_idx is not None and territory_idx < len(row_vals)) else ''
                    tower_val = clean_str(row_vals[tower_co_idx]) if (tower_co_idx is not None and tower_co_idx < len(row_vals)) else ''
                    vendor_val = clean_str(row_vals[vendor_idx]) if (vendor_idx is not None and vendor_idx < len(row_vals)) else ''
                    status_val = clean_str(row_vals[status_idx]) if (status_idx is not None and status_idx < len(row_vals)) else 'Active'
                    vvip_val = clean_str(row_vals[vvip_idx]) if (vvip_idx is not None and vvip_idx < len(row_vals)) else ''

                    daily_scores = {}
                    valid_vals = []
                    for c_idx, d_key in date_col_map.items():
                        if c_idx < len(row_vals):
                            val = clean_float(row_vals[c_idx])
                            if val is not None:
                                daily_scores[d_key] = val
                                valid_vals.append(val)

                    if not daily_scores:
                        continue

                    avg_val = round(sum(valid_vals) / len(valid_vals), 2) if valid_vals else 100.0
                    latest_val = daily_scores.get(all_sorted_dates[-1], avg_val) if all_sorted_dates else avg_val

                    # Lookup PI weight for this element/site
                    pi_info = pi_weights_dict.get((sheet_tech, elem_name)) or pi_weights_dict.get((sheet_tech, s_id)) or pi_weights_dict.get((sheet_tech, raw_s_id)) or {}

                    batch.append(DailyAvailabilityRecord(
                        upload_log=log,
                        site_id=s_id,
                        tech=sheet_tech,
                        element_name=elem_name,
                        state=state_val,
                        region=region_val,
                        lga=lga_val,
                        territory=territory_val,
                        tower_co=tower_val,
                        vendor=vendor_val,
                        status=status_val,
                        vvip=vvip_val,
                        daily_scores=daily_scores,
                        avg_availability=avg_val,
                        latest_availability=latest_val,
                        pi_national=pi_info.get('pi_national', 0.0),
                        pi_state=pi_info.get('pi_state', 0.0),
                        pi_region=pi_info.get('pi_region', 0.0),
                        pi_territory=pi_info.get('pi_territory', 0.0),
                        configured_capacity=pi_info.get('configured_capacity', 0.0)
                    ))

                    if len(batch) >= 1500:
                        DailyAvailabilityRecord.objects.bulk_create(batch)
                        total_created += len(batch)
                        sheet_created += len(batch)
                        batch = []

                if batch:
                    DailyAvailabilityRecord.objects.bulk_create(batch)
                    total_created += len(batch)
                    sheet_created += len(batch)
                    batch = []

                tech_counts[sheet_name.upper()] = sheet_created

            log.records_count = total_created
            log.save()

            return {
                'success': True,
                'filename': log.filename,
                'uploaded_by': log.uploaded_by,
                'records_count': log.records_count,
                'date_range': date_range_str,
                'month_str': log.month_str,
                'start_date': log.start_date,
                'end_date': log.end_date,
                'detected_dates': all_sorted_dates,
                'tech_counts': tech_counts,
                'uploaded_at': log.uploaded_at.isoformat(),
                'is_base': log.is_base
            }
        else:
            excel_file = pd.ExcelFile(file_to_read)
            sheet_names = excel_file.sheet_names
            tech_sheets = [s for s in ['2G', '3G', '4G', '5G'] if s in sheet_names]
            if not tech_sheets:
                tech_sheets = [s for s in sheet_names if s.upper() != 'SEARCH ENGINE']

            records_map = {}
            for tech in tech_sheets:
                df = pd.read_excel(file_to_read, sheet_name=tech)
                col_map = {str(c).strip().upper(): c for c in df.columns}
                site_id_col = None
                for cand in ['SITE ID', 'SITE_ID', '2G', 'Site ID', '3G NODEB', '4G eNodeB', '5G gNodeB']:
                    if cand.upper() in col_map:
                        site_id_col = col_map[cand.upper()]
                        break
                if not site_id_col:
                    site_id_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

                elem_col = None
                for cand in ['4G ENODEB', '5G GNODEB', '3G NODEB', '2G', 'SITE ID']:
                    if cand.upper() in col_map:
                        elem_col = col_map[cand.upper()]
                        break

                date_col_mapping = {}
                for c in df.columns:
                    date_str = excel_serial_to_date_str(c)
                    if date_str:
                        date_col_mapping[c] = date_str
                        all_detected_dates.add(date_str)

                sorted_dates = sorted(list(date_col_mapping.values()))
                latest_date = sorted_dates[-1] if sorted_dates else None

                count_tech = 0
                for _, row in df.iterrows():
                    raw_s_id = clean_str(row.get(site_id_col, '')).upper()
                    raw_elem = clean_str(row.get(elem_col, '')) if elem_col else raw_s_id
                    if not raw_s_id or raw_s_id in ['NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY']:
                        if raw_elem and raw_elem not in ['NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY']:
                            raw_s_id = raw_elem
                        else:
                            continue

                    elem_name = raw_elem or raw_s_id
                    s_id = raw_s_id
                    if len(s_id) >= 5 and (s_id.startswith('L') or s_id.startswith('U') or s_id.startswith('N')):
                        cand = s_id[1:]
                        if re.match(r'^[A-Z]{2}\d{2,6}$', cand) or re.match(r'^T\d{2,6}$', cand):
                            s_id = cand
                    elif len(s_id) >= 6 and s_id.startswith('LTE'):
                        cand = s_id[3:]
                        if re.match(r'^[A-Z]{2}\d{2,6}$', cand) or re.match(r'^T\d{2,6}$', cand):
                            s_id = cand

                    state = clean_str(row.get('STATE') or row.get('State') or '')
                    region = clean_str(row.get('NEW REGION') or row.get('REGION') or '')
                    lga = clean_str(row.get('LGA') or '')
                    territory = clean_str(row.get('TERRITORY') or row.get('Territory') or '')
                    tower_co = clean_str(row.get('TOWER CO') or row.get('Tower Co') or '')
                    vendor = clean_str(row.get('Vendor') or '')
                    status = clean_str(row.get('Status') or row.get('STATUS') or 'Active')
                    vvip = clean_str(row.get('VVIP') or '')

                    daily_scores = {}
                    valid_vals = []
                    for col_name, date_key in date_col_mapping.items():
                        val = clean_float(row.get(col_name))
                        if val is not None:
                            daily_scores[date_key] = val
                            valid_vals.append(val)

                    if not daily_scores:
                        continue

                    avg_val = round(sum(valid_vals) / len(valid_vals), 2) if valid_vals else 100.0
                    latest_val = daily_scores.get(latest_date, avg_val) if latest_date else avg_val

                    rec_key = (s_id, tech.upper())
                    records_map[rec_key] = {
                        'site_id': s_id,
                        'tech': tech.upper(),
                        'element_name': elem_name,
                        'state': state,
                        'region': region,
                        'lga': lga,
                        'territory': territory,
                        'tower_co': tower_co,
                        'vendor': vendor,
                        'status': status,
                        'vvip': vvip,
                        'daily_scores': daily_scores,
                        'avg_availability': avg_val,
                        'latest_availability': latest_val
                    }
                    count_tech += 1

                tech_counts[tech.upper()] = count_tech

            all_sorted_dates = sorted(list(all_detected_dates))
            start_date = all_sorted_dates[0] if all_sorted_dates else None
            end_date = all_sorted_dates[-1] if all_sorted_dates else None
            date_range_str = f"{start_date} to {end_date}" if (start_date and end_date) else "N/A"

            month_str = "Unknown Month"
            if end_date:
                try:
                    dt_end = datetime.strptime(end_date, '%Y-%m-%d')
                    month_str = dt_end.strftime('%B %Y')
                except Exception:
                    month_str = end_date[:7]

            with transaction.atomic():
                existing_log = DailyAvailabilityUploadLog.objects.filter(filename=clean_filename).first()
                DailyAvailabilityUploadLog.objects.all().update(is_active=False, is_archived=True)

                if existing_log:
                    DailyAvailabilityRecord.objects.filter(upload_log=existing_log).delete()
                    log = existing_log
                    log.filename = clean_filename
                    log.uploaded_by = uploaded_by
                    log.uploaded_at = datetime.now()
                    log.records_count = len(records_map)
                    log.date_range = date_range_str
                    log.start_date = start_date
                    log.end_date = end_date
                    log.is_active = True
                    log.is_archived = False
                    log.save()
                else:
                    log = DailyAvailabilityUploadLog.objects.create(
                        filename=clean_filename,
                        uploaded_by=uploaded_by,
                        records_count=len(records_map),
                        date_range=date_range_str,
                        month_str=month_str,
                        start_date=start_date,
                        end_date=end_date,
                        is_active=True,
                        is_archived=False,
                        is_base=is_base
                    )

                batch = []
                for data in records_map.values():
                    batch.append(DailyAvailabilityRecord(upload_log=log, **data))
                    if len(batch) >= 1500:
                        DailyAvailabilityRecord.objects.bulk_create(batch)
                        batch = []
                if batch:
                    DailyAvailabilityRecord.objects.bulk_create(batch)

            return {
                'success': True,
                'filename': log.filename,
                'uploaded_by': log.uploaded_by,
                'records_count': log.records_count,
                'date_range': date_range_str,
                'month_str': log.month_str,
                'start_date': log.start_date,
                'end_date': log.end_date,
                'detected_dates': all_sorted_dates,
                'tech_counts': tech_counts,
                'uploaded_at': log.uploaded_at.isoformat(),
                'is_base': log.is_base
            }

    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
