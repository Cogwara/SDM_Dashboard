import os
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction
from sites.models import Site

class Command(BaseCommand):
    help = 'Imports real telecom site data EXCLUSIVELY from WSD APRIL 2026 v 3.4-ABUJA REGION.xlsb file capturing ALL 87 columns'

    def handle(self, *args, **options):
        f_wsd = r"C:\Users\MrChrys\Documents\Huawei Documents\SItes\WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb"

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

                # Capture ALL 87 columns into raw_data dictionary
                raw_specs = {}
                for col in df.columns:
                    val = row.get(col)
                    if pd.notnull(val):
                        val_str = str(val).strip()
                        if val_str.endswith('.0'):
                            val_str = val_str[:-2]
                        if val_str and val_str.lower() != 'nan':
                            raw_specs[str(col).strip()] = val_str

                op_status = clean_str(row.get('STATUS (Working, Halted)', 'Working')) or clean_str(row.get('Physical Status', 'Operational')) or 'Operational'
                priority = clean_str(row.get('Site priority', '')) or clean_str(row.get('I.H.S Site priority', ''))

                is_down = 'halted' in op_status.lower() or 'down' in op_status.lower()
                is_crit = priority.upper() in ['P1', 'CRITICAL', 'PRIORITY 1']

                no_dg = clean_str(row.get('No of DG', ''))
                dg_type = clean_str(row.get('DG Type', ''))
                dg_cap_str = f"{no_dg} {dg_type}".strip() if no_dg or dg_type else ''

                site_data = {
                    'ihs_site_id': s_id,
                    'mtn_id': clean_str(row.get('Tower Co ID', '')) or s_id,
                    'cascade': clean_str(row.get('BSC', '')) or clean_str(row.get('RNC', '')),
                    'priority': priority,
                    'ncc_site': clean_str(row.get('OEM', '')),
                    'hvc_cluster': clean_str(row.get('Site Cluster', '')),
                    'operational_status': op_status,
                    'site_configuration': clean_str(row.get('SITE TYPE (BTS, BB, NFE, OADM)', '')),
                    'power_solution': clean_str(row.get('PHCN Status', '')),
                    'dg_capacity': dg_cap_str,
                    'solution_on_site': clean_str(row.get('Indoor/Outdoor', '')),
                    'solution_category': clean_str(row.get('Cluster Category', '')),
                    'functionality_mode': clean_str(row.get('Tech', '')),
                    
                    # Contacts
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
                    
                    # Location
                    'site_address': clean_str(row.get('Site Name', '')),
                    'region': clean_str(row.get('REGION', '')) or clean_str(row.get('NEW REGION', 'FCT')),
                    'state': clean_str(row.get('STATE', 'FCT')),
                    'lga': clean_str(row.get('LGA', '')),
                    'latitude': clean_float(row.get('Lat')),
                    'longitude': clean_float(row.get('Long')),

                    # ALL 87 columns preserved
                    'raw_data': raw_specs,
                    
                    # Flags
                    'is_down': is_down,
                    'is_critical': is_crit,
                }

                if s_id in site_dict:
                    # Merge
                    for k, v in site_data.items():
                        if k == 'raw_data':
                            site_dict[s_id]['raw_data'].update(v)
                        elif v and not site_dict[s_id][k]:
                            site_dict[s_id][k] = v
                else:
                    site_dict[s_id] = site_data

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error parsing WSD sheet: {e}"))
            return

        self.stdout.write(f"Unique deduplicated sites extracted: {len(site_dict)}")

        # Clear old sites
        Site.objects.all().delete()

        site_objects = [Site(**data) for data in site_dict.values()]
        
        with transaction.atomic():
            Site.objects.bulk_create(site_objects, batch_size=1000)

        self.stdout.write(self.style.SUCCESS(f"Successfully populated {len(site_objects)} unique sites with ALL 87 specs columns captured!"))
