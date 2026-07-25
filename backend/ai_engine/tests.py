from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from sites.models import Site
from notes.models import SiteNote

class AIAssistantTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.site = Site.objects.create(
            ihs_site_id='FC1001',
            mtn_id='MTN1001',
            cluster_name='Abuja Central',
            sdm_name='Alice SDM',
            power_solution='Solar Hybrid + 20KVA DG',
            dg_capacity='20KVA'
        )
        self.note = SiteNote.objects.create(
            site=self.site,
            title='Generator Starter Motor Failure',
            description='Generator failed to crank during grid outage. Fuel level verified at 65%.',
            category='Generator',
            priority='High',
            status='Open',
            created_by='Alice SDM'
        )

    def test_ai_search_notes_and_write_report(self):
        url = '/api/v1/ai/query/'
        payload = {
            'query': 'Search notes for generator failure and write a report on FC1001',
            'function': 'search_and_report'
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('answer', response.data)
        self.assertEqual(response.data['site_id'], 'FC1001')
        
        answer = response.data['answer']
        self.assertIn('EXECUTIVE SITE OPERATIONAL REPORT', answer)
        self.assertIn('FC1001', answer)
        self.assertIn('Generator Starter Motor Failure', answer)
        self.assertIn('Root Cause Analysis', answer)
        self.assertIn('Action Plan', answer)

    def test_ai_query_explicit_prompt_site_override(self):
        url = '/api/v1/ai/query/'
        # Even if site_id is pre-filled as FC2032, query mentions FC1001 explicitly!
        payload = {
            'query': 'FC1001 what caused the failure',
            'site_id': 'FC2032'
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['site_id'], 'FC1001')
        self.assertIn('FC1001', response.data['answer'])
        self.assertNotIn('FC2032', response.data['answer'])

    def test_ai_functions_targeted_to_site_id(self):
        url = '/api/v1/ai/query/'
        funcs = ['rca', 'whatsapp_summary', 'timeline', 'recurring_faults', 'predict', 'summarize', 'executive_report']
        for fn in funcs:
            payload = {
                'query': '',
                'site_id': 'FC1001',
                'function': fn
            }
            response = self.client.post(url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['site_id'], 'FC1001')
            self.assertIn('FC1001', response.data['answer'])
