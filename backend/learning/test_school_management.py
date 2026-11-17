from datetime import timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client
from django.utils import timezone
from .test_library_permissions import ClassroomFixtures, sample_pdf
from .models import SchoolProfile, SchoolEvent, Attendance, Announcement, Enrollment


class SchoolManagementTests(ClassroomFixtures,TestCase):
    def setUp(self):
        super().setUp()
        self.admin=User.objects.create_superuser('direction','office@example.test','temporary-only-837!')
        self.client.force_login(self.admin)

    def test_registration_is_single_school_and_admin_only(self):
        payload={'name':'Escola Comunitária','academic_year':2026,'province':'Inhambane','district':'Vilankulo','principal':'Direcção','code':'ABC'}
        response=self.post('/api/school/profile/',payload)
        self.assertEqual(response.status_code,200,response.content)
        self.assertEqual(SchoolProfile.objects.count(),1)
        payload['name']='Escola Comunitária de Vilankulo'
        self.assertEqual(self.post('/api/school/profile/',payload).status_code,200)
        self.assertEqual(SchoolProfile.objects.count(),1)
        self.client.logout()
        public=self.client.get('/api/school/profile/').json()['school']
        self.assertEqual(public['name'],payload['name'])
        self.assertNotIn('principal',public);self.assertNotIn('code',public)
        self.assertEqual(self.post('/api/school/profile/',payload).status_code,401)
        self.client.force_login(self.teacher)
        self.assertEqual(self.post('/api/school/profile/',payload).status_code,403)

    def test_invalid_school_does_not_create_partial_registration(self):
        for payload in [{'name':'','academic_year':2026},{'name':'Escola','academic_year':1},{'name':'Escola','academic_year':2026,'email':'invalid'}]:
            self.assertEqual(self.post('/api/school/profile/',payload).status_code,400)
        self.assertEqual(SchoolProfile.objects.count(),0)

    def test_create_account_hashes_password_and_never_returns_it(self):
        payload={'username':'new_student','first_name':'Ana','last_name':'Manuel','role':'student','password':'Educacao!Campo78'}
        response=self.post('/api/school/people/',payload)
        self.assertEqual(response.status_code,200,response.content)
        user=User.objects.get(username='new_student')
        self.assertTrue(user.check_password(payload['password']))
        self.assertFalse(user.is_staff);self.assertFalse(user.is_superuser)
        self.assertTrue(user.groups.filter(name='Aluno').exists())
        self.assertNotIn('password',response.json())
        listing=self.client.get('/api/school/people/').json()['results']
        self.assertNotIn(self.admin.username,[p['username'] for p in listing])
        self.assertNotIn('password',str(listing))

    def test_account_permissions_password_validation_and_privilege_boundaries(self):
        payload={'username':'weak','first_name':'Ana','role':'student','password':'123'}
        self.assertEqual(self.post('/api/school/people/',payload).status_code,400)
        payload.update(password='Strong!Example987',role='admin')
        self.assertEqual(self.post('/api/school/people/',payload).status_code,400)
        self.assertEqual(self.post('/api/school/people/',{'existing_username':self.admin.username,'first_name':'x','role':'student'}).status_code,404)
        for user in [self.student,self.teacher]:
            self.client.force_login(user)
            for endpoint in ['people','classes','attendance','calendar','summary']:
                self.assertEqual(self.client.get(f'/api/school/{endpoint}/').status_code,403)
            self.assertEqual(self.post('/api/school/people/',payload).status_code,403)
        self.assertFalse(User.objects.filter(username='weak').exists())

    def test_edit_preserves_password_and_requires_transfer_before_deactivation(self):
        self.student.set_password('Original!98342');self.student.save()
        payload={'existing_username':self.student.username,'first_name':'Novo nome','role':'student','active':True}
        self.assertEqual(self.post('/api/school/people/',payload).status_code,200)
        self.student.refresh_from_db();self.assertTrue(self.student.check_password('Original!98342'))
        self.assertEqual(self.post('/api/school/people/',{**payload,'active':False}).status_code,400)
        self.assertEqual(self.post('/api/school/people/',{**payload,'role':'teacher'}).status_code,400)
        self.assertEqual(self.post('/api/school/people/',{'existing_username':self.teacher.username,'first_name':'Prof','role':'teacher','active':False}).status_code,400)
        self.assertTrue(Enrollment.objects.filter(student=self.student).exists())

    def test_school_creates_primary_class_and_enrolls_student(self):
        result=self.post('/api/school/classes/',{'name':'Primeira A','grade':1,'teacher':self.teacher.username})
        self.assertEqual(result.status_code,201,result.content)
        classroom_id=result.json()['id']
        self.assertEqual(self.post(f'/api/portal/classes/{classroom_id}/enroll/',{'username':self.student.username}).status_code,201)
        self.assertEqual(self.post('/api/school/classes/',{'name':'Invalid','grade':1,'teacher':self.student.username}).status_code,400)
        self.assertEqual(self.post('/api/school/classes/',{'name':'Invalid','grade':13,'teacher':self.teacher.username}).status_code,400)

    def test_attendance_is_unique_validated_and_survives_transfer(self):
        today=timezone.localdate().isoformat()
        payload={'class_id':self.c8.id,'date':today,'marks':[{'username':self.student.username,'state':'present'}]}
        self.assertEqual(self.post('/api/school/attendance/',payload).status_code,200)
        payload['marks'][0]['state']='late'
        self.assertEqual(self.post('/api/school/attendance/',payload).status_code,200)
        self.assertEqual(Attendance.objects.count(),1)
        self.assertEqual(Attendance.objects.get().state,'late')
        self.assertEqual(self.post('/api/school/attendance/',{**payload,'marks':[{'username':self.other.username,'state':'present'}]}).status_code,409)
        self.assertEqual(self.post('/api/school/attendance/',{**payload,'date':(timezone.localdate()+timedelta(days=1)).isoformat()}).status_code,400)
        self.assertEqual(self.post('/api/school/attendance/',{**payload,'marks':[{'username':self.student.username,'state':'unknown'}]}).status_code,400)
        self.post('/api/school/transfer/',{'kind':'student','source_id':self.c8.id,'target_id':self.c9.id,'student':self.student.username,'reason':'Mudança'})
        result=self.client.get(f'/api/school/attendance/?class_id={self.c8.id}&date={today}').json()
        self.assertEqual(result['results'],[])
        self.assertEqual(result['historical'][0]['state'],'late')
        self.assertEqual(Attendance.objects.count(),1)

    def test_calendar_drafts_remain_private_and_published_events_appear_on_bulletin(self):
        payload={'title':'Reunião de pais','date':timezone.localdate().isoformat(),'location':'Sala 1','published':False}
        response=self.post('/api/school/calendar/',payload)
        self.assertEqual(response.status_code,200,response.content)
        self.assertEqual(self.client.get('/api/school/bulletin/').json()['events'],[])
        self.assertEqual(self.post('/api/school/calendar/',{**payload,'id':response.json()['id'],'published':True}).status_code,200)
        self.client.logout()
        public=self.client.get('/api/school/bulletin/').json()['events']
        self.assertEqual(public[0]['title'],'Reunião de pais')
        self.assertNotIn('author',public[0])

    def test_summary_counts_real_records(self):
        Attendance.objects.create(classroom=self.c8,student=self.student,date=timezone.localdate(),state='absent',recorded_by=self.admin)
        response=self.client.get('/api/school/summary/').json()
        self.assertEqual(response['counts']['classes'],3)
        self.assertEqual(response['counts']['students'],2)
        self.assertEqual(response['counts']['teachers'],2)
        self.assertEqual(response['attendance'],{'absent':1})
        self.assertIsNone(response['school'])


