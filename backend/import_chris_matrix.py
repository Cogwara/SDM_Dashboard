import os
import sys
import django
import pandas as pd

# Set up Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from sites.models import Site

def clean_val(val):
    if pd.isna(val) or val is None:
        return ''
    s = str(val).strip()
    if s == '0' or s.lower() == 'nan' or s.lower() == 'null':
        return ''
    if s.endswith('.0'):
        s = s[:-2]
    return s

def clean_phone(val):
    s = clean_val(val)
    if not s:
        return ''
    if s.startswith('234'):
        s = '0' + s[3:]
    elif len(s) == 10 and not s.startswith('0'):
        s = '0' + s
    return s

def run_import(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' does not exist.")
        return

    print(f"Loading Excel file: {file_path}...")
    df = pd.read_excel(file_path)
    print(f"Loaded {len(df)} records from Excel sheet.")

    # Pre-fetch all DB sites into lookup dicts for high performance
    all_sites = list(Site.objects.all())
    ihs_map = {}
    mtn_map = {}

    for s in all_sites:
        if s.ihs_site_id:
            ihs_map[s.ihs_site_id.strip().upper()] = s
        if s.mtn_id:
            mtn_map[s.mtn_id.strip().upper()] = s

    created_count = 0
    updated_count = 0

    for idx, row in df.iterrows():
        excel_ihs = clean_val(row.get('IHS Site ID'))
        excel_mtn = clean_val(row.get('MTN ID'))

        if not excel_ihs and not excel_mtn:
            continue

        site_obj = None
        if excel_mtn and excel_mtn.upper() in ihs_map:
            site_obj = ihs_map[excel_mtn.upper()]
        elif excel_ihs and excel_ihs.upper() in mtn_map:
            site_obj = mtn_map[excel_ihs.upper()]
        elif excel_ihs and excel_ihs.upper() in ihs_map:
            site_obj = ihs_map[excel_ihs.upper()]
        elif excel_mtn and excel_mtn.upper() in mtn_map:
            site_obj = mtn_map[excel_mtn.upper()]

        is_new = False
        if not site_obj:
            primary_id = excel_mtn if excel_mtn else excel_ihs
            sec_id = excel_ihs if excel_mtn else ''
            site_obj = Site(
                ihs_site_id=primary_id,
                mtn_id=sec_id,
                region=clean_val(row.get('Region')) or 'Abuja',
                state=clean_val(row.get('State')) or 'FCT',
            )
            is_new = True

        # Map fields from Matrix - CHRIS.xlsx
        if excel_mtn and not site_obj.ihs_site_id:
            site_obj.ihs_site_id = excel_mtn
        if excel_ihs and not site_obj.mtn_id:
            site_obj.mtn_id = excel_ihs

        site_obj.cascade = clean_val(row.get('Cascades')) or site_obj.cascade
        site_obj.priority = clean_val(row.get('NEW PRIORITY')) or site_obj.priority or 'P2'
        site_obj.ncc_site = clean_val(row.get('NCC SITES')) or site_obj.ncc_site
        site_obj.hvc_cluster = clean_val(row.get('HVC CLUSTER')) or site_obj.hvc_cluster
        site_obj.operational_status = clean_val(row.get('Site Operational Status')) or site_obj.operational_status or 'Operational'
        site_obj.site_configuration = clean_val(row.get('Site Configuration')) or site_obj.site_configuration
        site_obj.power_solution = clean_val(row.get('Power Solution')) or site_obj.power_solution
        site_obj.dg_capacity = clean_val(row.get('DG CAP')) or site_obj.dg_capacity
        site_obj.solution_on_site = clean_val(row.get('Solution on Site')) or site_obj.solution_on_site
        site_obj.solution_category = clean_val(row.get('Solution Category')) or site_obj.solution_category
        site_obj.functionality_mode = clean_val(row.get('Functionality Mode')) or site_obj.functionality_mode

        site_obj.efs_name = clean_val(row.get('EFS Name')) or site_obj.efs_name
        site_obj.efs_phone = clean_phone(row.get('EFS Phone')) or site_obj.efs_phone
        site_obj.rto_name = clean_val(row.get('RTO Name')) or site_obj.rto_name
        site_obj.rto_phone = clean_phone(row.get('RTO Phone')) or site_obj.rto_phone

        site_obj.smc = clean_val(row.get('SMC')) or site_obj.smc
        site_obj.sub_sbc = clean_val(row.get('SUB SBC')) or site_obj.sub_sbc
        site_obj.cluster_name = clean_val(row.get('Cluster Name(SMC)')) or site_obj.cluster_name

        site_obj.smc_fse_name = clean_val(row.get('SMC FSE Name')) or site_obj.smc_fse_name
        site_obj.smc_fse_phone = clean_phone(row.get('SMC FSE Phone')) or site_obj.smc_fse_phone
        site_obj.smc_rto_name = clean_val(row.get('SMC RTO Name')) or site_obj.smc_rto_name
        site_obj.smc_rto_phone = clean_phone(row.get('SMC RTO Phone')) or site_obj.smc_rto_phone
        site_obj.smc_hoo_name = clean_val(row.get('SMC HOO Name')) or site_obj.smc_hoo_name
        site_obj.smc_hoo_phone = clean_phone(row.get('SMC HOO Phone')) or site_obj.smc_hoo_phone

        site_obj.site_address = clean_val(row.get('Site Address')) or site_obj.site_address
        site_obj.region = clean_val(row.get('Region')) or site_obj.region or 'Abuja'
        site_obj.state = clean_val(row.get('State')) or site_obj.state or 'FCT'
        site_obj.lga = clean_val(row.get('LGA')) or site_obj.lga

        try:
            lat = row.get('Latitude')
            if not pd.isna(lat) and str(lat).strip():
                site_obj.latitude = float(lat)
        except (ValueError, TypeError):
            pass

        try:
            lon = row.get('Longitude')
            if not pd.isna(lon) and str(lon).strip():
                site_obj.longitude = float(lon)
        except (ValueError, TypeError):
            pass

        # Save all columns into raw_data JSON
        raw_dict = site_obj.raw_data or {}
        for col_name, col_val in row.items():
            val_s = clean_val(col_val)
            if val_s:
                raw_dict[str(col_name).strip()] = val_s
        site_obj.raw_data = raw_dict

        site_obj.save()

        if is_new:
            created_count += 1
            if site_obj.ihs_site_id:
                ihs_map[site_obj.ihs_site_id.upper()] = site_obj
        else:
            updated_count += 1

    print(f"Import Complete! Created: {created_count} new sites | Updated: {updated_count} existing sites.")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else '/app/data/Matrix - CHRIS.xlsx'
    run_import(target)
