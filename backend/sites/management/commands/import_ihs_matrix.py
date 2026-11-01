import os
import openpyxl
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from sites.models import Site

def clean_str(val):
    if val is None:
        return ''
    s = str(val).strip()
    if s.endswith('.0'):
        s = s[:-2]
    return '' if s.lower() == 'nan' else s

def clean_phone(val):
    if val is None:
        return ''
    s = str(val).strip()
    if s.endswith('.0'):
        s = s[:-2]
    if s.lower() == 'nan':
        return ''
    return s

class Command(BaseCommand):
    help = 'Imports and updates Site Inventory & IHS Matrix Database from IHS-MTN ABUJA REGION SITES.xlsx'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=None,
            help='Path to the IHS-MTN ABUJA REGION SITES Excel file'
        )

    def handle(self, *args, **options):
        f_path = options.get('file')
        if not f_path:
            candidates = [
                "/home/mrchrys/projects/SDM_Dashboard/backend/data/hldbm_IHS-MTN ABUJA REGION SITES.xlsx",
                "/home/mrchrys/Downloads/WhatSie/hldbm_IHS-MTN ABUJA REGION SITES.xlsx",
            ]
            for c in candidates:
                if os.path.exists(c):
                    f_path = c
                    break

        if not f_path or not os.path.exists(f_path):
            self.stdout.write(self.style.ERROR(f"File not found: {f_path}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Starting IHS Matrix import from: {f_path}"))

        try:
            wb = openpyxl.load_workbook(f_path, data_only=True)
            sheet = wb.active
            headers = [clean_str(cell) for cell in next(sheet.iter_rows(values_only=True))]
            data_rows = list(sheet.iter_rows(values_only=True))[1:]
            self.stdout.write(f"Total rows read from Excel sheet: {len(data_rows)}")
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed opening Excel file: {e}"))
            return

        # Build existing sites map
        existing_by_ihs = {}
        existing_by_mtn = {}
        for s in Site.objects.all():
            if s.ihs_site_id:
                existing_by_ihs[s.ihs_site_id.strip().upper()] = s
            if s.mtn_id:
                existing_by_mtn[s.mtn_id.strip().upper()] = s

        to_create = []
        to_update = []
        created_count = 0
        updated_count = 0

        update_fields = [
            'mtn_id', 'efs_name', 'efs_phone', 'rto_name', 'rto_phone',
            'smc', 'sub_sbc', 'smc_fse_name', 'smc_fse_phone', 'smc_rto_name',
            'smc_rto_phone', 'smc_hoo_name', 'smc_hoo_phone', 'site_address',
            'cluster_name', 'raw_data', 'updated_at'
        ]

        sdm_defaults = {
            'FCT': ('Chris Ogwara', '09065043549'),
            'KADUNA': ('Mukhtar Kabir Mohammed', '8034503815'),
            'NIGER': ('Ajayi Ayo Emmanuel', '8030650744'),
            'PLATEAU': ('NWADIKE CHIGOZIE MARTINS', '8062979072'),
            'TARABA': ('Nasir Jimoh', '7062025737'),
            'KOGI': ('Chris Ogwara', '09065043549'),
            'NASSARAWA': ('Chris Ogwara', '09065043549'),
            'BAUCHI': ('Chris Ogwara', '09065043549'),
        }

        for r in data_rows:
            row_dict = {headers[i]: r[i] for i in range(min(len(headers), len(r)))}
            ihs_id = clean_str(row_dict.get('IHS Site ID'))
            tenant_id = clean_str(row_dict.get('Tenant ID'))

            if not tenant_id and not ihs_id:
                continue

            tenant_key = tenant_id.upper() if tenant_id else ''
            ihs_key = ihs_id.upper() if ihs_id else ''

            # Find matching Site record
            site = None
            if tenant_key and tenant_key in existing_by_ihs:
                site = existing_by_ihs[tenant_key]
            elif ihs_key and ihs_key in existing_by_mtn:
                site = existing_by_mtn[ihs_key]
            elif ihs_key and ihs_key in existing_by_ihs:
                site = existing_by_ihs[ihs_key]
            elif tenant_key and tenant_key in existing_by_mtn:
                site = existing_by_mtn[tenant_key]

            # Extract specs
            efs_name = clean_str(row_dict.get('EFS Name'))
            efs_phone = clean_phone(row_dict.get('EFS Phone'))
            rto_name = clean_str(row_dict.get('RTO Name'))
            rto_phone = clean_phone(row_dict.get('RTO Phone'))
            smc = clean_str(row_dict.get('SMC'))
            sub_sbc = clean_str(row_dict.get('Sub SMC'))
            smc_fse_name = clean_str(row_dict.get('SMC FSE Name'))
            smc_fse_phone = clean_phone(row_dict.get('SMC FSE Phone'))
            smc_rto_name = clean_str(row_dict.get('SMC RTO Name'))
            smc_rto_phone = clean_phone(row_dict.get('SMC RTO Phone'))
            smc_hoo_name = clean_str(row_dict.get('SMC HOO Name'))
            smc_hoo_phone = clean_phone(row_dict.get('SMC HOO Phone'))
            site_address = clean_str(row_dict.get('Site Address'))
            sub_region = clean_str(row_dict.get('Tenant Sub Region'))
            op_status = clean_str(row_dict.get('Tenant Operational Status')) or 'On Air'

            raw_dict = {}
            for k, v in row_dict.items():
                if v is not None:
                    val_str = clean_str(v)
                    if val_str:
                        raw_dict[k] = val_str

            # Add normalized aliases into raw_dict
            raw_dict.update({
                'IHS Site ID': ihs_id,
                'Tenant ID': tenant_id,
                'Tower Co ID': ihs_id,
                'Tower Co': smc,
                'Tower Co SBC 1': sub_sbc,
                'Project MANAGER': efs_name,
                'Project MANAGER CONTACT': efs_phone,
                'RPM(MS SITE)': rto_name,
                'RPM(MS SITE) CONTACT': rto_phone,
                'FSE NAME': smc_fse_name,
                'FSE CONTACT NO.': smc_fse_phone,
                'Switch Engineer': smc_rto_name,
                'GM': smc_hoo_name,
                'GM Number': smc_hoo_phone,
                'Site Address': site_address,
                'EFS Name': efs_name,
                'EFS Phone': efs_phone,
                'RTO Name': rto_name,
                'RTO Phone': rto_phone,
                'SMC': smc,
                'Sub SMC': sub_sbc,
                'SMC FSE Name': smc_fse_name,
                'SMC FSE Phone': smc_fse_phone,
                'SMC RTO Name': smc_rto_name,
                'SMC RTO Phone': smc_rto_phone,
                'SMC HOO Name': smc_hoo_name,
                'SMC HOO Phone': smc_hoo_phone,
                'EFS Email': clean_str(row_dict.get('EFS Email')),
                'RTO Email': clean_str(row_dict.get('RTO Email')),
                'Head, Field Service': clean_str(row_dict.get('Head, Field Service')),
                'Head, Field Service Email': clean_str(row_dict.get('Head, Field Service Email')),
                'Head, Field Service Phone': clean_phone(row_dict.get('Head, Field Service Phone')),
                'Customer Experience Manager': clean_str(row_dict.get('Customer Experience Manager')),
                'Customer Experience Manager Email': clean_str(row_dict.get('Customer Experience Manager Email')),
                'Customer Experience Manager Phone': clean_phone(row_dict.get('Customer Experience Manager Phone')),
                'SMC FSE Email': clean_str(row_dict.get('SMC FSE Email')),
                'SMC RTO Email': clean_str(row_dict.get('SMC RTO Email')),
                'SMC HOO Email': clean_str(row_dict.get('SMC HOO Email')),
                'Tenant Region': clean_str(row_dict.get('Tenant Region')),
                'Tenant Sub Region': sub_region,
                'Tenant Operational Status': op_status,
            })

            if site:
                if ihs_id:
                    site.mtn_id = ihs_id
                if efs_name:
                    site.efs_name = efs_name
                if efs_phone:
                    site.efs_phone = efs_phone
                if rto_name:
                    site.rto_name = rto_name
                if rto_phone:
                    site.rto_phone = rto_phone
                if smc:
                    site.smc = smc
                if sub_sbc:
                    site.sub_sbc = sub_sbc

                # Keep the Existing SMC FSE Engineer as it was before the update
                if not site.smc_fse_name and smc_fse_name:
                    site.smc_fse_name = smc_fse_name
                if not site.smc_fse_phone and smc_fse_phone:
                    site.smc_fse_phone = smc_fse_phone

                # Ensure raw_dict preserves existing SMC FSE Engineer
                if site.smc_fse_name:
                    raw_dict['FSE NAME'] = site.smc_fse_name
                    raw_dict['FSE CONTACT NO.'] = site.smc_fse_phone
                    raw_dict['SMC FSE Name'] = site.smc_fse_name
                    raw_dict['SMC FSE Phone'] = site.smc_fse_phone

                if smc_rto_name:
                    site.smc_rto_name = smc_rto_name
                if smc_rto_phone:
                    site.smc_rto_phone = smc_rto_phone
                if smc_hoo_name:
                    site.smc_hoo_name = smc_hoo_name
                if smc_hoo_phone:
                    site.smc_hoo_phone = smc_hoo_phone
                if site_address:
                    site.site_address = site_address
                if sub_region and (not site.cluster_name or site.cluster_name in ['N/A', '']):
                    site.cluster_name = sub_region

                if not site.raw_data or not isinstance(site.raw_data, dict):
                    site.raw_data = {}
                site.raw_data.update(raw_dict)

                to_update.append(site)
                updated_count += 1
            else:
                # Brand new site to create
                excel_state = clean_str(row_dict.get('State'))
                if excel_state.lower() in ['abuja', 'fct']:
                    state = 'FCT'
                elif excel_state:
                    state = excel_state.upper()
                else:
                    state = 'FCT'

                default_sdm, default_phone = sdm_defaults.get(state, ('Chris Ogwara', '09065043549'))

                new_site = Site(
                    ihs_site_id=tenant_id or ihs_id,
                    mtn_id=ihs_id or tenant_id,
                    site_address=site_address,
                    state=state,
                    region='Abuja',
                    cluster_name=sub_region or 'Abuja',
                    operational_status=op_status,
                    efs_name=efs_name,
                    efs_phone=efs_phone,
                    rto_name=rto_name,
                    rto_phone=rto_phone,
                    smc=smc,
                    sub_sbc=sub_sbc,
                    smc_fse_name=smc_fse_name,
                    smc_fse_phone=smc_fse_phone,
                    smc_rto_name=smc_rto_name,
                    smc_rto_phone=smc_rto_phone,
                    smc_hoo_name=smc_hoo_name,
                    smc_hoo_phone=smc_hoo_phone,
                    sdm_name=default_sdm,
                    sdm_phone=default_phone,
                    raw_data=raw_dict,
                )
                to_create.append(new_site)
                created_count += 1
                if tenant_key:
                    existing_by_ihs[tenant_key] = new_site

        # Ensure sqlite timeout
        if 'sqlite' in connection.vendor:
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA busy_timeout = 30000;")

        self.stdout.write(f"Committing to database: {updated_count} updates, {created_count} new creations...")

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
            f"Successfully updated {updated_count} existing sites and added {created_count} new sites to Site Inventory & IHS Matrix Database!"
        ))