class SchoolDocumentTests(ClassroomFixtures,TestCase):
    def setUp(self):
        super().setUp()
        self.admin=User.objects.create_superuser('direction','office@example.test','temporary-only-837!')
        self.directory=TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.storage=patch.object(Announcement._meta.get_field('attachment'),'storage',FileSystemStorage(location=self.directory.name))
        self.storage.start();self.addCleanup(self.storage.stop)
        self.client.force_login(self.admin)

    def upload(self,published='false',**extra):
        return self.client.post('/api/school/notices/',{'title':'Regulamento','body':'','published':published,'file':SimpleUploadedFile('regulamento.pdf',sample_pdf()),**extra})

    def test_pdf_only_notice_draft_private_then_public_reader_without_original(self):
        response=self.upload()
        self.assertEqual(response.status_code,200,response.content)
        notice=Announcement.objects.get(pk=response.json()['id'])
        reader=f'/api/school/notices/{notice.id}/reader/'
        page=f'/api/school/notices/{notice.id}/pages/'
        self.assertEqual(self.client.get(reader).status_code,200)
        self.client.logout()
        self.assertEqual(self.client.get(reader).status_code,404)
        self.assertEqual(self.client.get(page).status_code,404)
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.get(reader).status_code,404)
        self.client.force_login(self.admin)
        self.assertEqual(self.post('/api/school/notices/',{'id':notice.id,'title':'Regulamento','body':'','published':True}).status_code,200)
        self.client.logout()
        public=self.client.get('/api/school/bulletin/').json()['results'][0]
        self.assertTrue(public['has_document']);self.assertNotIn('file_url',public)
        info=self.client.get(reader).json()
        self.assertEqual(info['viewer']['mode'],'pdf')
        self.assertEqual(self.client.get(page).status_code,200)
        self.assertNotEqual(self.client.get('/media/'+notice.attachment.name).status_code,200)
        notice.published=False;notice.save()
        self.assertEqual(self.client.get(page).status_code,404)

    def test_notice_validates_pdf_and_document_removal(self):
        bad=self.client.post('/api/school/notices/',{'title':'Documento','published':'true','file':SimpleUploadedFile('fake.pdf',b'not a PDF')})
        self.assertEqual(bad.status_code,400)
        self.assertEqual(Announcement.objects.count(),0)
        result=self.upload()
        notice_id=result.json()['id']
        self.assertEqual(self.post('/api/school/notices/',{'id':notice_id,'title':'Documento','body':'','remove_document':True}).status_code,400)
        self.assertEqual(self.post('/api/school/notices/',{'id':notice_id,'title':'Documento','body':'Texto substituto','remove_document':True}).status_code,200)
        self.assertFalse(Announcement.objects.get(pk=notice_id).attachment)

    def test_teacher_cannot_upload_official_notice_and_school_post_requires_csrf(self):
        self.client.force_login(self.teacher)
        self.assertEqual(self.upload('true').status_code,403)
        strict=Client(enforce_csrf_checks=True);strict.force_login(self.admin)
        self.assertEqual(strict.post('/api/school/notices/',{'title':'x','body':'y','published':True}).status_code,403)
