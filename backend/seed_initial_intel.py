import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from sites.models import Site, Notification
from notes.models import SiteNote, SiteTimeline
from whatsapp.models import WhatsAppMessage

print("Seeding initial operational memory & field intel for key FCT sites...")

# Site 1: FC2700
fc2700 = Site.objects.filter(ihs_site_id='FC2700').first()
if not fc2700:
    fc2700 = Site.objects.create(
        ihs_site_id='FC2700',
        mtn_id='MTN_FC2700',
        cluster_name='Abuja Municipal',
        operational_status='Down',
        priority='P1',
        power_solution='Dual DG + Hybrid Solar',
        dg_capacity='20kVA',
        site_address='Central Business District, Abuja FCT',
        lga='AMAC',
        state='FCT',
        is_down=True,
        is_critical=True,
        has_generator_fault=True,
        has_battery_fault=True
    )

SiteNote.objects.get_or_create(
    site=fc2700,
    title="Commercial Power Outage & Generator Auto-start Failure",
    defaults={
        "description": "Grid power dropped at 08:30 AM. Generator failed to auto-crank due to weak starter battery. Field engineer Engr Ibrahim dispatched.",
        "category": "Generator",
        "priority": "Critical",
        "status": "In Progress",
        "created_by": "State Delivery Manager"
    }
)

SiteTimeline.objects.get_or_create(
    site=fc2700,
    event="Commercial Power Outage Reported",
    defaults={
        "details": "PHCN grid supply lost. Standby generator crank failed.",
        "author": "EFS - Engineer Team"
    }
)

WhatsAppMessage.objects.get_or_create(
    site=fc2700,
    site_id_str="FC2700",
    message_text="[08:45 AM] FSE Engr. Ibrahim on site at FC2700. Testing DG battery voltage (11.2V low). Battery booster attached, DG running now. ETA restoration 09:15 AM.",
    defaults={
        "sender_name": "Engr Ibrahim (SMC FSE)",
        "extracted_engineer": "Engr Ibrahim",
        "extracted_customer_update": "DG boosted and operational. Site back online.",
        "extracted_eta": "09:15 AM",
        "extracted_arrival_time": "08:45 AM",
        "extracted_restoration_time": "09:15 AM",
        "has_generator_issue": True,
        "has_battery_issue": True,
    }
)

# Site 2: FC2437
fc2437 = Site.objects.filter(ihs_site_id='FC2437').first()
if not fc2437:
    fc2437 = Site.objects.create(
        ihs_site_id='FC2437',
        mtn_id='MTN_FC2437',
        cluster_name='Gwarinpa Cluster',
        operational_status='Operational',
        priority='P2',
        power_solution='Grid + DG Backup',
        dg_capacity='15kVA',
        site_address='3rd Avenue Gwarinpa, Abuja',
        lga='AMAC',
        state='FCT'
    )

SiteNote.objects.get_or_create(
    site=fc2437,
    title="Transmission Link Flapping - Microwave Alignment",
    defaults={
        "description": "High RSL degradation observed on main transmission link. Tower team aligned dish antenna and tightened mounting brackets.",
        "category": "Transmission",
        "priority": "Medium",
        "status": "Resolved",
        "created_by": "State Delivery Manager"
    }
)

SiteTimeline.objects.get_or_create(
    site=fc2437,
    event="Microwave Link Re-aligned",
    defaults={
        "details": "RSL restored to -42dBm optimal signal level.",
        "author": "RTO - Transmission Engineer"
    }
)

# Site 3: FC1012
fc1012 = Site.objects.filter(ihs_site_id='FC1012').first()
if fc1012:
    SiteNote.objects.get_or_create(
        site=fc1012,
        title="Preventive Maintenance & Fuel Tank Refill",
        defaults={
            "description": "Routine 250-hour oil change and 500L diesel refuel performed.",
            "category": "Preventive Maintenance",
            "priority": "Low",
            "status": "Resolved",
            "created_by": "Field Operations Supervisor"
        }
    )

Notification.objects.get_or_create(
    site=fc2700,
    alert_type="Critical Site Mentioned",
    title="[Critical] Outage Reported on FC2700",
    message="FC2700 is currently DOWN due to Generator Auto-start failure."
)

print("Seeding complete successfully!")
