import json
from django.test import Client, TestCase
from django.urls import reverse
from .models import Choice, Question, Quiz, Resource, Subject

class PublicApiTests(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(name="Matemática", grade=8)
        self.quiz = Quiz.objects.create(subject=self.subject, title="Teste exemplo")
        self.question = Question.objects.create(quiz=self.quiz, prompt="2+2 = ?")
        self.right = Choice.objects.create(question=self.question, text="4", correct=True)
        self.wrong = Choice.objects.create(question=self.question, text="5", correct=False)

    def test_subject_filter(self):
        self.assertEqual(len(self.client.get('/api/subjects/?grade=8').json()['results']), 1)
        self.assertEqual(len(self.client.get('/api/subjects/?grade=9').json()['results']), 0)

    def test_no_correct_answer_exposed(self):
        response = self.client.get(f'/api/quizzes/{self.quiz.id}/').json()
        self.assertNotIn('correct', json.dumps(response))

    def test_scoring(self):
        response = self.client.post(f'/api/quizzes/{self.quiz.id}/submit/',
            data=json.dumps({'answers': {str(self.question.id): self.right.id}}),
            content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['score'], 1)

    def test_wrong_answer(self):
        response = self.client.post(f'/api/quizzes/{self.quiz.id}/submit/',
            data=json.dumps({'answers': {str(self.question.id): self.wrong.id}}),
            content_type='application/json')
        self.assertEqual(response.json()['score'], 0)

    def test_csrf_enforced_when_enabled(self):
        strict = Client(enforce_csrf_checks=True)
        response = strict.post(f'/api/quizzes/{self.quiz.id}/submit/',
            data=json.dumps({'answers': {str(self.question.id): self.right.id}}),
            content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_unpublished_quiz_not_accessible(self):
        self.quiz.published = False
        self.quiz.save()
        self.assertEqual(self.client.get(f'/api/quizzes/{self.quiz.id}/').status_code, 404)

from django.contrib.auth.models import Group, User
from .models import Classroom, Enrollment, Assignment, Submission

class PortalFixtures:
    def setUp(self):
        prof, _ = Group.objects.get_or_create(name='Professor')
        aluno, _ = Group.objects.get_or_create(name='Aluno')
        self.teacher = User.objects.create_user('prof1', password='Teste123!abcd')
        self.teacher.groups.add(prof)
        self.other = User.objects.create_user('prof2', password='Teste123!abcd')
        self.other.groups.add(prof)
        self.student = User.objects.create_user('aluno1', password='Teste123!abcd')
        self.student.groups.add(aluno)
        self.outsider = User.objects.create_user('aluno2', password='Teste123!abcd')
        self.outsider.groups.add(aluno)
        self.cls = Classroom.objects.create(name='A', grade=10, teacher=self.teacher)
        Enrollment.objects.create(classroom=self.cls, student=self.student)
        self.item = Assignment.objects.create(classroom=self.cls, title='Ficha 1', instructions='Responder.')

    def send(self, endpoint, obj):
        return self.client.post(endpoint, json.dumps(obj), content_type='application/json')

class PortalTests(PortalFixtures, TestCase):
    def test_login_required(self):
        self.assertEqual(self.client.get('/api/portal/classes/').status_code, 401)
        self.assertEqual(self.send('/api/portal/assignments/', {}).status_code, 401)

    def test_teacher_creates_class_and_assigns(self):
        self.client.force_login(self.teacher)
        c=self.send('/api/portal/classes/', {'name':'B','grade':10})
        self.assertEqual(c.status_code,201)
        a=self.send('/api/portal/assignments/',{'class_id':c.json()['id'],'title':'Ficha nova','instructions':'Exercícios'})
        self.assertEqual(a.status_code,201)

    def test_teacher_isolation(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/api/portal/classes/').json()['results'],[])
        self.assertEqual(self.client.get(f'/api/portal/assignments/{self.item.pk}/responses/').status_code,404)
        self.assertEqual(self.send(f'/api/portal/classes/{self.cls.pk}/enroll/', {'username':'aluno2'}).status_code,404)

    def test_students_only_see_own_classes(self):
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get('/api/portal/assignments/').json()['results'],[])
        self.assertEqual(self.send(f'/api/portal/assignments/{self.item.pk}/submit/',{'answer':'falso'}).status_code,404)

    def test_student_delivers_only_once(self):
        self.client.force_login(self.student)
        url=f'/api/portal/assignments/{self.item.pk}/submit/'
        self.assertEqual(self.send(url,{'answer':'Minha resposta'}).status_code,201)
        self.assertEqual(self.send(url,{'answer':'Resposta repetida'}).status_code,409)
        self.assertEqual(Submission.objects.count(),1)

    def test_teacher_only_reviews_own_class(self):
        s=Submission.objects.create(assignment=self.item,student=self.student,answer='Teste')
        self.client.force_login(self.other)
        self.assertEqual(self.send(f'/api/portal/responses/{s.pk}/grade/',{'score':12}).status_code,403)
        self.client.force_login(self.teacher)
        self.assertEqual(self.send(f'/api/portal/responses/{s.pk}/grade/',{'score':16,'feedback':'Bom'}).status_code,200)
        self.client.force_login(self.student)
        a=self.client.get('/api/portal/assignments/').json()['results'][0]
        self.assertEqual(a['my_answer']['score'],16)

    def test_student_cannot_create_or_grade(self):
        self.client.force_login(self.student)
        self.assertEqual(self.send('/api/portal/classes/',{'name':'X','grade':10}).status_code,403)
        self.assertEqual(self.send('/api/portal/assignments/',{'title':'x'}).status_code,403)

    def test_csrf_protects_changes(self):
        client=Client(enforce_csrf_checks=True)
        self.assertEqual(client.post('/api/portal/login/',data=json.dumps({'username':'prof1','password':'Teste123!abcd'}),content_type='application/json').status_code,403)
        client.force_login(self.teacher)
        self.assertEqual(client.post('/api/portal/classes/',data='{}',content_type='application/json').status_code,403)

# EduBox v0.3: anexos PDF privados de trabalhos escolares.
from tempfile import TemporaryDirectory
from unittest.mock import patch
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile


class PdfFixtures(PortalFixtures):
    def setUp(self):
        super().setUp()
        self.temp_files = TemporaryDirectory()
        self.addCleanup(self.temp_files.cleanup)
        field = Assignment._meta.get_field('attachment')
        storage_patch = patch.object(field, 'storage', FileSystemStorage(location=self.temp_files.name))
        storage_patch.start()
        self.addCleanup(storage_patch.stop)

    def upload(self, filename='ficha.pdf', content=b'%PDF-1.7\n1 0 obj\n%%EOF'):
        return self.client.post('/api/portal/assignments/', {
            'class_id': str(self.cls.pk), 'title': 'Documento da turma',
            'instructions': 'Ler o PDF e responder.',
            'file': SimpleUploadedFile(filename, content, content_type='application/pdf'),
        })

class AssignmentPdfTests(PdfFixtures, TestCase):
    def test_teacher_uploads_pdf_and_only_enrolled_student_reads(self):
        self.client.force_login(self.teacher)
        created = self.upload()
        self.assertEqual(created.status_code, 201, created.content)
        item = Assignment.objects.get(pk=created.json()['id'])
        self.assertTrue(item.attachment.name.endswith('.pdf'))
        url = created.json()['attachment_url']
        self.assertTrue(url.endswith('/file/'))
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertEqual(b''.join(response.streaming_content), b'%PDF-1.7\n1 0 obj\n%%EOF')
        response.close()

        self.client.force_login(self.student)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        response.close()
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_non_pdf_and_fake_pdf_rejected(self):
        self.client.force_login(self.teacher)
        self.assertEqual(self.upload('ficheiro.txt').status_code, 400)
        self.assertEqual(self.upload('mentira.pdf', b'not a PDF').status_code, 400)
        self.assertEqual(Assignment.objects.count(), 1)

    def test_oversize_rejected(self):
        self.client.force_login(self.teacher)
        # Limite reduzido so durante o teste; evita criar ficheiros de 15 MB no disco C.
        with patch('learning.models.MAX_ASSIGNMENT_PDF_SIZE', 8):
            response = self.upload(content=b'%PDF-0123456789')
        self.assertEqual(response.status_code, 400)

    def test_csrf_required_for_multipart(self):
        strict = Client(enforce_csrf_checks=True)
        strict.force_login(self.teacher)
        response = strict.post('/api/portal/assignments/', {
            'class_id': str(self.cls.pk), 'title': 'Teste', 'instructions': 'Ler.',
            'file': SimpleUploadedFile('ficha.pdf', b'%PDF-1.7\n%%EOF', content_type='application/pdf'),
        })
        self.assertEqual(response.status_code, 403)

    def test_other_teacher_and_student_cannot_upload(self):
        self.client.force_login(self.other)
        self.assertEqual(self.upload().status_code, 400)
        self.client.force_login(self.student)
        self.assertEqual(self.upload().status_code, 403)

    def test_existing_json_assignment_creation_preserved(self):
        self.client.force_login(self.teacher)
        response = self.send('/api/portal/assignments/', {
            'class_id': self.cls.pk, 'title': 'Sem PDF', 'instructions': 'Responde.'
        })
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()['attachment_url'])

class ReleaseRegressionTests(PdfFixtures, TestCase):
    def test_modes_and_conflicting_documents(self):
        self.client.force_login(self.teacher)
        subject = Subject.objects.create(name='Biologia', grade=10)
        resource = Resource.objects.create(subject=subject, title='Texto', body='Conteúdo')
        base = {'class_id': self.cls.pk, 'title': 'Ficha', 'instructions': 'Ler'}
        for mode, extra, status in [
            ('none', {}, 201), ('existing', {'resource_id': resource.pk}, 201),
            ('existing', {}, 400), ('upload', {}, 400),
            ('none', {'resource_id': resource.pk}, 400), ('invalid', {}, 400), ([], {}, 400),
        ]:
            with self.subTest(mode=mode, extra=extra):
                response = self.send('/api/portal/assignments/', {**base, 'document_mode': mode, **extra})
                self.assertEqual(response.status_code, status, response.content)
        response = self.client.post('/api/portal/assignments/', {**base, 'resource_id': resource.pk,
            'file': SimpleUploadedFile('x.pdf', b'%PDF-1.7\n%%EOF')})
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/portal/assignments/', {**base, 'document_mode': 'upload',
            'file': [SimpleUploadedFile('a.pdf', b'%PDF-1.7'), SimpleUploadedFile('b.pdf', b'%PDF-1.7')]})
        self.assertEqual(response.status_code, 400)

    def test_resource_grade_and_publication(self):
        self.client.force_login(self.teacher)
        subject = Subject.objects.create(name='Matemática', grade=8)
        resource = Resource.objects.create(subject=subject, title='Texto', body='Ler')
        data = {'class_id': self.cls.pk, 'title': 'Ficha', 'instructions': 'Ler', 'resource_id': resource.pk}
        self.assertEqual(self.send('/api/portal/assignments/', data).status_code, 400)
        subject.grade = 10; subject.save()
        self.assertEqual(self.send('/api/portal/assignments/', data).json()['resource']['body'], 'Ler')
        resource.published = False; resource.save()
        self.assertEqual(self.send('/api/portal/assignments/', data).status_code, 400)

    def test_admin_private_pdf_and_unpublished_assignment(self):
        self.client.force_login(self.teacher)
        result = self.upload().json()
        item = Assignment.objects.get(pk=result['id']); item.published = False; item.save()
        self.client.force_login(self.student)
        self.assertEqual(self.client.get(result['attachment_url']).status_code, 404)
        self.assertEqual(self.send(f'/api/portal/assignments/{item.pk}/submit/', {'answer': 'x'}).status_code, 404)
        admin = User.objects.create_superuser('admin', password='Secret123!')
        self.client.force_login(admin)
        response = self.client.get(result['attachment_url'])
        self.assertEqual(response.status_code, 200); response.close()
        self.assertEqual(self.client.get('/media/' + item.attachment.name).status_code, 404)

    def test_missing_pdf_and_revoked_enrollment(self):
        self.client.force_login(self.teacher)
        result = self.upload().json()
        self.client.force_login(self.student)
        Enrollment.objects.all().delete()
        self.assertEqual(self.client.get(result['attachment_url']).status_code, 404)
        self.client.force_login(self.teacher)
        item = Assignment.objects.get(pk=result['id'])
        item.attachment.storage.delete(item.attachment.name)
        self.assertEqual(self.client.get(result['attachment_url']).status_code, 404)

    def test_staff_teacher_cannot_bypass_portal(self):
        from django.contrib.auth.models import Permission
        self.other.is_staff = True; self.other.save()
        self.other.user_permissions.add(*Permission.objects.filter(content_type__app_label='learning'))
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/admin/learning/assignment/').status_code, 403)
        self.assertEqual(self.client.get(f'/admin/learning/assignment/{self.item.pk}/change/').status_code, 403)

    def test_full_cycle_and_score_boundaries(self):
        self.client.force_login(self.student)
        self.assertEqual(self.send(f'/api/portal/assignments/{self.item.pk}/submit/', {'answer': 'Resposta'}).status_code, 201)
        submission = Submission.objects.get()
        self.assertEqual(self.client.get(f'/api/portal/assignments/{self.item.pk}/responses/').status_code, 403)
        url = f'/api/portal/responses/{submission.pk}/grade/'
        self.assertEqual(self.send(url, {'score': 20}).status_code, 403)
        self.client.force_login(self.teacher)
        for score in [-1, 21, 1.5, True, '14', None]:
            self.assertEqual(self.send(url, {'score': score}).status_code, 400)
        self.assertEqual(self.send(url, {'score': 14, 'feedback': 'Bom trabalho'}).status_code, 200)
        self.client.force_login(self.student)
        answer = self.client.get('/api/portal/assignments/').json()['results'][0]['my_answer']
        self.assertEqual(answer, {'answer': 'Resposta', 'score': 14, 'feedback': 'Bom trabalho'})

    def test_published_media_only(self):
        from django.test import override_settings
        subject = Subject.objects.create(name='Português', grade=10)
        with override_settings(MEDIA_ROOT=self.temp_files.name):
            resource = Resource.objects.create(subject=subject, title='PDF', file=SimpleUploadedFile('book.pdf', b'%PDF-1.7'))
            url = resource.file.url
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200); response.close()
            resource.published = False; resource.save()
            self.assertEqual(self.client.get(url).status_code, 404)

    def test_login_logout_and_csrf_with_token(self):
        client = Client(enforce_csrf_checks=True)
        client.get('/api/portal/session/')
        response = client.post('/api/portal/login/', json.dumps({'username': 'prof1', 'password': 'Teste123!abcd'}),
            content_type='application/json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, 200)
        response = client.post('/api/portal/logout/', '{}', content_type='application/json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.get('/api/portal/classes/').status_code, 401)
