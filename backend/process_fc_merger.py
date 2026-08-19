import os, re, django
import pandas as pd
from django.db import transaction
from django.db.models import Count, Q

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from sites.models import Site, Notification
from notes.models import SiteNote, SiteAttachment, SiteTimeline
from whatsapp.models import WhatsAppMessage

def run_fc_merger_and_sdm_update():
    f2 = r"/home/mrchrys/SDM/working site distribution/Huawei/WSD APRIL  2026 v 3.4-ABUJA REGION.xlsb"
    print(f"Reading File 2 for SDM names and FC site mapping: {f2}")
    
    sdm_map = {}
    if os.path.exists(f2):
        try:
            df2 = pd.read_excel(f2, engine='pyxlsb', sheet_name='WSD')
            print(f"File 2 total rows read: {len(df2)}")
            for idx, row in df2.iterrows():
                site_id_raw = str(row.get('SiteID', '')).strip().upper()
                if not site_id_raw or site_id_raw == 'NAN':
                    continue

                sdm_name = str(row.get('SDM NAME', '')).strip() if pd.notnull(row.get('SDM NAME')) else ''
                sdm_phone = str(row.get('SDM CONTACT NO. ', '')).strip() if pd.notnull(row.get('SDM CONTACT NO. ')) else ''
                if sdm_phone.endswith('.0'):
                    sdm_phone = sdm_phone[:-2]

                mtn_rdm_name = str(row.get('MTN RDM NAME', '')).strip() if pd.notnull(row.get('MTN RDM NAME')) else ''
                mtn_rdm_phone = str(row.get('MTN RDM CONTACT NO.', '')).strip() if pd.notnull(row.get('MTN RDM CONTACT NO.')) else ''
                mtn_fse_name = str(row.get('MTN FSE NAME', '')).strip() if pd.notnull(row.get('MTN FSE NAME')) else ''
                mtn_fse_phone = str(row.get('MTN FSE CONTACT NO.', '')).strip() if pd.notnull(row.get('MTN FSE CONTACT NO.')) else ''

                cluster_name = str(row.get('Site Cluster', '')).strip() if pd.notnull(row.get('Site Cluster')) else ''
                smc_fse_name = str(row.get('FSE NAME', '')).strip() if pd.notnull(row.get('FSE NAME')) else ''
                smc_fse_phone = str(row.get('FSE CONTACT NO.', '')).strip() if pd.notnull(row.get('FSE CONTACT NO.')) else ''
                
                lat = float(row.get('Lat')) if pd.notnull(row.get('Lat')) else None
                lng = float(row.get('Long')) if pd.notnull(row.get('Long')) else None

                sdm_map[site_id_raw] = {
                    'sdm_name': sdm_name,
                    'sdm_phone': sdm_phone,
                    'mtn_rdm_name': mtn_rdm_name,
                    'mtn_rdm_phone': mtn_rdm_phone,
                    'mtn_fse_name': mtn_fse_name,
                    'mtn_fse_phone': mtn_fse_phone,
                    'cluster_name': cluster_name,
                    'smc_fse_name': smc_fse_name,
                    'smc_fse_phone': smc_fse_phone,
                    'latitude': lat,
                    'longitude': lng,
                }
            print(f"Extracted SDM info for {len(sdm_map)} sites from File 2")
        except Exception as e:
            print("Error reading File 2:", e)

    # 1. Update SDM names for all FC sites in DB
    fc_sites = Site.objects.filter(ihs_site_id__istartswith='FC')
    print(f"Total FC series sites in DB before merge: {fc_sites.count()}")

    updated_sdm_count = 0
    with transaction.atomic():
        for site in fc_sites:
            s_id = site.ihs_site_id.upper()
            if s_id in sdm_map:
                info = sdm_map[s_id]
                changed = False
                if info['sdm_name'] and not site.sdm_name:
                    site.sdm_name = info['sdm_name']
                    changed = True
                if info['sdm_phone'] and not site.sdm_phone:
                    site.sdm_phone = info['sdm_phone']
                    changed = True
                if info['mtn_rdm_name'] and not site.mtn_rdm_name:
                    site.mtn_rdm_name = info['mtn_rdm_name']
                    changed = True
                if info['mtn_fse_name'] and not site.mtn_fse_name:
                    site.mtn_fse_name = info['mtn_fse_name']
                    changed = True
                if info['smc_fse_name'] and not site.smc_fse_name:
                    site.smc_fse_name = info['smc_fse_name']
                    changed = True
                if info['cluster_name'] and not site.cluster_name:
                    site.cluster_name = info['cluster_name']
                    changed = True
                if info['latitude'] and not site.latitude:
                    site.latitude = info['latitude']
                    changed = True
                if info['longitude'] and not site.longitude:
                    site.longitude = info['longitude']
                    changed = True
                
                if changed:
                    site.save()
                    updated_sdm_count += 1

    print(f"Enriched {updated_sdm_count} FC sites with SDM Name and Contact info")

    # 2. Search for Duplicate FC series site IDs (case-insensitive)
    all_fc = Site.objects.filter(ihs_site_id__istartswith='FC')
    fc_id_groups = {}
    for s in all_fc:
        norm_id = s.ihs_site_id.strip().upper()
        fc_id_groups.setdefault(norm_id, []).append(s)

    duplicate_groups = {k: v for k, v in fc_id_groups.items() if len(v) > 1}
    print(f"Found {len(duplicate_groups)} duplicate FC site ID groups in DB")

    merged_count = 0
    deleted_duplicates = 0

    with transaction.atomic():
        for norm_id, site_list in duplicate_groups.items():
            # Sort to pick primary site: highest completeness or lowest ID
            def score(site_obj):
                non_empty = sum(1 for field in site_obj._meta.fields if getattr(site_obj, field.name))
                return (non_empty, -site_obj.id)

            site_list.sort(key=score, reverse=True)
            primary_site = site_list[0]
            duplicates = site_list[1:]

            print(f"\nMerging duplicate FC Site ID '{norm_id}': Primary ID {primary_site.id}, Merging {len(duplicates)} duplicates...")

            for dup in duplicates:
                # Merge missing fields from duplicate to primary
                for field in primary_site._meta.fields:
                    f_name = field.name
                    if f_name in ['id', 'ihs_site_id', 'created_at', 'updated_at']:
                        continue
                    val_dup = getattr(dup, f_name)
                    val_pri = getattr(primary_site, f_name)
                    if val_dup and not val_pri:
                        setattr(primary_site, f_name, val_dup)

                # Re-link related objects
                SiteNote.objects.filter(site=dup).update(site=primary_site)
                SiteTimeline.objects.filter(site=dup).update(site=primary_site)
                SiteAttachment.objects.filter(site=dup).update(site=primary_site)
                WhatsAppMessage.objects.filter(site=dup).update(site=primary_site)
                Notification.objects.filter(site=dup).update(site=primary_site)

                # Delete secondary duplicate
                dup.delete()
                deleted_duplicates += 1

            primary_site.save()
            merged_count += 1

    print(f"\n--- FC SITE DEDUPLICATION & SDM MERGE COMPLETE ---")
    print(f"Master FC Site Groups Merged: {merged_count}")
    print(f"Duplicate Site Records Deleted: {deleted_duplicates}")
    print(f"Total FC Series Sites in DB Now: {Site.objects.filter(ihs_site_id__istartswith='FC').count()}")

if __name__ == '__main__':
    run_fc_merger_and_sdm_update()
