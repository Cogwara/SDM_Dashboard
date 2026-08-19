import os
import openpyxl
from django.core.management.base import BaseCommand
from sites.models import Site, HuaweiFiberLink

class Command(BaseCommand):
    help = 'Import Huawei Fiber Links from 2025 August Fiber Distribution (NOC Copy).xlsx'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='/home/mrchrys/SDM/working site distribution/Fiber/2025 August Fiber Distribution (NOC Copy).xlsx',
            help='Path to 2025 August Fiber Distribution NOC Copy file'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Loading Huawei Fiber Excel file: {file_path}..."))
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet = wb['HUAWEI'] if 'HUAWEI' in wb.sheetnames else wb.active

        # Build Site lookup map for fast matching
        sites = Site.objects.all()
        site_lookup = {}
        for s in sites:
            site_lookup[s.ihs_site_id.upper()] = s
            if s.mtn_id:
                site_lookup[s.mtn_id.upper()] = s
            if s.cascade:
                site_lookup[s.cascade.upper()] = s

        self.stdout.write(f"Pre-loaded {len(sites)} sites from database for Huawei Fiber matching.")

        # Clear old links to perform clean full import
        HuaweiFiberLink.objects.all().delete()

        created_count = 0
        matched_sites_count = 0
        empty_count = 0

        for row in sheet.iter_rows(values_only=True):
            if not any(x is not None for x in row):
                empty_count += 1
                if empty_count > 10:
                    break
                continue
            empty_count = 0

            # Header check
            if row[1] == 'State' or row[5] == ' List of Segment':
                continue

            row_padded = (list(row) + [None]*25)[:25]
            cluster, st, reg, sa, sb, seg, dist, net_type, old_fmp, maint_fmp = row_padded[:10]
            huawei_fsdm = row_padded[16] if len(row_padded) > 16 else None
            huawei_fsdm_num = row_padded[17] if len(row_padded) > 17 else None

            if not st and not seg and not sa and not sb:
                continue

            cluster_str = str(cluster).strip() if cluster and str(cluster) != '0' else ''
            state_str = str(st).strip().upper() if st else 'FCT'
            region_str = str(reg).strip() if reg else ''
            site_a_str = str(sa).strip().upper() if sa and str(sa) != '0' else ''
            site_b_str = str(sb).strip().upper() if sb and str(sb) != '0' else ''
            segment_str = str(seg).strip() if seg and str(seg) != '0' else f"{site_a_str} - {site_b_str}"
            
            try:
                distance_val = float(dist) if dist is not None else 0.0
            except (ValueError, TypeError):
                distance_val = 0.0

            net_type_str = str(net_type).strip() if net_type else 'NFE'
            old_fmp_str = str(old_fmp).strip() if old_fmp else ''
            maint_fmp_str = str(maint_fmp).strip() if maint_fmp else 'Huawei'
            fsdm_str = str(huawei_fsdm).strip() if huawei_fsdm else ''
            fsdm_num_str = str(huawei_fsdm_num).strip() if huawei_fsdm_num else ''

            site_a_obj = site_lookup.get(site_a_str)
            site_b_obj = site_lookup.get(site_b_str)

            if site_a_obj or site_b_obj:
                matched_sites_count += 1

            HuaweiFiberLink.objects.create(
                cluster_name=cluster_str,
                state=state_str,
                region=region_str,
                site_a=site_a_str,
                site_b=site_b_str,
                segment_name=segment_str,
                distance_km=distance_val,
                network_type=net_type_str,
                old_fmp=old_fmp_str,
                maintenance_fmp=maint_fmp_str,
                huawei_fsdm=fsdm_str,
                huawei_fsdm_number=fsdm_num_str,
                site_a_ref=site_a_obj,
                site_b_ref=site_b_obj
            )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully imported {created_count} Huawei Fiber Links across Nigeria! "
                f"Matched with {matched_sites_count} database site records."
            )
        )
