from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from sites.models import Site
from notes.models import SiteNote, SiteTimeline

class SiteNoteUpdateTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.site = Site.objects.create(
            ihs_site_id='FC1001',
            mtn_id='MTN1001',
            cluster_name='Abuja Central',
            sdm_name='Alice SDM'
        )
        self.note = SiteNote.objects.create(
            site=self.site,
            title='Initial Outage Note',
            description='Power failure reported at site.',
            category='Power',
            priority='High',
            status='Open',
            created_by='Alice SDM'
        )

    def test_update_note_by_creator_success(self):
        url = f'/api/v1/notes/{self.note.id}/'
        payload = {
            'site_id_input': 'FC1001',
            'title': 'Resolved Outage Note',
            'description': 'Power restored via DG swap.',
            'category': 'Power',
            'priority': 'Medium',
            'status': 'Resolved',
            'updated_by': 'Alice SDM'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.note.refresh_from_db()
        self.assertEqual(self.note.title, 'Resolved Outage Note')
        self.assertEqual(self.note.status, 'Resolved')
        self.assertEqual(self.note.created_by, 'Alice SDM')

        # Check timeline event was created
        timeline_entry = SiteTimeline.objects.filter(site=self.site, event__icontains='SDM Note Updated').first()
        self.assertIsNotNone(timeline_entry)
        self.assertEqual(timeline_entry.author, 'Alice SDM')

    def test_update_note_by_non_creator_forbidden(self):
        url = f'/api/v1/notes/{self.note.id}/'
        payload = {
            'title': 'Attempted Hijack',
            'description': 'Trying to edit someone elses note.',
            'updated_by': 'Bob SDM'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Permission denied', response.data['error'])

    def test_update_note_by_superuser_success(self):
        url = f'/api/v1/notes/{self.note.id}/'
        payload = {
            'title': 'Admin Override Note',
            'description': 'Superuser updating status.',
            'updated_by': 'Admin',
            'is_superuser': True
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.note.refresh_from_db()
        self.assertEqual(self.note.title, 'Admin Override Note')

    def test_export_notes_excel(self):
        url = '/api/v1/notes/export_excel/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertIn('attachment; filename="SDM_Operational_Notes.xlsx"', response['Content-Disposition'])

    def test_quick_resolve_note(self):
        url = f'/api/v1/notes/{self.note.id}/resolve/'
        payload = {'updated_by': 'Alice SDM'}
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.note.refresh_from_db()
        self.assertEqual(self.note.status, 'Resolved')

        # Check timeline entry
        timeline_entry = SiteTimeline.objects.filter(site=self.site, event__icontains='SDM Note Resolved').first()
        self.assertIsNotNone(timeline_entry)

    def test_append_update_note(self):
        url = f'/api/v1/notes/{self.note.id}/'
        payload = {
            'updated_by': 'Alice SDM',
            'append_update': 'Generator engineer swapped fuel line and verified output voltage.'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.note.refresh_from_db()
        self.assertIn('Generator engineer swapped fuel line', self.note.description)
        self.assertIn('--- [UPDATE:', self.note.description)

    def test_upload_photo_to_note(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        test_photo = SimpleUploadedFile(name='site_inspection.jpg', content=b'fake image data', content_type='image/jpeg')
        url = f'/api/v1/notes/{self.note.id}/upload_photo/'
        response = self.client.post(url, {'photos': test_photo}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('attachments', response.data)
        self.assertEqual(len(response.data['attachments']), 1)
        self.assertEqual(response.data['attachments'][0]['file_name'], 'site_inspection.jpg')
