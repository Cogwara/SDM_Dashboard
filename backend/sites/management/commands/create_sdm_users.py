from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from sites.models import Site

class Command(BaseCommand):
    help = 'Creates Django user accounts for all real State Delivery Managers (SDMs)'

    def handle(self, *args, **options):
        sdm_records = Site.objects.values('sdm_name', 'sdm_phone').distinct().exclude(sdm_name='')
        
        self.stdout.write(f"Found {len(sdm_records)} unique SDM records in database.")

        created_count = 0
        for rec in sdm_records:
            sdm_name = rec['sdm_name'].strip()
            if not sdm_name or sdm_name.lower() == 'nan':
                continue

            username = sdm_name.lower().replace(' ', '_')
            first_name = sdm_name.split()[0]
            last_name = ' '.join(sdm_name.split()[1:]) if len(sdm_name.split()) > 1 else ''

            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': f"{username}@fcttelecom.ng",
                    'is_staff': True,
                }
            )
            
            # Set default password for all SDM managers
            user.set_password('password123')
            user.save()

            if created:
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully created {created_count} SDM user accounts! Default password: password123"))
