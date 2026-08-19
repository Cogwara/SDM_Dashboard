import os
import openpyxl
from django.core.management.base import BaseCommand
from sites.models import Site, IHSFiberLink

class Command(BaseCommand):
    help = 'Import IHS Fiber Links from FCT Links.xlsx into database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=None,
            help='Path to FCT Links Excel file'
        )

    def handle(self, *args, **options):
        given_path = options.get('file')
        candidate_paths = [
            given_path,
            '/app/data/FCT Links.xlsx',
            '/home/mrchrys/SDM/working site distribution/Fiber/FCT Links.xlsx',
            'data/FCT Links.xlsx',
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'data', 'FCT Links.xlsx')
        ]

        file_path = None
        for p in candidate_paths:
            if p and os.path.exists(p):
                file_path = p
                break

        if not file_path:
            self.stderr.write(self.style.ERROR(f"File not found in candidate paths: {candidate_paths}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Loading IHS Fiber Links file: {file_path}..."))
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet = wb.active

        # Build site lookup map
        sites = Site.objects.all()
        site_lookup = {}
        for s in sites:
            site_lookup[s.ihs_site_id.upper()] = s
            if s.mtn_id:
                site_lookup[s.mtn_id.upper()] = s

        IHSFiberLink.objects.all().delete()

        created_count = 0
        matched_count = 0
        empty_count = 0

        for row in sheet.iter_rows(values_only=True):
            if not any(x is not None for x in row):
                empty_count += 1
                if empty_count > 10:
                    break
                continue
            empty_count = 0

            c_ref, seg_id, f_len = row[0], row[1], row[2]
            if str(c_ref).strip() == 'Cluster Ref.' or not seg_id:
                continue

            cluster_ref_str = str(c_ref).strip() if c_ref else ''
            segment_id_str = str(seg_id).strip()

            try:
                length_m = float(f_len) if f_len is not None else 0.0
            except (ValueError, TypeError):
                length_m = 0.0

            dist_km = round(length_m / 1000.0, 3)

            # Parse Site A and Site B from segment string like "FC5891-T5835" or "FC2432-FC2366"
            site_a_str = ''
            site_b_str = ''
            parts = segment_id_str.replace(' ', '-').split('-')
            parts = [p.strip().upper() for p in parts if p.strip()]
            if len(parts) >= 2:
                site_a_str = parts[0]
                site_b_str = parts[1]
            elif len(parts) == 1:
                site_a_str = parts[0]

            site_a_obj = site_lookup.get(site_a_str)
            site_b_obj = site_lookup.get(site_b_str)

            if site_a_obj or site_b_obj:
                matched_count += 1

            IHSFiberLink.objects.create(
                cluster_ref=cluster_ref_str,
                segment_id=segment_id_str,
                site_a=site_a_str,
                site_b=site_b_str,
                fibre_length_m=length_m,
                distance_km=dist_km,
                state='FCT',
                site_a_ref=site_a_obj,
                site_b_ref=site_b_obj
            )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully imported {created_count} IHS Fiber Links! "
                f"Matched with {matched_count} database site records."
            )
        )
