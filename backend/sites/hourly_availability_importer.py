import os
from datetime import datetime, time as dt_time
import openpyxl
import pyxlsb
from django.db import transaction, connection
from django.conf import settings
from .models import HourlyAvailabilityRecord, HourlyAvailabilityUploadLog

DEFAULT_HOURLY_BASE_PATH = "/home/mrchrys/Downloads/WhatSie/12AM.xlsb"


def clean_str(val):
    if val is None:
        return ''
    if isinstance(val, float):
        if val != val:
            return ''
        if val.is_integer():
            return str(int(val))
    s = str(val).strip()
    if s.endswith('.0'):
        s = s[:-2]
    return '' if s.lower() in ('nan', 'none', 'null') else s


def clean_float(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if val != val:
            return None
        v = float(val)
        return max(0.0, min(100.0, round(v, 2)))
    if isinstance(val, str):
        s = val.strip()
        if not s or s.lower() in ('nan', 'none', 'null', '-', 'n/a', '#n/a'):
            return None
        if s.endswith('%'):
            s = s[:-1].strip()
        try:
            v = float(s)
            return max(0.0, min(100.0, round(v, 2)))
        except ValueError:
            return None
    return None


def _normalize_hour_header(val):
    if val is None:
        return None
    if isinstance(val, dt_time):
        return f"{val.hour:02d}:{val.minute:02d}"
    if isinstance(val, datetime):
        return f"{val.hour:02d}:{val.minute:02d}"
    if isinstance(val, (int, float)):
        if val == val and 0.0 <= val < 1.0:
            total_minutes = int(round(val * 24 * 60))
            hh = (total_minutes // 60) % 24
            mm = total_minutes % 60
            return f"{hh:02d}:{mm:02d}"
        return None
    s = str(val).strip()
    if not s:
        return None
    if ':' in s:
        parts = s.split(' ')[-1].split(':')
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            hh = int(parts[0])
            mm = int(parts[1])
            if 0 <= hh <= 23 and 0 <= mm <= 59:
                return f"{hh:02d}:{mm:02d}"
    return None


def _get_fast_temp_dir():
    if os.path.isdir('/dev/shm') and os.access('/dev/shm', os.W_OK):
        d = '/dev/shm/sdm_uploads'
    else:
        d = os.path.join('/tmp', 'sdm_uploads')
    os.makedirs(d, exist_ok=True)
    return d


def process_hourly_availability_file(file_source, filename="12AM.xlsb", uploaded_by="System Administrator", is_base=False):
    """
    High-Performance Memory-Streaming Parser for Hourly Availability Excel/XLSB files.
    """
    temp_path = None
    file_to_read = file_source

    if not isinstance(file_source, str):
        temp_dir = _get_fast_temp_dir()
        ext = os.path.splitext(filename.lower())[1] or '.xlsx'
        temp_file = os.path.join(temp_dir, f"hourly_upload_{int(datetime.now().timestamp() * 1000)}{ext}")
        with open(temp_file, 'wb+') as destination:
            for chunk in file_source.chunks():
                destination.write(chunk)
        temp_path = temp_file
        file_to_read = temp_path

    try:
        if not os.path.exists(file_to_read):
            return {'success': False, 'error': f"File path not found: {file_to_read}"}

        is_xlsb = filename.lower().endswith('.xlsb') or file_to_read.lower().endswith('.xlsb')

        date_str = 'Aug 07, 2026'
        national_regional_data = []
        detected_hours_set = set()
        parsed_records = []

        def parse_sheet_rows(sname, rows_iter):
            nonlocal date_str
            if sname == 'National_Regional_Hourly_Avail':
                for row_idx, vals in enumerate(rows_iter):
                    if row_idx == 1:
                        r1_clean = [v for v in vals if v is not None]
                        if r1_clean:
                            date_str = str(r1_clean[0]).replace('National (Hourly) Availability ', '').strip()
                    elif row_idx >= 2:
                        if len(vals) >= 6 and vals[1] is not None:
                            h_str = _normalize_hour_header(vals[1]) or str(vals[1]).strip()
                            if ':' in h_str:
                                national_regional_data.append({
                                    'hour': h_str,
                                    '2G': clean_float(vals[2]),
                                    '3G': clean_float(vals[3]),
                                    '4G': clean_float(vals[4]),
                                    '5G': clean_float(vals[5]),
                                    'Target': clean_float(vals[6]) or 98.6,
                                    'Middle_Belt_ABJ': clean_float(vals[9]) if len(vals) > 9 else None,
                                    'Core_East_ASB': clean_float(vals[10]) if len(vals) > 10 else None,
                                    'Far_East_ENG': clean_float(vals[11]) if len(vals) > 11 else None,
                                    'Core_West_IBD': clean_float(vals[12]) if len(vals) > 12 else None,
                                    'Far_North_KNO': clean_float(vals[13]) if len(vals) > 13 else None,
                                    'Lagos_Ogun_LGS': clean_float(vals[14]) if len(vals) > 14 else None,
                                    'Riverine_PHC': clean_float(vals[15]) if len(vals) > 15 else None,
                                })
                                detected_hours_set.add(h_str)
                return

            s_up = sname.upper()
            tech_label = '2G' if '2G' in s_up else ('3G' if '3G' in s_up else ('4G' if '4G' in s_up else '5G'))

            site_col_idx = None
            name_col_idx = None
            state_col_idx = None
            region_col_idx = None
            lga_col_idx = None
            territory_col_idx = None
            towerco_col_idx = None
            status_col_idx = None
            area_col_idx = None
            hour_cols = []

            # Locate header row within first 10 rows
            for _ in range(10):
                try:
                    cand_row = next(rows_iter)
                except StopIteration:
                    break
                if not cand_row:
                    continue
                cand_hours = []
                for idx, cell_val in enumerate(cand_row):
                    h_norm = _normalize_hour_header(cell_val)
                    if h_norm:
                        cand_hours.append((idx, h_norm))
                if cand_hours:
                    hour_cols = cand_hours
                    for _, h_norm in cand_hours:
                        detected_hours_set.add(h_norm)
                    for idx, cell_val in enumerate(cand_row):
                        if cell_val is None:
                            continue
                        h_upper = str(cell_val).strip().upper()
                        if h_upper in ('SITE', 'SITE ID', 'SITE_ID', '2G', '2G BTS', '3G NODEB', '4G ENODEB', '5G GNODEB'):
                            if site_col_idx is None:
                                site_col_idx = idx
                        elif h_upper in ('SITE_NAME', 'SITE NAME'):
                            name_col_idx = idx
                        elif h_upper == 'STATE':
                            state_col_idx = idx
                        elif h_upper in ('REGION', 'NEW REGION'):
                            region_col_idx = idx
                        elif h_upper == 'LGA':
                            lga_col_idx = idx
                        elif h_upper == 'TERRITORY':
                            territory_col_idx = idx
                        elif h_upper in ('TOWERCO', 'TOWER_CO', 'TOWER CO'):
                            towerco_col_idx = idx
                        elif h_upper == 'STATUS':
                            status_col_idx = idx
                        elif h_upper in ('AREA NAME', 'AREA_NAME'):
                            area_col_idx = idx
                    if site_col_idx is None:
                        site_col_idx = 1 if len(cand_row) > 1 else 0
                    break

            if not hour_cols or site_col_idx is None:
                return

            for vals in rows_iter:
                row_len = len(vals)
                if row_len <= site_col_idx:
                    continue
                s_id = clean_str(vals[site_col_idx]).upper()
                if not s_id or s_id in ('NAN', 'TOTAL', 'AVERAGE', 'GRAND TOTAL'):
                    continue

                clean_site_id = s_id
                if (s_id.startswith('LAB') or s_id.startswith('NAN')) and len(s_id) >= 6:
                    clean_site_id = s_id[1:]

                element_name = s_id
                site_name = clean_str(vals[name_col_idx]) if (name_col_idx is not None and row_len > name_col_idx) else ''
                state_val = clean_str(vals[state_col_idx]).upper() if (state_col_idx is not None and row_len > state_col_idx) else ''
                region_val = clean_str(vals[region_col_idx]).upper() if (region_col_idx is not None and row_len > region_col_idx) else ''
                lga_val = clean_str(vals[lga_col_idx]).upper() if (lga_col_idx is not None and row_len > lga_col_idx) else ''
                territory_val = clean_str(vals[territory_col_idx]).upper() if (territory_col_idx is not None and row_len > territory_col_idx) else ''
                tower_co_val = clean_str(vals[towerco_col_idx]) if (towerco_col_idx is not None and row_len > towerco_col_idx) else ''
                status_val = clean_str(vals[status_col_idx]) if (status_col_idx is not None and row_len > status_col_idx) else 'Active'
                area_name_val = clean_str(vals[area_col_idx]) if (area_col_idx is not None and row_len > area_col_idx) else ''

                hourly_scores = {}
                total_score = 0.0
                valid_count = 0
                latest_hour = ''
                latest_val = 100.0

                for col_i, h_label in hour_cols:
                    if row_len > col_i:
                        score = clean_float(vals[col_i])
                        if score is not None:
                            hourly_scores[h_label] = score
                            total_score += score
                            valid_count += 1
                            latest_hour = h_label
                            latest_val = score

                avg_val = round(total_score / valid_count, 2) if valid_count else 100.0

                parsed_records.append(HourlyAvailabilityRecord(
                    site_id=clean_site_id,
                    tech=tech_label,
                    element_name=element_name,
                    site_name=site_name,
                    state=state_val,
                    region=region_val,
                    lga=lga_val,
                    territory=territory_val,
                    tower_co=tower_co_val,
                    area_name=area_name_val,
                    status=status_val or 'Active',
                    hourly_scores=hourly_scores,
                    avg_availability=avg_val,
                    latest_availability=latest_val,
                    latest_hour=latest_hour
                ))

        if is_xlsb:
            with pyxlsb.open_workbook(file_to_read) as wb:
                sheet_names = list(wb.sheets)
                if 'National_Regional_Hourly_Avail' in sheet_names:
                    with wb.get_sheet('National_Regional_Hourly_Avail') as sheet:
                        parse_sheet_rows('National_Regional_Hourly_Avail', ([c.v for c in r] for r in sheet.rows()))

                tech_sheets = [s for s in ('2G_Hourly_Avail', '3G_Hourly_Avail', '4G_Hourly_Avail', '5G_Hourly_Avail') if s in sheet_names]
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if ('Hourly' in s or any(t in s.upper() for t in ('2G', '3G', '4G', '5G'))) and s != 'National_Regional_Hourly_Avail']
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if s != 'National_Regional_Hourly_Avail']

                for sname in tech_sheets:
                    with wb.get_sheet(sname) as sheet:
                        parse_sheet_rows(sname, ([c.v for c in r] for r in sheet.rows()))
        else:
            wb = openpyxl.load_workbook(file_to_read, read_only=True, data_only=True)
            try:
                sheet_names = list(wb.sheetnames)
                if 'National_Regional_Hourly_Avail' in sheet_names:
                    ws = wb['National_Regional_Hourly_Avail']
                    parse_sheet_rows('National_Regional_Hourly_Avail', (list(r) for r in ws.iter_rows(values_only=True)))

                tech_sheets = [s for s in ('2G_Hourly_Avail', '3G_Hourly_Avail', '4G_Hourly_Avail', '5G_Hourly_Avail') if s in sheet_names]
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if ('Hourly' in s or any(t in s.upper() for t in ('2G', '3G', '4G', '5G'))) and s != 'National_Regional_Hourly_Avail']
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if s != 'National_Regional_Hourly_Avail']

                for sname in tech_sheets:
                    ws = wb[sname]
                    parse_sheet_rows(sname, (list(r) for r in ws.iter_rows(values_only=True)))
            finally:
                wb.close()

        total_inserted = len(parsed_records)
        if not total_inserted:
            return {'success': False, 'error': 'No valid hourly availability records were detected in the uploaded spreadsheet.'}

        if 'sqlite' in connection.vendor:
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA busy_timeout = 60000;")
                cursor.execute("PRAGMA synchronous = NORMAL;")

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM sites_hourlyavailabilityrecord")

            for i in range(0, total_inserted, 3000):
                HourlyAvailabilityRecord.objects.bulk_create(parsed_records[i:i + 3000], batch_size=3000)

            sorted_hours = sorted(list(detected_hours_set))
            if not sorted_hours:
                sorted_hours = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]

            HourlyAvailabilityUploadLog.objects.all().update(is_active=False)
            HourlyAvailabilityUploadLog.objects.create(
                filename=filename,
                uploaded_by=uploaded_by,
                records_count=total_inserted,
                date_str=date_str,
                hours_list=sorted_hours,
                national_regional_data=national_regional_data,
                is_active=True,
                is_base=is_base
            )

        return {
            'success': True,
            'filename': filename,
            'records_count': total_inserted,
            'date_str': date_str,
            'hours_count': len(sorted_hours),
            'hours_list': sorted_hours,
            'national_regional_count': len(national_regional_data)
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': f"Error processing hourly availability file: {str(e)}"}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
