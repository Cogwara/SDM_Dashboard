import re
from datetime import datetime
from django.db.models import Q
from sites.models import Site, Notification
from notes.models import SiteTimeline
from .models import WhatsAppMessage

def parse_whatsapp_chat(chat_text, default_sender="WhatsApp Parser"):
    """
    Parses raw WhatsApp chat messages or paste log.
    Extracts Site IDs (e.g., FC2700, FC2437), engineer names, ETAs, timestamps, and fault categories.
    """
    lines = chat_text.strip().split('\n')
    results = []
    
    # Common site pattern FC followed by numbers, or 3-5 alphanumeric characters
    site_pattern = re.compile(r'\b(FC\d{3,5}|ABJ\d{3,5}|FCT\d{3,5}|AB\d{3,5})\b', re.IGNORECASE)
    
    for line in lines:
        if not line.strip():
            continue

        site_matches = site_pattern.findall(line)
        detected_site_ids = list(set([s.upper() for s in site_matches]))
        
        # Extracts Engineer name patterns e.g. "FSE Engr John", "Engr. Musa", "Engineer Okon"
        engr_match = re.search(r'\b(Engr\.?|Engineer|FSE)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', line, re.IGNORECASE)
        extracted_engineer = engr_match.group(0) if engr_match else ""

        # Extract ETA
        eta_match = re.search(r'\bETA[:\s]*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?|[0-9]{1,2}\s*(?:mins|hours|hrs))', line, re.IGNORECASE)
        extracted_eta = eta_match.group(1) if eta_match else ""

        # Extract Arrival time
        arr_match = re.search(r'\b(Arrival|Arrived|On site)[:\s]*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)', line, re.IGNORECASE)
        extracted_arrival = arr_match.group(2) if arr_match else ""

        # Extract Restoration time
        rest_match = re.search(r'\b(Restored|Restoration|Up)[:\s]*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)', line, re.IGNORECASE)
        extracted_restoration = rest_match.group(2) if rest_match else ""

        # Issue categories
        line_lower = line.lower()
        has_power = any(w in line_lower for w in ['power', 'phcn', 'grid', 'commercial power', 'nepa', 'outage'])
        has_gen = any(w in line_lower for w in ['generator', 'dg', 'diesel generator', 'crank', 'starter', 'alternator', 'radiator'])
        has_fuel = any(w in line_lower for w in ['fuel', 'diesel', 'litres', 'ltrs', 'refuel', 'dry tank'])
        has_battery = any(w in line_lower for w in ['battery', 'batteries', 'rectifier', 'soc', 'voltage', '12v', '48v'])
        has_tx = any(w in line_lower for w in ['transmission', 'tx', 'microwave', 'link', 'flapping', 'fiber', 'rsl', 'mw'])

        if not detected_site_ids:
            # Save unassigned message or store as general update
            msg = WhatsAppMessage.objects.create(
                message_text=line.strip(),
                sender_name=default_sender,
                extracted_engineer=extracted_engineer,
                extracted_eta=extracted_eta,
                extracted_arrival_time=extracted_arrival,
                extracted_restoration_time=extracted_restoration,
                has_power_issue=has_power,
                has_generator_issue=has_gen,
                has_fuel_issue=has_fuel,
                has_battery_issue=has_battery,
                has_transmission_issue=has_tx,
            )
            results.append(msg)
        else:
            for s_id in detected_site_ids:
                site_obj = Site.objects.filter(Q(ihs_site_id__iexact=s_id) | Q(mtn_id__iexact=s_id)).first()
                msg = WhatsAppMessage.objects.create(
                    site=site_obj,
                    site_id_str=s_id,
                    message_text=line.strip(),
                    sender_name=default_sender,
                    extracted_engineer=extracted_engineer,
                    extracted_customer_update=line.strip(),
                    extracted_eta=extracted_eta,
                    extracted_arrival_time=extracted_arrival,
                    extracted_restoration_time=extracted_restoration,
                    has_power_issue=has_power,
                    has_generator_issue=has_gen,
                    has_fuel_issue=has_fuel,
                    has_battery_issue=has_battery,
                    has_transmission_issue=has_tx,
                )
                results.append(msg)

                if site_obj:
                    # Link to timeline
                    SiteTimeline.objects.create(
                        site=site_obj,
                        event=f"WhatsApp Update: {s_id}",
                        details=line.strip()[:200],
                        author=extracted_engineer or default_sender
                    )

                    # Trigger alert if site mentioned frequently
                    today_mentions = WhatsAppMessage.objects.filter(site_id_str=s_id).count()
                    if today_mentions >= 5:
                        Notification.objects.get_or_create(
                            site=site_obj,
                            alert_type="Site Mentioned More Than 5 Times Today",
                            defaults={
                                "title": f"Frequent Incident Activity on {s_id}",
                                "message": f"{s_id} has been mentioned {today_mentions} times in WhatsApp chats today."
                            }
                        )

    return results
