import os
import re
from datetime import datetime, date, timedelta
import openpyxl
from pyxlsb import open_workbook
from django.db import transaction, connection
from django.utils import timezone
from django.conf import settings
from .models import DailyAvailabilityRecord, DailyAvailabilityUploadLog, PIWeightageRecord

DEFAULT_BASE_AVAILABILITY_PATH = "/home/mrchrys/SDM/Daily Availibility/2026-08-03.xlsb"

_SITE_PREFIX_RE = re.compile(r'^(?:[A-Z]{2}|T)\d{2,6}$')
_ISO_DATE_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})')


def clean_str(val):
    if val is None:
        return ''
    if isinstance(val, float):
        if val != val:  # NaN check
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
        if val != val:  # NaN
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


def excel_serial_to_date_str(serial):
    if serial is None:
        return None
    if isinstance(serial, datetime):
        return serial.strftime('%Y-%m-%d')
    if isinstance(serial, date):
        return serial.strftime('%Y-%m-%d')
    if isinstance(serial, (int, float)):
        if serial == serial and 40000 < serial < 65000:
            dt = datetime(1899, 12, 30) + timedelta(days=int(serial))
            return dt.strftime('%Y-%m-%d')
        return None
    s = str(serial).strip()
    if not s:
        return None
    m = _ISO_DATE_RE.match(s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    if s.isdigit() and 40000 < int(s) < 65000:
        dt = datetime(1899, 12, 30) + timedelta(days=int(s))
        return dt.strftime('%Y-%m-%d')
    for fmt in ('%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%d-%b-%Y', '%d-%b-%y', '%b %d, %Y'):
        try:
            return datetime.strptime(s.split(' ')[0] if ':' in s else s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def _get_fast_temp_dir():
    if os.path.isdir('/dev/shm') and os.access('/dev/shm', os.W_OK):
        d = '/dev/shm/sdm_uploads'
    else:
        d = os.path.join('/tmp', 'sdm_uploads')
    os.makedirs(d, exist_ok=True)
    return d


def _load_pi_weights_lookup():
    pi_cache = {}
    try:
        for p in PIWeightageRecord.objects.values(
            'tech', 'element_id', 'site_id',
            'pi_national', 'pi_state', 'pi_region', 'pi_territory', 'configured_capacity'
        ):
            t = p['tech']
            pi_cache[(t, p['element_id'])] = p
            if (t, p['site_id']) not in pi_cache:
                pi_cache[(t, p['site_id'])] = p
    except Exception:
        pass
    if not pi_cache:
        try:
            from .management.commands.load_pi_weights import load_pi_weights_from_file
            pi_cache = load_pi_weights_from_file()
        except Exception:
            pass
    return pi_cache


def _resolve_tech_label(sheet_name):
    s_up = sheet_name.strip().upper()
    if '2G' in s_up or 'GSM' in s_up:
        return '2G'
    if '3G' in s_up or 'UMTS' in s_up or 'WCDMA' in s_up:
        return '3G'
    if '4G' in s_up or 'LTE' in s_up:
        return '4G'
    if '5G' in s_up or 'NR' in s_up:
        return '5G'
    return s_up


def _iter_sheet_rows(file_path, is_xlsb):
    """
    Yields (sheet_name, rows_generator) where each row is a list of raw cell values.
    Uses streaming readers for both .xlsb (pyxlsb) and .xlsx (openpyxl read_only).
    """
    if is_xlsb:
        with open_workbook(file_path) as wb:
            sheet_names = list(wb.sheets)
            tech_sheets = [s for s in sheet_names if s.strip().upper() in ('2G', '3G', '4G', '5G')]
            if not tech_sheets:
                tech_sheets = [s for s in sheet_names if any(t in s.upper() for t in ('2G', '3G', '4G', '5G'))]
            if not tech_sheets:
                tech_sheets = [s for s in sheet_names if s.strip().upper() != 'SEARCH ENGINE']

            for sname in tech_sheets:
                with wb.get_sheet(sname) as sheet:
                    yield sname, ([c.v for c in r] for r in sheet.rows())
    else:
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        try:
            sheet_names = list(wb.sheetnames)
            tech_sheets = [s for s in sheet_names if s.strip().upper() in ('2G', '3G', '4G', '5G')]
            if not tech_sheets:
                tech_sheets = [s for s in sheet_names if any(t in s.upper() for t in ('2G', '3G', '4G', '5G'))]
            if not tech_sheets:
                tech_sheets = [s for s in sheet_names if s.strip().upper() != 'SEARCH ENGINE']

            for sname in tech_sheets:
                ws = wb[sname]
                yield sname, (list(r) for r in ws.iter_rows(values_only=True))
        finally:
            wb.close()


def process_daily_availability_file(file_source, filename="2026-07-30.xlsb", uploaded_by="System Administrator", is_base=False):
    """
    High-speed streaming parser for Daily Availability Excel/XLSB files across 2G, 3G, 4G, 5G sheets.
    """
    temp_path = None
    file_to_read = file_source

    if not isinstance(file_source, str):
        temp_dir = _get_fast_temp_dir()
        ext = os.path.splitext(filename.lower())[1] or '.xlsx'
        temp_file = os.path.join(temp_dir, f"daily_upload_{int(datetime.now().timestamp() * 1000)}{ext}")
        with open(temp_file, 'wb+') as destination:
            for chunk in file_source.chunks():
                destination.write(chunk)
        temp_path = temp_file
        file_to_read = temp_path

    try:
        if not os.path.exists(file_to_read):
            return {'success': False, 'error': f"File path not found: {file_to_read}"}

        clean_filename = os.path.basename(filename)
        is_xlsb = file_to_read.lower().endswith('.xlsb')

        pi_weights_dict = _load_pi_weights_lookup()

        all_detected_dates = set()
        seen_keys = set()
        tech_counts = {}
        parsed_records = []

        for sheet_name, rows_iter in _iter_sheet_rows(file_to_read, is_xlsb):
            sheet_tech = _resolve_tech_label(sheet_name)
            header_row = None
            date_col_map = {}

            # Scan up to first 10 rows to locate the header row containing date columns
            for _ in range(10):
                try:
                    cand_row = next(rows_iter)
                except StopIteration:
                    break
                if not cand_row:
                    continue
                cand_dates = {}
                for idx, val in enumerate(cand_row):
                    d_str = excel_serial_to_date_str(val)
                    if d_str:
                        cand_dates[idx] = d_str
                if cand_dates:
                    header_row = cand_row
                    date_col_map = cand_dates
                    all_detected_dates.update(cand_dates.values())
                    break

            if not header_row or not date_col_map:
                continue

            col_index_map = {str(val).strip().upper(): idx for idx, val in enumerate(header_row) if val is not None}

            site_col_idx = col_index_map.get(
                'SITE ID',
                col_index_map.get(
                    'SITE_ID',
                    col_index_map.get(
                        'SITE',
                        col_index_map.get(
                            '2G',
                            col_index_map.get(
                                '3G NODEB',
                                col_index_map.get(
                                    '4G ENODEB',
                                    col_index_map.get('5G GNODEB', 1 if len(header_row) > 1 else 0)
                                )
                            )
                        )
                    )
                )
            )
            elem_col_idx = col_index_map.get(
                '4G ENODEB',
                col_index_map.get(
                    '5G GNODEB',
                    col_index_map.get('3G NODEB', col_index_map.get('2G', site_col_idx))
                )
            )

            state_idx = col_index_map.get('STATE')
            region_idx = col_index_map.get('NEW REGION', col_index_map.get('REGION'))
            lga_idx = col_index_map.get('LGA')
            territory_idx = col_index_map.get('TERRITORY')
            tower_co_idx = col_index_map.get('TOWER CO', col_index_map.get('TOWER_CO', col_index_map.get('TOWERCO')))
            vendor_idx = col_index_map.get('VENDOR')
            status_idx = col_index_map.get('STATUS')
            vvip_idx = col_index_map.get('VVIP')

            date_col_items = sorted(date_col_map.items(), key=lambda x: x[1])
            latest_sheet_date = date_col_items[-1][1] if date_col_items else None

            sheet_created = 0
            for row_vals in rows_iter:
                if not row_vals:
                    continue
                row_len = len(row_vals)
                if site_col_idx >= row_len:
                    continue
                raw_site_cell = row_vals[site_col_idx]
                raw_elem_cell = row_vals[elem_col_idx] if elem_col_idx < row_len else None
                if raw_site_cell is None and raw_elem_cell is None:
                    continue

                raw_s_id = clean_str(raw_site_cell).upper()
                raw_elem = clean_str(raw_elem_cell).upper() if raw_elem_cell is not None else raw_s_id

                if not raw_s_id or raw_s_id in ('NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY'):
                    if raw_elem and raw_elem not in ('NAN', '0', 'TOTAL', 'AVERAGE', 'GRAND TOTAL', 'SUMMARY'):
                        raw_s_id = raw_elem
                    else:
                        continue

                elem_name = raw_elem or raw_s_id

                s_id = raw_s_id
                s_len = len(s_id)
                if s_len >= 5 and s_id[0] in ('L', 'U', 'N'):
                    cand = s_id[1:]
                    if _SITE_PREFIX_RE.match(cand):
                        s_id = cand
                elif s_len >= 6 and s_id.startswith('LTE'):
                    cand = s_id[3:]
                    if _SITE_PREFIX_RE.match(cand):
                        s_id = cand

                rec_key = (s_id, sheet_tech)
                if rec_key in seen_keys:
                    continue

                daily_scores = {}
                total_val = 0.0
                valid_count = 0
                for c_idx, d_key in date_col_items:
                    if c_idx < row_len:
                        val = clean_float(row_vals[c_idx])
                        if val is not None:
                            daily_scores[d_key] = val
                            total_val += val
                            valid_count += 1

                if not valid_count:
                    continue

                seen_keys.add(rec_key)

                avg_val = round(total_val / valid_count, 2)
                latest_val = daily_scores.get(latest_sheet_date, avg_val)

                state_val = clean_str(row_vals[state_idx]) if (state_idx is not None and state_idx < row_len) else ''
                region_val = clean_str(row_vals[region_idx]) if (region_idx is not None and region_idx < row_len) else ''
                lga_val = clean_str(row_vals[lga_idx]) if (lga_idx is not None and lga_idx < row_len) else ''
                territory_val = clean_str(row_vals[territory_idx]) if (territory_idx is not None and territory_idx < row_len) else ''
                tower_val = clean_str(row_vals[tower_co_idx]) if (tower_co_idx is not None and tower_co_idx < row_len) else ''
                vendor_val = clean_str(row_vals[vendor_idx]) if (vendor_idx is not None and vendor_idx < row_len) else ''
                status_val = clean_str(row_vals[status_idx]) if (status_idx is not None and status_idx < row_len) else 'Active'
                vvip_val = clean_str(row_vals[vvip_idx]) if (vvip_idx is not None and vvip_idx < row_len) else ''

                pi_info = (
                    pi_weights_dict.get((sheet_tech, elem_name))
                    or pi_weights_dict.get((sheet_tech, s_id))
                    or pi_weights_dict.get((sheet_tech, raw_s_id))
                    or {}
                )

                parsed_records.append(DailyAvailabilityRecord(
                    site_id=s_id,
                    tech=sheet_tech,
                    element_name=elem_name,
                    state=state_val,
                    region=region_val,
                    lga=lga_val,
                    territory=territory_val,
                    tower_co=tower_val,
                    vendor=vendor_val,
                    status=status_val or 'Active',
                    vvip=vvip_val,
                    daily_scores=daily_scores,
                    avg_availability=avg_val,
                    latest_availability=latest_val,
                    pi_national=pi_info.get('pi_national', 0.0),
                    pi_state=pi_info.get('pi_state', 0.0),
                    pi_region=pi_info.get('pi_region', 0.0),
                    pi_territory=pi_info.get('pi_territory', 0.0),
                    configured_capacity=pi_info.get('configured_capacity', 0.0),
                ))
                sheet_created += 1

            tech_counts[sheet_tech] = tech_counts.get(sheet_tech, 0) + sheet_created

        if not parsed_records:
            return {
                'success': False,
                'error': 'No valid availability records or date columns were detected in the uploaded spreadsheet.'
            }

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
                cursor.execute("PRAGMA busy_timeout = 60000;")
                cursor.execute("PRAGMA synchronous = NORMAL;")

        total_created = len(parsed_records)

        with transaction.atomic():
            existing_log = DailyAvailabilityUploadLog.objects.filter(filename=clean_filename).first()
            DailyAvailabilityUploadLog.objects.all().update(is_active=False, is_archived=True)

            if existing_log:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM sites_dailyavailabilityrecord WHERE upload_log_id = %s", [existing_log.id])
                log = existing_log
                log.filename = clean_filename
                log.uploaded_by = uploaded_by
                log.uploaded_at = timezone.now()
                log.records_count = total_created
                log.date_range = date_range_str
                log.month_str = month_str
                log.start_date = start_date
                log.end_date = end_date
                log.is_active = True
                log.is_archived = False
                log.save()
            else:
                log = DailyAvailabilityUploadLog.objects.create(
                    filename=clean_filename,
                    uploaded_by=uploaded_by,
                    records_count=total_created,
                    date_range=date_range_str,
                    month_str=month_str,
                    start_date=start_date,
                    end_date=end_date,
                    is_active=True,
                    is_archived=False,
                    is_base=is_base
                )

            for rec in parsed_records:
                rec.upload_log = log

            for i in range(0, total_created, 3000):
                DailyAvailabilityRecord.objects.bulk_create(parsed_records[i:i + 3000], batch_size=3000)

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
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
