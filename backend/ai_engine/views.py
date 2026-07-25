import os
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q, Count
from sites.models import Site
from notes.models import SiteNote, SiteTimeline, SiteAttachment
from whatsapp.models import WhatsAppMessage

class AIAssistantView(APIView):
    def post(self, request):
        query = request.data.get('query', '').strip()
        site_id = request.data.get('site_id', '').strip()
        function = request.data.get('function', 'chat') # chat, summarize, rca, whatsapp_summary, timeline, recurring_faults, predict, repeat_outages, executive_report

        if not query and not site_id:
            return Response({'error': 'Please provide a prompt or site ID.'}, status=status.HTTP_400_BAD_REQUEST)

        # Detect Site ID from prompt first (prompt explicit site ID ALWAYS takes precedence over pre-filled input)
        site_match = re.search(r'\b(FC\d{3,5}|ABJ\d{3,5}|FCT\d{3,5})\b', query, re.IGNORECASE)
        if site_match:
            site_id = site_match.group(1).upper()

        site_obj = None
        if site_id:
            site_obj = Site.objects.filter(
                Q(ihs_site_id__iexact=site_id) | 
                Q(mtn_id__iexact=site_id) |
                Q(ihs_site_id__icontains=site_id) |
                Q(mtn_id__icontains=site_id)
            ).first()

        # Detect search or report intents
        is_search_report_request = (
            function in ['search_and_report', 'search', 'report', 'executive_report'] or
            any(w in query.lower() for w in ['search', 'report', 'pick', 'find note', 'generate report', 'write a report'])
        )

        # Search notes if query provided
        matching_notes = []
        matching_sites = []
        if (is_search_report_request or query) and not site_obj:
            clean_q = re.sub(r'\b(search|notes?|and|pick|site|id|write|report|for|the|with|about|find|show|a|what|caused|failure|why|is|down)\b', '', query, flags=re.IGNORECASE).strip()
            if clean_q:
                matching_notes = list(SiteNote.objects.filter(
                    Q(site__ihs_site_id__icontains=clean_q) |
                    Q(site__mtn_id__icontains=clean_q) |
                    Q(site__cluster_name__icontains=clean_q) |
                    Q(title__icontains=clean_q) |
                    Q(description__icontains=clean_q) |
                    Q(category__icontains=clean_q) |
                    Q(created_by__icontains=clean_q)
                ).select_related('site').prefetch_related('attachments')[:20])

                # Get unique matching sites
                site_ids = list(set([n.site.ihs_site_id for n in matching_notes if n.site]))
                matching_sites = list(Site.objects.filter(ihs_site_id__in=site_ids))

        # Only fall back to matching_sites if user did NOT specify a site_id in prompt/input
        if not site_id and not site_obj and matching_sites:
            site_obj = matching_sites[0]

        notes = []
        timelines = []
        whatsapp_msgs = []
        attachments = []

        if site_obj:
            notes = list(SiteNote.objects.filter(site=site_obj).prefetch_related('attachments').values(
                'id', 'title', 'description', 'category', 'priority', 'status', 'created_by', 'created_at', 'updated_at'
            ))
            # Attach photo attachment details for each note
            note_attachments = SiteAttachment.objects.filter(site=site_obj).values('note_id', 'file', 'file_name', 'file_type')
            att_map = {}
            for att in note_attachments:
                att_map.setdefault(att['note_id'], []).append(att)
            for n in notes:
                n['photos'] = att_map.get(n['id'], [])

            timelines = list(SiteTimeline.objects.filter(site=site_obj).values('event', 'details', 'author', 'created_at'))
            whatsapp_msgs = list(WhatsAppMessage.objects.filter(Q(site=site_obj) | Q(site_id_str__iexact=site_obj.ihs_site_id)).values('sender_name', 'message_text', 'extracted_engineer', 'extracted_eta', 'created_at'))
            attachments = list(SiteAttachment.objects.filter(site=site_obj).values('file_name', 'file_type', 'uploaded_at'))

        # Check OpenAI Key
        openai_key = os.environ.get('OPENAI_API_KEY', None)
        if openai_key:
            try:
                import openai
                client = openai.OpenAI(api_key=openai_key)
                system_prompt = (
                    "You are the FCT SDM AI Operations Specialist for telecom infrastructure in Abuja/FCT region. "
                    "Search SDM notes, analyze operational history, WhatsApp chats, and timelines, and write comprehensive executive site reports."
                )
                context_str = f"Target Site Context: {site_obj.ihs_site_id if site_obj else site_id if site_id else 'All FCT Sites'}\n"
                context_str += f"Search Query: {query}\nMatching Notes Found: {len(matching_notes)}\n"
                context_str += f"Notes: {notes}\nTimeline: {timelines}\nWhatsApp Messages: {whatsapp_msgs}\nAttachments: {attachments}"
                
                completion = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Context:\n{context_str}\n\nTask: Answer user query or write detailed report for target site ({site_obj.ihs_site_id if site_obj else site_id})."}
                    ]
                )
                ai_answer = completion.choices[0].message.content
                return Response({
                    'answer': ai_answer,
                    'site_id': site_obj.ihs_site_id if site_obj else site_id,
                    'source': 'OpenAI GPT'
                })
            except Exception as e:
                pass # Fallback to Heuristic AI Engine

        # Heuristic AI Engine
        answer = self.generate_heuristic_response(query, function, site_id, site_obj, notes, timelines, whatsapp_msgs, matching_notes, matching_sites)
        
        return Response({
            'answer': answer,
            'site_id': site_obj.ihs_site_id if site_obj else site_id,
            'source': 'FCT SDM Heuristic AI Engine'
        })

    def generate_heuristic_response(self, query, function, site_id, site_obj, notes, timelines, whatsapp_msgs, matching_notes=None, matching_sites=None):
        q_lower = query.lower()

        # If user explicitly searched for a site ID (e.g. FC5825) but it wasn't found in DB
        if site_id and not site_obj:
            return (
                f"### Site Query Result for `{site_id}`\n\n"
                f"⚠️ Site ID **{site_id}** was not found in the active FCT Site Database or SDM Notes Records.\n\n"
                f"Please verify the Site ID (e.g. `FC2700`, `FC2437`, `FC2032`, `FC1001`) or search using generic operational terms like *'generator'*, *'battery'*, or *'power outage'*."
            )

        # 1. Search & Write Report on Searched Site (takes precedence when function or query specifies report)
        if any(w in q_lower for w in ['search', 'report', 'pick']) or function in ['search_and_report', 'report', 'executive_report']:
            if site_obj:
                return self.generate_executive_site_report(site_obj, notes, timelines, whatsapp_msgs, matching_notes, matching_sites)
            elif matching_notes:
                # Group matching notes by site
                res = "### 🔍 SDM Operational Notes Search Results\n\n"
                res += f"Found **{len(matching_notes)} matching note(s)** across **{len(matching_sites)} site(s)**:\n\n"
                for site in matching_sites:
                    s_notes = [n for n in matching_notes if n.site_id == site.id]
                    res += f"- 📡 **Site ID**: `{site.ihs_site_id}` ({site.cluster_name}) &bull; **{len(s_notes)} Note(s)** &bull; Status: `{site.operational_status}`\n"
                    for sn in s_notes[:2]:
                        res += f"  - *[{sn.category} - {sn.priority}]*: **{sn.title}** (by {sn.created_by})\n"
                
                # Pick the top site and generate report
                top_site = matching_sites[0]
                top_notes = list(SiteNote.objects.filter(site=top_site).values('id', 'title', 'description', 'category', 'priority', 'status', 'created_by', 'created_at', 'updated_at'))
                top_timelines = list(SiteTimeline.objects.filter(site=top_site).values('event', 'details', 'author', 'created_at'))
                top_wa = list(WhatsAppMessage.objects.filter(Q(site=top_site) | Q(site_id_str__iexact=top_site.ihs_site_id)).values('sender_name', 'message_text', 'extracted_engineer', 'extracted_eta', 'created_at'))
                
                res += "\n---\n\n"
                res += f"### 📊 Auto-Generated Report for Top Searched Site: `{top_site.ihs_site_id}`\n\n"
                res += self.generate_executive_site_report(top_site, top_notes, top_timelines, top_wa)
                return res

        # 2. RCA Function
        if (function == 'rca' or 'rca' in q_lower) and site_obj:
            res = f"### 🔬 ROOT CAUSE ANALYSIS (RCA) FOR SITE `{site_obj.ihs_site_id}` ({site_obj.mtn_id})\n\n"
            res += f"- **Cluster**: {site_obj.cluster_name} | **Status**: `{site_obj.operational_status}`\n"
            res += f"- **Power Solution**: {site_obj.power_solution} | **DG Capacity**: {site_obj.dg_capacity}\n\n"
            res += "#### 1. Primary RCA Findings & Incidents:\n"
            if notes:
                for idx, n in enumerate(notes, 1):
                    res += f"{idx}. **[{n['category']} - {n['priority']}] {n['title']}** (Status: `{n['status']}`)\n   {n['description']}\n"
            else:
                res += "*No SDM notes logged yet for this site.*\n"
            if whatsapp_msgs:
                res += "\n#### 2. WhatsApp Field Intel Logs:\n"
                for w in whatsapp_msgs[:3]:
                    res += f"- **{w['sender_name']}**: {w['message_text']}\n"
            res += "\n#### 3. Corrective & Preventive Action (CAPA):\n"
            res += f"1. Dispatch SMC FSE ({site_obj.smc_fse_name or 'FSE'}) to conduct site health check.\n"
            res += f"2. EFS Lead ({site_obj.efs_name or 'EFS'}) to audit DG starter motor, fuel lines, and battery bank.\n"
            return res

        # 3. WhatsApp Summary Function
        if (function == 'whatsapp_summary' or 'whatsapp' in q_lower) and site_obj:
            res = f"### 💬 WHATSAPP FIELD INTEL SUMMARY FOR SITE `{site_obj.ihs_site_id}`\n\n"
            res += f"Found **{len(whatsapp_msgs)} WhatsApp message(s)** linked to site `{site_obj.ihs_site_id}`:\n\n"
            if whatsapp_msgs:
                for w in whatsapp_msgs:
                    dt_str = w['created_at'].strftime('%d/%m/%Y %H:%M') if hasattr(w['created_at'], 'strftime') else str(w['created_at'])[:16]
                    res += f"- **[{dt_str}] {w['sender_name']}**: {w['message_text']}"
                    if w['extracted_eta']:
                        res += f" *(ETA: {w['extracted_eta']})*"
                    res += "\n"
            else:
                res += "*No WhatsApp messages linked to this site.*\n"
            return res

        # 4. Timeline Function
        if (function == 'timeline' or 'timeline' in q_lower) and site_obj:
            res = f"### ⏱️ OPERATIONAL TIMELINE FOR SITE `{site_obj.ihs_site_id}`\n\n"
            res += f"Found **{len(timelines)} milestone timeline event(s)**:\n\n"
            if timelines:
                for t in timelines:
                    dt_str = t['created_at'].strftime('%d/%m/%Y %H:%M') if hasattr(t['created_at'], 'strftime') else str(t['created_at'])[:16]
                    res += f"- **[{dt_str}] {t['event']}** (by {t['author']}): {t['details']}\n"
            else:
                res += "*No milestone timeline events recorded for this site yet.*\n"
            return res

        # 5. Recurring Faults & Repeat Outages Function
        if (function in ['recurring_faults', 'repeat_outages'] or 'recurring' in q_lower or 'repeat' in q_lower) and site_obj:
            res = f"### ⚡ RECURRING FAULT & REPEAT OUTAGE ANALYSIS FOR SITE `{site_obj.ihs_site_id}`\n\n"
            res += f"- **Total Operational Notes Logged**: {len(notes)}\n"
            categories = list(set([n.get('category') for n in notes if n.get('category')]))
            res += f"- **Fault Categories Recorded**: {', '.join(categories) if categories else 'None'}\n\n"
            if notes:
                res += "#### Incident Frequency Breakdown:\n"
                for n in notes:
                    res += f"- **[{n['category']} - {n['priority']}]**: {n['title']} (Status: `{n['status']}`)\n"
            else:
                res += "*No repeat outage logs recorded for this site.*\n"
            return res

        # 6. Predict Future Faults Function
        if (function == 'predict' or 'predict' in q_lower) and site_obj:
            res = f"### 🔮 PREDICTIVE MAINTENANCE & FAULT RISK BRIEFING FOR SITE `{site_obj.ihs_site_id}`\n\n"
            res += f"- **Site Power Solution**: {site_obj.power_solution} | **DG Capacity**: {site_obj.dg_capacity}\n"
            res += f"- **Priority Class**: {site_obj.priority} | **Cluster**: {site_obj.cluster_name}\n\n"
            res += "#### Risk Factors & Recommendations:\n"
            res += f"1. ⚠️ **Power System Reliability**: High risk of outage during grid collapse if DG starter battery drops below 12.4V.\n"
            res += f"2. 🛢️ **Preventive Maintenance**: Schedule PM service for {site_obj.dg_capacity} generator within the next 7 days.\n"
            res += f"3. 📡 **Field Support**: SMC FSE ({site_obj.smc_fse_name or 'N/A'}) to verify rectifier float voltage on next site visit.\n"
            return res

        # 7. Outage Cause / Failure Reason Query
        if any(w in q_lower for w in ['why is', 'down', 'what caused', 'cause', 'failure', 'reason']) and site_obj:
            if not notes and not whatsapp_msgs:
                return f"### Site Operational Status for **{site_obj.ihs_site_id}**\n\n- **Current Status**: {site_obj.operational_status}\n- **Power Solution**: {site_obj.power_solution}\n- **DG Capacity**: {site_obj.dg_capacity}\n- **Address**: {site_obj.site_address}\n\n*No recent active outage logs or WhatsApp updates recorded for this site yet.*"
            
            latest_note = notes[0] if notes else None
            latest_wa = whatsapp_msgs[0] if whatsapp_msgs else None

            res = f"### Root Cause & Outage Summary for **{site_obj.ihs_site_id}** ({site_obj.mtn_id})\n\n"
            res += f"- **Current Operational Status**: `{site_obj.operational_status}`\n"
            res += f"- **Cluster**: {site_obj.cluster_name} | **Priority**: {site_obj.priority}\n"
            res += f"- **Power Solution**: {site_obj.power_solution} | **DG Capacity**: {site_obj.dg_capacity}\n\n"

            if latest_note:
                res += f"#### 📝 Latest Logged SDM Note:\n"
                res += f"- **Title**: {latest_note['title']}\n"
                res += f"- **Category**: `{latest_note['category']}` | **Priority**: `{latest_note['priority']}` | **Status**: `{latest_note['status']}`\n"
                res += f"- **Description**: {latest_note['description']}\n"
                res += f"- **Logged By**: {latest_note['created_by']}\n\n"

            if latest_wa:
                res += f"#### 💬 Latest WhatsApp Field Intel:\n"
                res += f"- **Engineer / Sender**: {latest_wa['extracted_engineer'] or latest_wa['sender_name']}\n"
                res += f"- **ETA**: {latest_wa['extracted_eta'] or 'N/A'}\n"
                res += f"- **Message**: {latest_wa['message_text']}\n\n"

            if len(notes) > 1:
                res += f"#### 📚 Total Historical SDM Notes: {len(notes)} records logged.\n"

            return res

        # 8. Summarize Site History
        if ('everything' in q_lower or 'summarize' in q_lower or function == 'summarize') and site_obj:
            res = f"### Complete Operational Memory for Site **{site_obj.ihs_site_id}**\n\n"
            res += f"**Site Configuration**: {site_obj.site_configuration} | **Power**: {site_obj.power_solution} | **DG**: {site_obj.dg_capacity}\n"
            res += f"**Location**: {site_obj.site_address}, {site_obj.lga}, {site_obj.state}\n\n"
            
            res += f"#### Operational Notes ({len(notes)}):\n"
            if notes:
                for n in notes:
                    res += f"- **[{n['created_at'].strftime('%Y-%m-%d %H:%M') if hasattr(n['created_at'], 'strftime') else str(n['created_at'])[:16]}] {n['title']}** ({n['category']})\n  {n['description']}\n"
            else:
                res += "*No operational notes logged yet.*\n"

            res += f"\n#### WhatsApp Field Intel ({len(whatsapp_msgs)}):\n"
            if whatsapp_msgs:
                for w in whatsapp_msgs:
                    res += f"- **{w['sender_name']}**: {w['message_text']}\n"
            else:
                res += "*No WhatsApp messages linked.*\n"

            return res

        # 3. Who worked on [Site]?
        if 'who worked' in q_lower or 'engineer' in q_lower:
            if site_obj:
                engineers = set()
                if site_obj.smc_fse_name: engineers.add(f"{site_obj.smc_fse_name} (SMC FSE - {site_obj.smc_fse_phone})")
                if site_obj.efs_name: engineers.add(f"{site_obj.efs_name} (EFS - {site_obj.efs_phone})")
                if site_obj.rto_name: engineers.add(f"{site_obj.rto_name} (RTO - {site_obj.rto_phone})")
                if site_obj.mtn_fse_name: engineers.add(f"{site_obj.mtn_fse_name} (MTN FSE - {site_obj.mtn_fse_phone})")
                for w in whatsapp_msgs:
                    if w['extracted_engineer']: engineers.add(w['extracted_engineer'])
                
                res = f"### Personnel & Engineers for **{site_obj.ihs_site_id}**\n\n"
                for e in engineers:
                    res += f"- 👷 {e}\n"
                return res

        # 4. Generator failures / Power failures across FCT
        if 'generator' in q_lower or 'power' in q_lower or 'battery' in q_lower or 'repeat' in q_lower or 'problematic' in q_lower:
            gen_notes = SiteNote.objects.filter(category='Generator')
            pwr_notes = SiteNote.objects.filter(category='Power')
            bat_notes = SiteNote.objects.filter(category='Battery')

            res = "### FCT Fault & Outage Analytics Briefing\n\n"
            res += f"- **Generator Fault Logs**: {gen_notes.count()}\n"
            res += f"- **Commercial Power Outages**: {pwr_notes.count()}\n"
            res += f"- **Battery & Rectifier Issues**: {bat_notes.count()}\n\n"

            problem_sites = SiteNote.objects.values('site__ihs_site_id').annotate(fault_count=Count('id')).order_by('-fault_count')[:5]
            if problem_sites:
                res += "#### Top Sites with Repeated Incidents:\n"
                for p in problem_sites:
                    res += f"- **Site {p['site__ihs_site_id']}**: {p['fault_count']} total recorded incidents\n"

            return res

        # Default General AI Response
        total_sites = Site.objects.count()
        down_sites = Site.objects.filter(is_down=True).count()
        notes_count = SiteNote.objects.count()
        wa_count = WhatsAppMessage.objects.count()

        return (
            f"### FCT Telecom SDM AI Operations Briefing\n\n"
            f"Hello! I am your AI Operations Specialist for the Federal Capital Territory (FCT).\n\n"
            f"**Current Network Status Summary:**\n"
            f"- 📡 **Total FCT Sites Managed**: {total_sites}\n"
            f"- 🚨 **Active Down Sites**: {down_sites}\n"
            f"- 📝 **Operational SDM Notes**: {notes_count}\n"
            f"- 💬 **WhatsApp Intel Updates**: {wa_count}\n\n"
            f"You can ask me questions like:\n"
            f"- *\"Search SDM notes for generator failures and write a report on FC2700\"*\n"
            f"- *\"Search notes for battery swap and write a site report\"*\n"
            f"- *\"Why is FC2700 down?\"*\n"
            f"- *\"Show everything that happened at FC2437.\"*\n"
            f"- *\"Who worked on FC2700?\"*"
        )

    def generate_executive_site_report(self, site_obj, notes, timelines, whatsapp_msgs, matching_notes=None, matching_sites=None):
        op_status_badge = "🔴 DOWN / CRITICAL" if site_obj.is_down or site_obj.operational_status == 'Down' else "🟢 UP / DEGRADED" if site_obj.operational_status == 'Degraded' else "🟢 ONLINE / HEALTHY"

        open_notes = [n for n in notes if n.get('status') != 'Resolved']
        resolved_notes = [n for n in notes if n.get('status') == 'Resolved']
        categories = list(set([n.get('category') for n in notes if n.get('category')]))

        report = f"# 📑 SDM EXECUTIVE SITE OPERATIONAL REPORT\n"
        report += f"**Site ID**: `{site_obj.ihs_site_id}` | **MTN ID**: `{site_obj.mtn_id}` | **Cluster**: {site_obj.cluster_name}\n"
        report += f"**SDM Manager**: {site_obj.sdm_name} | **Operational Status**: {op_status_badge}\n"
        report += f"**Location**: {site_obj.site_address}, {site_obj.lga}, {site_obj.state}\n\n"

        report += "---\n\n"
        report += "## 📊 1. Executive Incident Summary\n"
        report += f"- **Total Logged SDM Notes**: {len(notes)} ({len(open_notes)} Open / {len(resolved_notes)} Resolved)\n"
        report += f"- **Primary Categories**: {', '.join(categories) if categories else 'General'}\n"
        report += f"- **WhatsApp Field Intel Logs**: {len(whatsapp_msgs)} updates linked\n"
        report += f"- **Operational Timelines Logged**: {len(timelines)} milestone events\n\n"

        report += "---\n\n"
        report += "## 🏗️ 2. Site Technical Infrastructure Profile\n"
        report += f"- **Site Configuration**: {site_obj.site_configuration}\n"
        report += f"- **Power Solution**: {site_obj.power_solution} | **DG Capacity**: {site_obj.dg_capacity}\n"
        report += f"- **Site Priority Class**: {site_obj.priority}\n"
        report += f"- **Assigned Field Operations Team**:\n"
        report += f"  - 👷 **SMC FSE**: {site_obj.smc_fse_name or 'N/A'} ({site_obj.smc_fse_phone or 'N/A'})\n"
        report += f"  - 👷 **EFS Technical Lead**: {site_obj.efs_name or 'N/A'} ({site_obj.efs_phone or 'N/A'})\n"
        report += f"  - 👷 **RTO Officer**: {site_obj.rto_name or 'N/A'} ({site_obj.rto_phone or 'N/A'})\n"
        report += f"  - 👷 **MTN FSE**: {site_obj.mtn_fse_name or 'N/A'} ({site_obj.mtn_fse_phone or 'N/A'})\n\n"

        report += "---\n\n"
        report += f"## 📝 3. SDM Operational Notes & Root Cause Records ({len(notes)})\n"
        if notes:
            for idx, n in enumerate(notes, 1):
                dt_str = n['created_at'].strftime('%d/%m/%Y %H:%M') if hasattr(n['created_at'], 'strftime') else str(n['created_at'])[:16]
                photos = n.get('photos', [])
                photo_str = f" | 📷 {len(photos)} Photo(s)" if photos else ""
                report += f"### {idx}. [{n['category']} - {n['priority']}] {n['title']} (Status: `{n['status']}`{photo_str})\n"
                report += f"- **Logged By**: {n['created_by']} &bull; **Created**: {dt_str}\n"
                report += f"- **Detailed Context**: {n['description']}\n"
                if photos:
                    report += f"- **Attached Field Evidence**: {', '.join([p['file_name'] for p in photos])}\n"
                report += "\n"
        else:
            report += "*No SDM operational notes recorded for this site yet.*\n\n"

        report += "---\n\n"
        report += f"## 💬 4. WhatsApp Technical Intel ({len(whatsapp_msgs)})\n"
        if whatsapp_msgs:
            for w in whatsapp_msgs[:5]:
                dt_str = w['created_at'].strftime('%d/%m/%Y %H:%M') if hasattr(w['created_at'], 'strftime') else str(w['created_at'])[:16]
                report += f"- **[{dt_str}] {w['sender_name']}**: {w['message_text']}"
                if w['extracted_eta']:
                    report += f" *(ETA: {w['extracted_eta']})*"
                report += "\n"
        else:
            report += "*No recent WhatsApp field messages linked to this site.*\n\n"

        report += "---\n\n"
        report += "## 💡 5. Root Cause Analysis (RCA) & Operational Diagnosis\n"
        if 'Power' in categories or 'Generator' in categories or 'Battery' in categories:
            report += f"Based on logged SDM notes, site `{site_obj.ihs_site_id}` has suffered repeated **power infrastructure instability**. The primary triggers include commercial grid outages coupled with generator starting failure and battery depletion.\n"
        elif 'Transmission' in categories or 'Microwave' in categories:
            report += f"Site `{site_obj.ihs_site_id}` exhibits **transmission & backhaul degradation**, likely caused by alignment shifts or optical fiber cuts on the microwave ring.\n"
        else:
            report += f"Site `{site_obj.ihs_site_id}` exhibits operational incidents primarily under category: **{', '.join(categories) if categories else 'General Outage'}**.\n"

        report += "\n---\n\n"
        report += "## 🎯 6. Recommended Action Plan & Prevention Strategy\n"
        report += f"1. ⚡ **Power System Overhaul**: Dispatch EFS Lead ({site_obj.efs_name or 'EFS'}) to audit DG starter motor, battery bank voltage, and automatic transfer switch (ATS).\n"
        report += f"2. 🛢️ **Fuel & Maintenance Audit**: Verify fuel level on-site and schedule preventive maintenance (PM) service for {site_obj.dg_capacity} generator.\n"
        report += f"3. 📱 **Field Coordination**: SMC FSE ({site_obj.smc_fse_name or 'FSE'}) to provide hourly ETA and progress updates via WhatsApp operational group.\n"

        return report
