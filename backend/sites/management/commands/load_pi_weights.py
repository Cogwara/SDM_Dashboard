import os
from datetime import datetime
from pyxlsb import open_workbook
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from sites.models import PIWeightageRecord, DailyAvailabilityRecord

DEFAULT_PI_WEIGHTAGE_PATH = "/home/mrchrys/SDM/PI weightage/31st of August..xlsb"

def to_float(v):
    if v is None:
        return 0.0
    try:
        s = str(v).strip().replace('%', '')
        return float(s)
    except (ValueError, TypeError):
        return 0.0

def load_pi_weights_from_file(file_path=DEFAULT_PI_WEIGHTAGE_PATH):
    """
    Parses the MTN PI Weightage XLSB file across 2G, 3G, 4G, and 5G sheets,
    and returns a high-performance lookup dict of PI weights.
    """
    if not os.path.exists(file_path):
        # Fallback paths
        possible_paths = [
            file_path,
            '/tmp/pi_weightage.xlsb',
            '/app/data/pi_weightage.xlsb',
            '/home/mrchrys/SDM/PI weightage/31st of August..xlsb'
        ]
        for p in possible_paths:
            if os.path.exists(p):
                file_path = p
                break

    if not os.path.exists(file_path):
        return {}

    pi_lookup = {}
    with open_workbook(file_path) as wb:
        for tech in ['2G', '3G', '4G', '5G']:
            if tech not in wb.sheets:
                continue
            with wb.get_sheet(tech) as sheet:
                rows = list(sheet.rows())
                if len(rows) < 3:
                    continue
                header = [str(c.v).strip().upper() if c.v is not None else '' for c in rows[1]]
                
                id_col = 0
                site_col = 1 if 'SITE' in header else 0
                status_col = header.index('STATUS') if 'STATUS' in header else 1
                state_col = [i for i, h in enumerate(header) if 'STATE' in h]
                state_col = state_col[0] if state_col else 3
                reg_col = [i for i, h in enumerate(header) if 'REGION' in h]
                reg_col = reg_col[0] if reg_col else 2
                terr_col = [i for i, h in enumerate(header) if 'TERR' in h and '% PI' not in h]
                terr_col = terr_col[0] if terr_col else 4
                cap_col = [i for i, h in enumerate(header) if any(k in h for k in ['CONFIGURED', 'ROP TIME', 'MEASUREMENT', 'TIME DURATION'])]
                cap_col = cap_col[0] if cap_col else 5
                tower_col = [i for i, h in enumerate(header) if 'TOWER' in h]
                tower_col = tower_col[0] if tower_col else 6

                nat_pi_col = [i for i, h in enumerate(header) if '% PI' in h and 'NAT' in h]
                nat_pi_col = nat_pi_col[0] if nat_pi_col else 7
                reg_pi_col = [i for i, h in enumerate(header) if '% PI' in h and 'REG' in h]
                reg_pi_col = reg_pi_col[0] if reg_pi_col else 8
                state_pi_col = [i for i, h in enumerate(header) if '% PI' in h and 'STATE' in h]
                state_pi_col = state_pi_col[0] if state_pi_col else 9
                terr_pi_col = [i for i, h in enumerate(header) if '% PI' in h and 'TERR' in h]
                terr_pi_col = terr_pi_col[0] if terr_pi_col else 10

                for r in rows[2:]:
                    vals = [c.v for c in r]
                    if not vals or vals[0] is None:
                        continue
                    elem_id = str(vals[id_col]).strip().upper()
                    site_id = str(vals[site_col]).strip().upper() if site_col < len(vals) and vals[site_col] else elem_id
                    
                    data_obj = {
                        'tech': tech,
                        'element_id': elem_id,
                        'site_id': site_id,
                        'status': str(vals[status_col]).strip() if status_col < len(vals) and vals[status_col] else 'Active',
                        'region': str(vals[reg_col]).strip().upper() if reg_col < len(vals) and vals[reg_col] else '',
                        'state': str(vals[state_col]).strip().upper() if state_col < len(vals) and vals[state_col] else '',
                        'territory': str(vals[terr_col]).strip().upper() if terr_col < len(vals) and vals[terr_col] else '',
                        'tower_co': str(vals[tower_col]).strip() if tower_col < len(vals) and vals[tower_col] else '',
                        'configured_capacity': to_float(vals[cap_col]) if cap_col < len(vals) else 0.0,
                        'pi_national': to_float(vals[nat_pi_col]) if nat_pi_col < len(vals) else 0.0,
                        'pi_region': to_float(vals[reg_pi_col]) if reg_pi_col < len(vals) else 0.0,
                        'pi_state': to_float(vals[state_pi_col]) if state_pi_col < len(vals) else 0.0,
                        'pi_territory': to_float(vals[terr_pi_col]) if terr_pi_col < len(vals) else 0.0,
                    }

                    # Index by (tech, elem_id) and (tech, site_id)
                    pi_lookup[(tech, elem_id)] = data_obj
                    if (tech, site_id) not in pi_lookup:
                        pi_lookup[(tech, site_id)] = data_obj

    return pi_lookup


