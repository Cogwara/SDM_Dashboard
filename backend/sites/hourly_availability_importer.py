import os
import tempfile
import pyxlsb
import pandas as pd
from datetime import datetime
from django.db import transaction
from django.conf import settings
from .models import HourlyAvailabilityRecord, HourlyAvailabilityUploadLog

DEFAULT_HOURLY_BASE_PATH = "/home/mrchrys/Downloads/WhatSie/12AM.xlsb"

def clean_str(val):
    if val is None or pd.isnull(val):
        return ''
    s = str(val).strip()
    if s.endswith('.0'):
        s = s[:-2]
    return '' if s.lower() == 'nan' else s

def clean_float(val):
    try:
        if val is None or pd.isnull(val):
            return None
        v = float(val)
        return max(0.0, min(100.0, round(v, 2)))
    except Exception:
        return None

def process_hourly_availability_file(file_source, filename="12AM.xlsb", uploaded_by="System Administrator", is_base=False):
    """
    High-Performance Memory-Streaming Parser for Hourly Availability Excel/XLSB files.
    Eliminates SIGBUS / OOM by streaming batch database inserts in 2,000 item chunks.
    """
    temp_path = None
    file_to_read = file_source

    if not isinstance(file_source, str):
        temp_dir = os.path.join(settings.BASE_DIR, 'media', 'temp_uploads')
        os.makedirs(temp_dir, exist_ok=True)
        suffix = ".xlsb" if filename.lower().endswith(".xlsb") else ".xlsx"
        
        # Save upload inside app media directory to prevent system /tmp permission & shm SIGBUS errors
        temp_file = os.path.join(temp_dir, f"upload_{int(datetime.now().timestamp())}{suffix}")
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

        batch_objects = []
        total_inserted = 0

        def flush_batch():
            nonlocal batch_objects, total_inserted
            if batch_objects:
                HourlyAvailabilityRecord.objects.bulk_create(batch_objects, batch_size=2000)
                total_inserted += len(batch_objects)
                batch_objects = []

        # Atomic transaction reset for existing hourly records
        with transaction.atomic():
            HourlyAvailabilityRecord.objects.all().delete()

            if is_xlsb:
                with pyxlsb.open_workbook(file_to_read) as wb:
                    sheet_names = wb.sheets
                    
                    # 1. Parse National & Regional Hourly Trends
                    if 'National_Regional_Hourly_Avail' in sheet_names:
                        with wb.get_sheet('National_Regional_Hourly_Avail') as sheet:
                            for row_idx, r in enumerate(sheet.rows()):
                                vals = [c.v for c in r]
                                if row_idx == 1:
                                    r1_clean = [v for v in vals if v is not None]
                                    if r1_clean:
                                        date_str = str(r1_clean[0]).replace('National (Hourly) Availability ', '').strip()
                                elif row_idx >= 2:
                                    if len(vals) >= 6 and vals[1] is not None:
                                        h_str = str(vals[1]).strip()
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

                    # 2. Parse Technology Sheets (2G, 3G, 4G, 5G or generic sheets)
                    tech_sheets = [s for s in ['2G_Hourly_Avail', '3G_Hourly_Avail', '4G_Hourly_Avail', '5G_Hourly_Avail'] if s in sheet_names]
                    if not tech_sheets:
                        tech_sheets = [s for s in sheet_names if 'Hourly' in s or any(t in s for t in ['2G', '3G', '4G', '5G'])]
                    if not tech_sheets:
                        tech_sheets = [s for s in sheet_names if s != 'National_Regional_Hourly_Avail']

                    for sname in tech_sheets:
                        tech_label = '2G' if '2G' in sname else ('3G' if '3G' in sname else ('4G' if '4G' in sname else '5G'))
                        with wb.get_sheet(sname) as sheet:
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

                            for row_idx, r in enumerate(sheet.rows()):
                                if row_idx == 0:
                                    headers = [str(c.v).strip() if c.v is not None else '' for c in r]
                                    for idx, h in enumerate(headers):
                                        h_upper = h.upper()
                                        if h_upper in ['SITE', '2G BTS', '3G NODEB', '4G ENODEB', '5G GNODEB']:
                                            site_col_idx = idx
                                        elif h_upper in ['SITE_NAME', 'SITE NAME']:
                                            name_col_idx = idx
                                        elif h_upper == 'STATE':
                                            state_col_idx = idx
                                        elif h_upper == 'REGION':
                                            region_col_idx = idx
                                        elif h_upper == 'LGA':
                                            lga_col_idx = idx
                                        elif h_upper == 'TERRITORY':
                                            territory_col_idx = idx
                                        elif h_upper in ['TOWERCO', 'TOWER_CO', 'TOWER CO']:
                                            towerco_col_idx = idx
                                        elif h_upper == 'STATUS':
                                            status_col_idx = idx
                                        elif h_upper in ['AREA NAME', 'AREA_NAME']:
                                            area_col_idx = idx
                                        elif ':' in h or (len(h) == 5 and h[2] == ':'):
                                            hour_cols.append((idx, h.strip()))
                                            detected_hours_set.add(h.strip())

                                    if site_col_idx is None:
                                        site_col_idx = 1 if len(headers) > 1 else 0
                                    continue

                                vals = [c.v for c in r]
                                if len(vals) <= site_col_idx: continue
                                s_id = clean_str(vals[site_col_idx]).upper()
                                if not s_id or s_id == 'NAN': continue

                                clean_site_id = s_id
                                if s_id.startswith('LAB') and len(s_id) >= 6:
                                    clean_site_id = s_id[1:]
                                elif s_id.startswith('NAN') and len(s_id) >= 6:
                                    clean_site_id = s_id[1:]

                                element_name = s_id
                                site_name = clean_str(vals[name_col_idx]) if name_col_idx is not None and len(vals) > name_col_idx else ''
                                state_val = clean_str(vals[state_col_idx]).upper() if state_col_idx is not None and len(vals) > state_col_idx else ''
                                region_val = clean_str(vals[region_col_idx]).upper() if region_col_idx is not None and len(vals) > region_col_idx else ''
                                lga_val = clean_str(vals[lga_col_idx]).upper() if lga_col_idx is not None and len(vals) > lga_col_idx else ''
                                territory_val = clean_str(vals[territory_col_idx]).upper() if territory_col_idx is not None and len(vals) > territory_col_idx else ''
                                tower_co_val = clean_str(vals[towerco_col_idx]) if towerco_col_idx is not None and len(vals) > towerco_col_idx else ''
                                status_val = clean_str(vals[status_col_idx]) if status_col_idx is not None and len(vals) > status_col_idx else 'Active'
                                area_name_val = clean_str(vals[area_col_idx]) if area_col_idx is not None and len(vals) > area_col_idx else ''

                                hourly_scores = {}
                                valid_scores = []
                                latest_hour = ''
                                latest_val = 100.0

                                for col_i, h_label in hour_cols:
                                    if len(vals) > col_i:
                                        score = clean_float(vals[col_i])
                                        if score is not None:
                                            hourly_scores[h_label] = score
                                            valid_scores.append(score)
                                            latest_hour = h_label
                                            latest_val = score

                                avg_val = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else 100.0

                                rec = HourlyAvailabilityRecord(
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
                                    status=status_val,
                                    hourly_scores=hourly_scores,
                                    avg_availability=avg_val,
                                    latest_availability=latest_val,
                                    latest_hour=latest_hour
                                )
                                batch_objects.append(rec)
                                if len(batch_objects) >= 2000:
                                    flush_batch()
            else:
                excel_file = pd.ExcelFile(file_to_read)
                sheet_names = excel_file.sheet_names

                if 'National_Regional_Hourly_Avail' in sheet_names:
                    df_nr = pd.read_excel(file_to_read, sheet_name='National_Regional_Hourly_Avail')
                    if not df_nr.empty:
                        c0 = df_nr.columns[1] if len(df_nr.columns) > 1 else df_nr.columns[0]
                        if 'National' in str(c0):
                            date_str = str(c0).replace('National (Hourly) Availability ', '').strip()

                    for _, row in df_nr.iterrows():
                        vals = row.values
                        if len(vals) >= 6 and pd.notnull(vals[1]):
                            h_str = str(vals[1]).strip()
                            if ':' in h_str:
                                national_regional_data.append({
                                    'hour': h_str,
                                    '2G': clean_float(vals[2]),
                                    '3G': clean_float(vals[3]),
                                    '4G': clean_float(vals[4]),
                                    '5G': clean_float(vals[5]),
                                    'Target': clean_float(vals[6]) or 98.6,
                                    'Middle_Belt_ABJ': clean_float(vals[9]) if len(vals) > 9 else None,
                                })
                                detected_hours_set.add(h_str)

                tech_sheets = [s for s in ['2G_Hourly_Avail', '3G_Hourly_Avail', '4G_Hourly_Avail', '5G_Hourly_Avail'] if s in sheet_names]
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if 'Hourly' in s or any(t in s for t in ['2G', '3G', '4G', '5G'])]
                if not tech_sheets:
                    tech_sheets = [s for s in sheet_names if s != 'National_Regional_Hourly_Avail']

                for sname in tech_sheets:
                    tech_label = '2G' if '2G' in sname else ('3G' if '3G' in sname else ('4G' if '4G' in sname else '5G'))
                    df = pd.read_excel(file_to_read, sheet_name=sname)
                    headers = [str(c).strip() for c in df.columns]

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

                    for idx, h in enumerate(headers):
                        h_upper = h.upper()
                        if h_upper in ['SITE', '2G BTS', '3G NODEB', '4G ENODEB', '5G GNODEB']:
                            site_col_idx = idx
                        elif h_upper in ['SITE_NAME', 'SITE NAME']:
                            name_col_idx = idx
                        elif h_upper == 'STATE':
                            state_col_idx = idx
                        elif h_upper == 'REGION':
                            region_col_idx = idx
                        elif h_upper == 'LGA':
                            lga_col_idx = idx
                        elif h_upper == 'TERRITORY':
                            territory_col_idx = idx
                        elif h_upper in ['TOWERCO', 'TOWER_CO', 'TOWER CO']:
                            towerco_col_idx = idx
                        elif h_upper == 'STATUS':
                            status_col_idx = idx
                        elif h_upper in ['AREA NAME', 'AREA_NAME']:
                            area_col_idx = idx
                        elif ':' in h or (len(h) == 5 and h[2] == ':'):
                            hour_cols.append((idx, h.strip()))
                            detected_hours_set.add(h.strip())

                    if site_col_idx is None:
                        site_col_idx = 1 if len(headers) > 1 else 0

                    records_list = df.to_dict('records')
                    for row in records_list:
                        vals = list(row.values())
                        if len(vals) <= site_col_idx: continue
                        s_id = clean_str(vals[site_col_idx]).upper()
                        if not s_id or s_id == 'NAN': continue

                        clean_site_id = s_id
                        if s_id.startswith('LAB') and len(s_id) >= 6:
                            clean_site_id = s_id[1:]
                        elif s_id.startswith('NAN') and len(s_id) >= 6:
                            clean_site_id = s_id[1:]

                        element_name = s_id
                        site_name = clean_str(vals[name_col_idx]) if name_col_idx is not None and len(vals) > name_col_idx else ''
                        state_val = clean_str(vals[state_col_idx]).upper() if state_col_idx is not None and len(vals) > state_col_idx else ''
                        region_val = clean_str(vals[region_col_idx]).upper() if region_col_idx is not None and len(vals) > region_col_idx else ''
                        lga_val = clean_str(vals[lga_col_idx]).upper() if lga_col_idx is not None and len(vals) > lga_col_idx else ''
                        territory_val = clean_str(vals[territory_col_idx]).upper() if territory_col_idx is not None and len(vals) > territory_col_idx else ''
                        tower_co_val = clean_str(vals[towerco_col_idx]) if towerco_col_idx is not None and len(vals) > towerco_col_idx else ''
                        status_val = clean_str(vals[status_col_idx]) if status_col_idx is not None and len(vals) > status_col_idx else 'Active'
                        area_name_val = clean_str(vals[area_col_idx]) if area_col_idx is not None and len(vals) > area_col_idx else ''

                        hourly_scores = {}
                        valid_scores = []
                        latest_hour = ''
                        latest_val = 100.0

                        for col_i, h_label in hour_cols:
                            if len(vals) > col_i:
                                score = clean_float(vals[col_i])
                                if score is not None:
                                    hourly_scores[h_label] = score
                                    valid_scores.append(score)
                                    latest_hour = h_label
                                    latest_val = score

                        avg_val = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else 100.0

                        rec = HourlyAvailabilityRecord(
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
                            status=status_val,
                            hourly_scores=hourly_scores,
                            avg_availability=avg_val,
                            latest_availability=latest_val,
                            latest_hour=latest_hour
                        )
                        batch_objects.append(rec)
                        if len(batch_objects) >= 2000:
                            flush_batch()

            # Flush remaining batch objects
            flush_batch()

            sorted_hours = sorted(list(detected_hours_set))
            if not sorted_hours:
                sorted_hours = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]

            HourlyAvailabilityUploadLog.objects.all().update(is_active=False)
            log = HourlyAvailabilityUploadLog.objects.create(
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
            try: os.remove(temp_path)
            except Exception: pass
