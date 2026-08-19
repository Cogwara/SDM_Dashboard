import os
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from sites.models import Site

class Command(BaseCommand):
    help = 'Imports real telecom site data EXCLUSIVELY from WSD APRIL 2026 v 3.4-ABUJA REGION.xlsb file capturing ALL 87 columns'

    def handle(self, *args, **options):
        f_wsd = r"/home/mrchrys/SDM/working site distribution/Huawei/WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb"

        self.stdout.write(self.style.SUCCESS(f"Starting site import EXCLUSIVELY from: {f_wsd}"))

        if not os.path.exists(f_wsd):
            self.stdout.write(self.style.ERROR(f"File not found: {f_wsd}"))
            return

        site_dict = {}

        try:
            df = pd.read_excel(f_wsd, engine='pyxlsb', sheet_name='WSD')
            self.stdout.write(f"Total rows read from WSD sheet: {len(df)}")

            for idx, row in df.iterrows():
                s_id = str(row.get('SiteID', '')).strip().upper()
                if not s_id or s_id == 'NAN':
                    continue

                def clean_str(val):
                    if pd.isnull(val): return ''
                    s = str(val).strip()
                    if s.endswith('.0'): s = s[:-2]
                    return '' if s.lower() == 'nan' else s

                def clean_float(val):
                    try:
                        return float(val) if pd.notnull(val) else None
                    except Exception:
                        return None

                op_status = clean_str(row.get('STATUS (Working, Halted)', 'Working')) or clean_str(row.get('Physical Status', 'Operational')) or 'Operational'
                priority = clean_str(row.get('Site priority', '')) or clean_str(row.get('I.H.S Site priority', ''))

                is_down = 'halted' in op_status.lower() or 'down' in op_status.lower()
                is_crit = priority.upper() in ['P1', 'CRITICAL', 'PRIORITY 1']

                no_dg = clean_str(row.get('No of DG', ''))
                dg_type = clean_str(row.get('DG Type', ''))
                dg_cap_str = f"{no_dg} {dg_type}".strip() if no_dg or dg_type else ''

                raw_specs = {}
                for col in df.columns:
                    val = row.get(col)
                    if pd.notnull(val):
                        val_str = str(val).strip()
                        if val_str.endswith('.0'):
                            val_str = val_str[:-2]
                        if val_str and val_str.lower() != 'nan':
                            raw_specs[str(col).strip()] = val_str

                site_data = {
                    'ihs_site_id': s_id,
                    'mtn_id': clean_str(row.get('Tower Co ID', '')) or s_id,
                    'cascade': clean_str(row.get('BSC', '')) or clean_str(row.get('RNC', '')),
                    'priority': priority or 'P2',
                    'ncc_site': clean_str(row.get('OEM', '')),
                    'hvc_cluster': clean_str(row.get('Site Cluster', '')),
                    'operational_status': op_status,
                    'site_configuration': clean_str(row.get('SITE TYPE (BTS, BB, NFE, OADM)', '')),
                    'power_solution': clean_str(row.get('PHCN Status', '')),
                    'dg_capacity': dg_cap_str,
                    'solution_on_site': clean_str(row.get('Indoor/Outdoor', '')),
                    'solution_category': clean_str(row.get('Cluster Category', '')),
                    'functionality_mode': clean_str(row.get('Tech', '')),
                    
                    'efs_name': clean_str(row.get('Project MANAGER', '')),
                    'efs_phone': clean_str(row.get('Project MANAGER CONTACT', '')),
                    'rto_name': clean_str(row.get('RPM(MS SITE)', '')) or clean_str(row.get('RPM(RT SITE)', '')),
                    'rto_phone': clean_str(row.get('RPM(MS SITE) CONTACT', '')) or clean_str(row.get('RPM(RT SITE) CONTACT', '')),
                    'smc': clean_str(row.get('Tower Co', '')),
                    'sub_sbc': clean_str(row.get('Tower Co SBC 1', '')),
                    'cluster_name': clean_str(row.get('Site Cluster', '')),
                    'smc_fse_name': clean_str(row.get('FSE NAME', '')),
                    'smc_fse_phone': clean_str(row.get('FSE CONTACT NO.', '')),
                    'smc_rto_name': clean_str(row.get('Switch Engineer', '')),
                    'smc_rto_phone': '',
                    'smc_hoo_name': clean_str(row.get('GM', '')),
                    'smc_hoo_phone': clean_str(row.get('GM Number', '')),
                    
                    'sdm_name': clean_str(row.get('SDM NAME', '')),
                    'sdm_phone': clean_str(row.get('SDM CONTACT NO. ', '')),
                    'mtn_rdm_name': clean_str(row.get('MTN RDM NAME', '')),
                    'mtn_rdm_phone': clean_str(row.get('MTN RDM CONTACT NO.', '')),
                    'mtn_fse_name': clean_str(row.get('MTN FSE NAME', '')),
                    'mtn_fse_phone': clean_str(row.get('MTN FSE CONTACT NO.', '')),
                    'mtn_rtm_name': clean_str(row.get('MTN RTM', '')),
                    'mtn_rtm_phone': clean_str(row.get('MTN RTM NUMBER', '')),
                    
                    'site_address': clean_str(row.get('Site Name', '')),
                    'region': clean_str(row.get('NEW REGION', '')) or clean_str(row.get('OLD REGION', 'FCT')),
                    'state': clean_str(row.get('STATE', 'FCT')),
                    'lga': clean_str(row.get('LGA', '')),
                    'latitude': clean_float(row.get('Lat')),
                    'longitude': clean_float(row.get('Long')),

                    'raw_data': raw_specs,
                    'is_down': is_down,
                    'is_critical': is_crit,
                }

                if s_id in site_dict:
                    for k, v in site_data.items():
                        if k == 'raw_data':
                            site_dict[s_id]['raw_data'].update(v)
                        elif v and not site_dict[s_id][k]:
                            site_dict[s_id][k] = v
                else:
                    site_dict[s_id] = site_data

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed reading Excel file: {e}"))
            return

        self.stdout.write(f"Unique deduplicated sites extracted: {len(site_dict)}")

        existing_map = {s.ihs_site_id.upper(): s for s in Site.objects.all()}

        to_create = []
        to_update = []
        update_fields = [
            'mtn_id', 'cascade', 'priority', 'ncc_site', 'hvc_cluster',
            'operational_status', 'site_configuration', 'power_solution',
            'dg_capacity', 'solution_on_site', 'solution_category', 'functionality_mode',
            'efs_name', 'efs_phone', 'rto_name', 'rto_phone', 'smc', 'sub_sbc',
            'cluster_name', 'smc_fse_name', 'smc_fse_phone', 'smc_rto_name',
            'smc_rto_phone', 'smc_hoo_name', 'smc_hoo_phone', 'sdm_name',
            'sdm_phone', 'mtn_rdm_name', 'mtn_rdm_phone', 'mtn_fse_name',
            'mtn_fse_phone', 'mtn_rtm_name', 'mtn_rtm_phone', 'site_address',
            'region', 'state', 'lga', 'latitude', 'longitude', 'raw_data',
            'is_down', 'is_critical'
        ]

        for s_id, data in site_dict.items():
            if s_id in existing_map:
                obj = existing_map[s_id]
                for k, v in data.items():
                    if k != 'ihs_site_id':
                        if k in ('sdm_name', 'sdm_phone') and obj.sdm_name and str(obj.sdm_name).strip():
                            continue
                        setattr(obj, k, v)
                to_update.append(obj)
            else:
                to_create.append(Site(**data))

        if 'sqlite' in connection.vendor:
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA busy_timeout = 30000;")
                cursor.execute("PRAGMA journal_mode = DELETE;")

        with transaction.atomic():
            if to_create:
                batch_size = 500
                for i in range(0, len(to_create), batch_size):
                    Site.objects.bulk_create(to_create[i:i+batch_size])
            if to_update:
                batch_size = 500
                for i in range(0, len(to_update), batch_size):
                    Site.objects.bulk_update(to_update[i:i+batch_size], update_fields)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully synced {len(site_dict)} unique sites (Created: {len(to_create)}, Updated: {len(to_update)}) with ALL 87 specs columns captured!"
        ))