class Command(BaseCommand):
    help = "Ingests MTN PI (Performance Index) Weightages and updates Daily Availability calculations."

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=DEFAULT_PI_WEIGHTAGE_PATH,
            help="Path to the PI Weightage XLSB file"
        )
        parser.add_argument(
            '--update-records',
            action='store_true',
            default=True,
            help="Also update existing DailyAvailabilityRecord table with PI weights"
        )

    def handle(self, *args, **options):
        file_path = options['file']
        update_records = options['update_records']

        self.stdout.write(f"📊 Loading PI Weightage from: {file_path}")
        pi_dict = load_pi_weights_from_file(file_path)

        if not pi_dict:
            self.stderr.write(self.style.ERROR(f"Could not load PI Weightage from {file_path}"))
            return

        self.stdout.write(f"Loaded {len(pi_dict)} PI weightage entries from spreadsheet.")

        # 1. Upsert into PIWeightageRecord model
        records_to_create = []
        seen_keys = set()

        for (tech, elem_id), data in pi_dict.items():
            if data['element_id'] != elem_id:
                continue
            key = (tech, elem_id)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            records_to_create.append(PIWeightageRecord(
                tech=data['tech'],
                element_id=data['element_id'],
                site_id=data['site_id'],
                status=data['status'],
                region=data['region'],
                state=data['state'],
                territory=data['territory'],
                tower_co=data['tower_co'],
                configured_capacity=data['configured_capacity'],
                pi_national=data['pi_national'],
                pi_region=data['pi_region'],
                pi_state=data['pi_state'],
                pi_territory=data['pi_territory']
            ))

        with transaction.atomic():
            PIWeightageRecord.objects.all().delete()
            PIWeightageRecord.objects.bulk_create(records_to_create, batch_size=5000)
            self.stdout.write(self.style.SUCCESS(f"✅ Created {len(records_to_create)} PIWeightageRecord entries in database."))

        # 2. Update DailyAvailabilityRecord table with weights in SQL batches
        if update_records:
            self.stdout.write("🔄 Syncing PI weights across DailyAvailabilityRecord table...")
            with connection.cursor() as cursor:
                # Fast direct SQL update using temp/batch table or direct queries
                cursor.execute("""
                    UPDATE sites_dailyavailabilityrecord
                    SET 
                        pi_national = (
                            SELECT p.pi_national 
                            FROM sites_piweightagerecord p 
                            WHERE p.tech = sites_dailyavailabilityrecord.tech 
                              AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                                   OR p.site_id = sites_dailyavailabilityrecord.site_id
                                   OR p.element_id = sites_dailyavailabilityrecord.element_name)
                            LIMIT 1
                        ),
                        pi_state = (
                            SELECT p.pi_state 
                            FROM sites_piweightagerecord p 
                            WHERE p.tech = sites_dailyavailabilityrecord.tech 
                              AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                                   OR p.site_id = sites_dailyavailabilityrecord.site_id
                                   OR p.element_id = sites_dailyavailabilityrecord.element_name)
                            LIMIT 1
                        ),
                        pi_region = (
                            SELECT p.pi_region 
                            FROM sites_piweightagerecord p 
                            WHERE p.tech = sites_dailyavailabilityrecord.tech 
                              AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                                   OR p.site_id = sites_dailyavailabilityrecord.site_id
                                   OR p.element_id = sites_dailyavailabilityrecord.element_name)
                            LIMIT 1
                        ),
                        pi_territory = (
                            SELECT p.pi_territory 
                            FROM sites_piweightagerecord p 
                            WHERE p.tech = sites_dailyavailabilityrecord.tech 
                              AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                                   OR p.site_id = sites_dailyavailabilityrecord.site_id
                                   OR p.element_id = sites_dailyavailabilityrecord.element_name)
                            LIMIT 1
                        ),
                        configured_capacity = (
                            SELECT p.configured_capacity 
                            FROM sites_piweightagerecord p 
                            WHERE p.tech = sites_dailyavailabilityrecord.tech 
                              AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                                   OR p.site_id = sites_dailyavailabilityrecord.site_id
                                   OR p.element_id = sites_dailyavailabilityrecord.element_name)
                            LIMIT 1
                        )
                    WHERE EXISTS (
                        SELECT 1 
                        FROM sites_piweightagerecord p 
                        WHERE p.tech = sites_dailyavailabilityrecord.tech 
                          AND (p.element_id = sites_dailyavailabilityrecord.site_id 
                               OR p.site_id = sites_dailyavailabilityrecord.site_id
                               OR p.element_id = sites_dailyavailabilityrecord.element_name)
                    );
                """)
            self.stdout.write(self.style.SUCCESS("✅ Successfully synced PI weightages across all Daily Availability records!"))
