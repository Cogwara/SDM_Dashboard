import os
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from sites.models import Site, WSDUploadLog
from sites.executive_directory import STATE_EXECUTIVE_MAP, DEFAULT_EXEC

class Command(BaseCommand):
    help = 'Imports real telecom site data from WSD October 2026 v1.0.xlsx capturing ALL specs columns'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=None,
            help='Path to WSD Excel / xlsb file'
        )
        parser.add_argument(
            '--overwrite-sdm',
            action='store_true',
            default=False,
            help='Overwrite existing SDM assignments on sites'
        )

    def handle(self, *args, **options):
        f_wsd = options.get('file')
        overwrite_sdm = options.get('overwrite_sdm', False)

        if not f_wsd:
            candidates = [
                r"/home/mrchrys/SDM/working site distribution/Huawei/WSD October  2026 v1.0.xlsx",
                r"/app/data/WSD October  2026 v1.0.xlsx",
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "WSD October  2026 v1.0.xlsx"),
                r"/home/mrchrys/SDM/working site distribution/Huawei/WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb",
            ]
            for c in candidates:
                if os.path.exists(c):
                    f_wsd = c
                    break

        if not f_wsd or not os.path.exists(f_wsd):
            self.stdout.write(self.style.ERROR(f"File not found: {f_wsd}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Starting site import from: {f_wsd}"))

        def clean_str(val):
            if pd.isnull(val): return ''
            s = str(val).strip()
            if s.endswith('.0'): s = s[:-2]
            return '' if s.lower() == 'nan' else s

        def clean_phone(val):
            if pd.isnull(val): return ''
            s = str(val).strip()
            if s.endswith('.0'): s = s[:-2]
            if s.lower() == 'nan': return ''
            if s and not s.startswith('0') and not s.startswith('+') and len(s) == 10:
                s = '0' + s
            return s

        def clean_float(val):
            try:
                return float(val) if pd.notnull(val) else None
            except Exception:
                return None

        site_dict = {}

        try:
            engine = 'pyxlsb' if f_wsd.lower().endswith('.xlsb') else None
            try:
                df = pd.read_excel(f_wsd, engine=engine, sheet_name='WSD')
            except Exception:
                df = pd.read_excel(f_wsd, engine='pyxlsb', sheet_name='WSD')

            self.stdout.write(f"Total rows read from WSD sheet: {len(df)}")

            for idx, row in df.iterrows():
                s_id = clean_str(row.get('SiteID', '')).upper()
                if not s_id or s_id == 'NAN':
                    continue

                op_status = clean_str(row.get('STATUS (Working, Halted)', 'Working')) or clean_str(row.get('Physical Status', 'Operational')) or 'Operational'
                priority = clean_str(row.get('Site priority', '')) or clean_str(row.get('I.H.S Site Priority', '')) or clean_str(row.get('I.H.S Site priority', ''))

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
                    'efs_phone': clean_phone(row.get('Project MANAGER CONTACT', '')),
                    'rto_name': clean_str(row.get('RPM(MS SITE)', '')) or clean_str(row.get('RPM(RT SITE)', '')),
                    'rto_phone': clean_phone(row.get('RPM(MS SITE) CONTACT', '')) or clean_phone(row.get('RPM(RT SITE) CONTACT', '')),
                    'smc': clean_str(row.get('Tower Co', '')),
                    'sub_sbc': clean_str(row.get('Tower Co SBC 1', '')),
                    'cluster_name': clean_str(row.get('Site Cluster', '')),
                    'smc_fse_name': clean_str(row.get('FSE NAME', '')),
                    'smc_fse_phone': clean_phone(row.get('FSE CONTACT NO.', '')),
                    'smc_rto_name': clean_str(row.get('Switch Engineer', '')),
                    'smc_rto_phone': '',
                    'smc_hoo_name': clean_str(row.get('GM', '')),
                    'smc_hoo_phone': clean_phone(row.get('GM Number', '')),
                    
                    'sdm_name': clean_str(row.get('SDM NAME', '')),
                    'sdm_phone': clean_phone(row.get('SDM CONTACT NO.', '')) or clean_phone(row.get('SDM CONTACT NO. ', '')),
                    'mtn_rdm_name': clean_str(row.get('MTN RDM NAME', '')),
                    'mtn_rdm_phone': clean_phone(row.get('MTN RDM CONTACT NO.', '')),
                    'mtn_fse_name': clean_str(row.get('MTN FSE NAME', '')),
                    'mtn_fse_phone': clean_phone(row.get('MTN FSE CONTACT NO.', '')),
                    'mtn_rtm_name': clean_str(row.get('MTN RTM', '')),
                    'mtn_rtm_phone': clean_phone(row.get('MTN RTM NUMBER', '')),
                    
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
                        if not overwrite_sdm and k in ('sdm_name', 'sdm_phone') and obj.sdm_name and str(obj.sdm_name).strip():
                            continue
                        if k == 'raw_data':
                            # Preserve existing matrix and executive contacts
                            merged_raw = dict(obj.raw_data or {})
                            merged_raw.update(v)
                            st = (obj.state or data.get('state') or 'FCT').strip().upper()
                            cfg = STATE_EXECUTIVE_MAP.get(st, DEFAULT_EXEC)
                            if not merged_raw.get('Head, Field Service'):
                                merged_raw['Head, Field Service'] = cfg['head'][0]
                                merged_raw['Head, Field Service Phone'] = cfg['head'][1]
                                merged_raw['Head, Field Service Email'] = cfg['head'][2]
                            if not merged_raw.get('Customer Experience Manager'):
                                merged_raw['Customer Experience Manager'] = cfg['cem'][0]
                                merged_raw['Customer Experience Manager Phone'] = cfg['cem'][1]
                                merged_raw['Customer Experience Manager Email'] = cfg['cem'][2]
                            if not merged_raw.get('RTO Name'):
                                current_rto = obj.rto_name or merged_raw.get('RPM(MS SITE)') or merged_raw.get('RPM(RT SITE)') or cfg['rto'][0]
                                merged_raw['RTO Name'] = current_rto
                                merged_raw['RTO Phone'] = obj.rto_phone or merged_raw.get('RPM(MS SITE) CONTACT') or merged_raw.get('RPM(RT SITE) CONTACT') or cfg['rto'][1]
                                merged_raw['RTO Email'] = merged_raw.get('RTO Email') or cfg['rto'][2]
                            setattr(obj, 'raw_data', merged_raw)
                        elif k in ('rto_name', 'rto_phone') and not v and getattr(obj, k):
                            continue
                        else:
                            setattr(obj, k, v)
                if not obj.rto_name:
                    obj.rto_name = obj.raw_data.get('RTO Name') or obj.raw_data.get('RPM(MS SITE)')
                    obj.rto_phone = obj.raw_data.get('RTO Phone') or obj.raw_data.get('RPM(MS SITE) CONTACT')
                to_update.append(obj)
            else:
                st = (data.get('state') or 'FCT').strip().upper()
                cfg = STATE_EXECUTIVE_MAP.get(st, DEFAULT_EXEC)
                raw = dict(data.get('raw_data') or {})
                if not raw.get('Head, Field Service'):
                    raw['Head, Field Service'] = cfg['head'][0]
                    raw['Head, Field Service Phone'] = cfg['head'][1]
                    raw['Head, Field Service Email'] = cfg['head'][2]
                if not raw.get('Customer Experience Manager'):
                    raw['Customer Experience Manager'] = cfg['cem'][0]
                    raw['Customer Experience Manager Phone'] = cfg['cem'][1]
                    raw['Customer Experience Manager Email'] = cfg['cem'][2]
                if not raw.get('RTO Name'):
                    raw['RTO Name'] = data.get('rto_name') or cfg['rto'][0]
                    raw['RTO Phone'] = data.get('rto_phone') or cfg['rto'][1]
                    raw['RTO Email'] = cfg['rto'][2]
                if not data.get('rto_name'):
                    data['rto_name'] = raw['RTO Name']
                    data['rto_phone'] = raw['RTO Phone']
                data['raw_data'] = raw
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

            WSDUploadLog.objects.all().update(is_active=False)
            WSDUploadLog.objects.create(
                filename=os.path.basename(f_wsd),
                uploaded_by='Management Command (import_sites)',
                site_count=len(site_dict),
                is_active=True,
                is_base=True
            )

        self.stdout.write(self.style.SUCCESS(
            f"Successfully synced {len(site_dict)} unique sites (Created: {len(to_create)}, Updated: {len(to_update)}) from {os.path.basename(f_wsd)}!"
        ))

