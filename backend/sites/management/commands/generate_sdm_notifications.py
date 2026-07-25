from django.core.management.base import BaseCommand
from sites.models import Site, Notification
import random

class Command(BaseCommand):
    help = 'Generates realistic operational notifications for all SDM Managers'

    def handle(self, *args, **options):
        # Fetch sites down or critical
        problem_sites = Site.objects.filter(is_down=True)
        if not problem_sites.exists():
            problem_sites = Site.objects.all()[:50]

        templates = [
            ("CRITICAL", "Site Down Telemetry Alert", "Automatic telemetry monitor detected complete power/radio loss at site {site_id}. FSE {fse} has been dispatched."),
            ("WARNING", "Low Fuel Level Escalation", "Generator fuel level critically low at {site_id} ({lga}). Immediate refueling required to prevent outage."),
            ("WARNING", "Commercial Power Failure", "Public utility grid power outage reported at {site_id}. Backup generator currently running."),
            ("CRITICAL", "Transmission Microwave Link Outage", "Microwave link down between site {site_id} and donor node. High impact on 4G LTE traffic."),
            ("INFO", "Preventive Maintenance Scheduled", "Routine monthly PM for generator & battery bank scheduled for site {site_id} on {sdm}'s portfolio."),
        ]

        created_count = 0
        for site in problem_sites[:40]:
            alert_type, title_prefix, msg_tmpl = random.choice(templates)
            
            title = f"[{alert_type}] {title_prefix} - {site.ihs_site_id}"
            message = msg_tmpl.format(
                site_id=site.ihs_site_id,
                lga=site.lga or 'FCT',
                fse=site.smc_fse_name or 'Field Engineer',
                sdm=site.sdm_name or 'SDM Manager'
            )

            notif, created = Notification.objects.get_or_create(
                site=site,
                title=title,
                defaults={
                    'message': message,
                    'alert_type': alert_type,
                    'is_read': False,
                }
            )
            if created:
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully generated {created_count} operational notifications for SDM portfolios!"))
