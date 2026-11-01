import os
from django.core.management.base import BaseCommand
from sites.kml_importer import parse_and_import_kml

class Command(BaseCommand):
    help = 'Import 4G/5G Telecom KML files into CellSector database and enrich Site coordinates'

    def add_arguments(self, parser):
        parser.add_argument(
            'kml_file',
            nargs='?',
            type=str,
            default='/app/data/kml/ABJ WK31 PRB.kmz',
            help='Path to the KML or KMZ file to import'
        )
        parser.add_argument(
            '--region',
            type=str,
            default='Abuja Region',
            help='Region name for the KML dataset'
        )

    def handle(self, *args, **options):
        kml_path = options['kml_file']
        region = options['region']

        if not os.path.exists(kml_path):
            candidates = [
                '/app/data/kml/ABJ WK31 PRB.kmz',
                '/home/mrchrys/projects/SDM_Dashboard/backend/data/kml/ABJ WK31 PRB.kmz',
                '/home/mrchrys/Downloads/WhatSie/ABJ WK31 PRB.kmz',
                '/home/mrchrys/projects/SDM_Dashboard/backend/data/kml/ABUJA REGION KML 07292026 (4G).kml',
                '/home/mrchrys/Downloads/WhatSie/ABUJA REGION KML 07292026 (4G).kml'
            ]
            for cand in candidates:
                if os.path.exists(cand):
                    kml_path = cand
                    break

        self.stdout.write(self.style.NOTICE(f"Parsing and importing KML/KMZ from: {kml_path}"))
        res = parse_and_import_kml(kml_path, region_name=region)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully imported {res['total_sectors']} cell sectors across {res['unique_sites']} sites "
            f"({res['matched_sites']} matched in DB). Updated coordinates on {res['updated_sites_coords']} sites."
        ))
