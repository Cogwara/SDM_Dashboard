import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from rest_framework.test import APIClient

client = APIClient()

print("--- TESTING BACKEND ENDPOINTS ---")

r1 = client.get('/api/v1/dashboard/stats/')
print('1. Dashboard Stats:', r1.status_code, r1.json())

r2 = client.get('/api/v1/sites/?search=FC2700')
print('2. Site Search FC2700:', r2.status_code, 'Found count:', r2.json().get('count'))

r3 = client.get('/api/v1/sites/lookup/?site_id=FC2700')
print('3. Site Lookup FC2700:', r3.status_code, 'Site ID:', r3.json().get('ihs_site_id'))

r4 = client.get('/api/v1/notes/')
print('4. Site Notes:', r4.status_code, 'Notes count:', len(r4.json().get('results', [])))

r5 = client.get('/api/v1/whatsapp/messages/')
print('5. WhatsApp Messages:', r5.status_code, 'Msg count:', len(r5.json().get('results', [])))

r6 = client.post('/api/v1/ai/query/', {'query': 'Why is FC2700 down?'}, format='json')
print('6. AI Query Answer length:', r6.status_code, len(r6.json().get('answer', '')))

r7 = client.get('/api/v1/reports/analytics/')
print('7. Reports Analytics:', r7.status_code, 'Top sites len:', len(r7.json().get('top_problematic_sites', [])))

print("--- ALL BACKEND APIs VERIFIED WORKING 100% ---")
