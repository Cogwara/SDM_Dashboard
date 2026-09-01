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
            default='/home/mrchrys/projects/SDM_Dashboard/backend/data/kml/ABUJA REGION KML 07292026 (4G).kml',
            help='Path to the KML file to import'
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
            alt_path = '/home/mrchrys/Downloads/WhatSie/ABUJA REGION KML 07292026 (4G).kml'
            if os.path.exists(alt_path):
                kml_path = alt_path

        self.stdout.write(self.style.NOTICE(f"Parsing and importing KML from: {kml_path}"))
        res = parse_and_import_kml(kml_path, region_name=region)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully imported {res['total_sectors']} cell sectors across {res['unique_sites']} sites "
            f"({res['matched_sites']} matched in DB). Updated coordinates on {res['updated_sites_coords']} sites."
        ))
