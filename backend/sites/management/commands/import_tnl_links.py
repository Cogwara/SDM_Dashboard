import os
import openpyxl
from django.core.management.base import BaseCommand
from sites.models import Site, TNLLink

class Command(BaseCommand):
    help = 'Import TNL June Distribution 2026 transmission links and cross-reference with Site database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=r'C:\Users\MrChrys\Documents\Huawei Documents\SItes\TNL June Distribution 2026.xlsx',
            help='Path to TNL Excel distribution file'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Loading TNL Excel file: {file_path}..."))
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet = wb['TNL']

        created_count = 0
        updated_count = 0
        matched_sites_count = 0

        # Build Site lookup map for fast matching
        sites = Site.objects.all()
        site_lookup = {}
        for s in sites:
            site_lookup[s.ihs_site_id.upper()] = s
            if s.mtn_id:
                site_lookup[s.mtn_id.upper()] = s
            if s.cascade:
                site_lookup[s.cascade.upper()] = s

        self.stdout.write(f"Pre-loaded {len(sites)} sites from database for TNL matching.")

        # Wipe old links to perform clean full import
        TNLLink.objects.all().delete()

        empty_count = 0
        for row in sheet.iter_rows(values_only=True):
            if not any(x is not None for x in row):
                empty_count += 1
                if empty_count > 10:
                    break
                continue
            empty_count = 0

            if row[1] == 'State' or row[5] == ' List of Segment':
                continue

            row_padded = (list(row) + [None]*10)[:10]
            cluster, st, reg, sa, sb, seg, dist, net_type, old_fmp, maint_fmp = row_padded

            if not st and not seg and not sa and not sb:
                continue

            state_str = str(st).strip().upper() if st else 'FCT'
            region_str = str(reg).strip() if reg else ''
            site_a_str = str(sa).strip().upper() if sa else ''
            site_b_str = str(sb).strip().upper() if sb else ''
            segment_str = str(seg).strip() if seg else f"{site_a_str} - {site_b_str}"
            
            try:
                distance_val = float(dist) if dist is not None else 0.0
            except (ValueError, TypeError):
                distance_val = 0.0

            net_type_str = str(net_type).strip() if net_type else ''
            old_fmp_str = str(old_fmp).strip() if old_fmp else ''
            maint_fmp_str = str(maint_fmp).strip() if maint_fmp else 'TNL'

            site_a_obj = site_lookup.get(site_a_str)
            site_b_obj = site_lookup.get(site_b_str)

            if site_a_obj or site_b_obj:
                matched_sites_count += 1

            tnl_obj = TNLLink.objects.create(
                state=state_str,
                region=region_str,
                site_a=site_a_str,
                site_b=site_b_str,
                segment_name=segment_str,
                distance_km=distance_val,
                network_type=net_type_str,
                old_fmp=old_fmp_str,
                maintenance_fmp=maint_fmp_str,
                site_a_ref=site_a_obj,
                site_b_ref=site_b_obj
            )
            created_count += 1

            # Update raw_data on Site A
            if site_a_obj:
                raw_data = site_a_obj.raw_data or {}
                raw_data['TNL Segment'] = segment_str
                raw_data['TNL Connected Site'] = site_b_str
                raw_data['TNL Link Distance km'] = distance_val
                raw_data['Maintenance FMP'] = maint_fmp_str
                raw_data['Old FMP'] = old_fmp_str
                site_a_obj.raw_data = raw_data
                site_a_obj.save(update_fields=['raw_data'])

            # Update raw_data on Site B
            if site_b_obj:
                raw_data = site_b_obj.raw_data or {}
                raw_data['TNL Segment'] = segment_str
                raw_data['TNL Connected Site'] = site_a_str
                raw_data['TNL Link Distance km'] = distance_val
                raw_data['Maintenance FMP'] = maint_fmp_str
                raw_data['Old FMP'] = old_fmp_str
                site_b_obj.raw_data = raw_data
                site_b_obj.save(update_fields=['raw_data'])

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully imported {created_count} TNL Transmission Links across Nigeria! "
                f"Matched with {matched_sites_count} database site records."
            )
        )
