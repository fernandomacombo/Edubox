from tempfile import TemporaryDirectory
from django.test import TestCase, override_settings
from django.contrib.auth.models import User, Group
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Subject, Resource, Quiz, Question, Choice, Classroom, Enrollment, Assignment, Submission, Announcement, AnnouncementRead


class ClassroomFixtures:
    def setUp(self):
        self.teacher = User.objects.create_user('teacher')
        self.teacher.groups.add(Group.objects.get_or_create(name='Professor')[0])
        self.other_teacher = User.objects.create_user('otherteacher')
        self.other_teacher.groups.add(Group.objects.get(name='Professor'))
        self.student = User.objects.create_user('student8')
        self.student.groups.add(Group.objects.get_or_create(name='Aluno')[0])
        self.other = User.objects.create_user('student9')
        self.other.groups.add(Group.objects.get(name='Aluno'))
        self.c8 = Classroom.objects.create(name='8A', grade=8, teacher=self.teacher)
        self.c8b = Classroom.objects.create(name='8B', grade=8, teacher=self.teacher)
        self.c9 = Classroom.objects.create(name='9A', grade=9, teacher=self.other_teacher)
        Enrollment.objects.create(classroom=self.c8, student=self.student)
        Enrollment.objects.create(classroom=self.c9, student=self.other)
        self.s8 = Subject.objects.create(name='Ciências', grade=8)
        self.s9 = Subject.objects.create(name='Ciências', grade=9)
        self.q8 = Quiz.objects.create(subject=self.s8, title='Exercício 8A')
        self.q8.classrooms.add(self.c8)
        self.q8b = Quiz.objects.create(subject=self.s8, title='Exercício 8B')
        self.q8b.classrooms.add(self.c8b)
        self.q9 = Quiz.objects.create(subject=self.s9, title='Exercício 9A')
        self.q9.classrooms.add(self.c9)
        self.legacy = Quiz.objects.create(subject=self.s8, title='Sem turma atribuída')
        self.a8b = Assignment.objects.create(classroom=self.c8b, title='Trabalho privado 8B', instructions='Privado.')
        self.a9 = Assignment.objects.create(classroom=self.c9, title='Trabalho privado 9A', instructions='Privado.')
        self.book9 = Resource.objects.create(subject=self.s9, title='Livro da nona', kind='book', body='Conteúdo de consulta.', author='Biblioteca escolar')

    def post(self, url, payload):
        return self.client.post(url, payload, content_type='application/json')



class ClassroomAccessTests(ClassroomFixtures, TestCase):
    def test_student_only_own_class_even_same_grade_and_direct_urls(self):
        self.client.force_login(self.student)
        result = self.client.get('/api/quizzes/').json()
        self.assertEqual([q['id'] for q in result['results']], [self.q8.id])
        self.assertEqual(result['grades'], [8])
        self.assertEqual(self.client.get('/api/quizzes/?grade=9').json()['results'], [])
        for quiz in [self.q8b, self.q9, self.legacy]:
            self.assertEqual(self.client.get(f'/api/quizzes/{quiz.id}/').status_code, 404)
            self.assertEqual(self.post(f'/api/quizzes/{quiz.id}/submit/', {'answers': {}}).status_code, 404)
        self.assertEqual(self.client.get('/api/portal/assignments/').json()['results'], [])
        for item in [self.a8b, self.a9]:
            self.assertEqual(self.post(f'/api/portal/assignments/{item.id}/submit/', {'answer':'Intrusão'}).status_code, 404)
            self.assertEqual(self.client.get(f'/api/portal/assignments/{item.id}/responses/').status_code, 403)
        self.assertEqual(Submission.objects.count(), 0)

    def test_library_is_cross_grade_but_never_contains_private_assignments(self):
        self.client.force_login(self.student)
        result = self.client.get('/api/resources/?grade=9&kind=book&q=Biblioteca').json()['results']
        self.assertEqual([r['id'] for r in result], [self.book9.id])
        self.assertEqual(result[0]['kind'], 'book')
        self.assertNotIn('Trabalho privado', str(result))
        self.assertEqual(self.client.get('/api/resources/?subject=invalid').json()['results'], [])
        self.book9.published=False;self.book9.save()
        self.assertEqual(self.client.get('/api/resources/').json()['results'], [])

    def test_anonymous_cannot_list_open_or_submit_quizzes(self):
        self.assertTrue(self.client.get('/api/quizzes/').json()['login_required'])
        self.assertEqual(self.client.get('/api/quizzes/').json()['results'], [])
        self.assertEqual(self.client.get(f'/api/quizzes/{self.q8.id}/').status_code, 401)
        self.assertEqual(self.post(f'/api/quizzes/{self.q8.id}/submit/', {'answers':{}}).status_code, 401)
        self.assertNotIn('quiz_count', self.client.get('/api/subjects/').json()['results'][0])

    def test_revoking_enrollment_removes_quiz_access(self):
        self.client.force_login(self.student)
        Enrollment.objects.filter(student=self.student).delete()
        self.assertEqual(self.client.get(f'/api/quizzes/{self.q8.id}/').status_code, 404)

    def test_teacher_only_sees_own_class_exercises(self):
        self.client.force_login(self.teacher)
        ids={q['id'] for q in self.client.get('/api/quizzes/').json()['results']}
        self.assertEqual(ids, {self.q8.id, self.q8b.id})
        self.assertEqual(self.client.get(f'/api/quizzes/{self.q9.id}/').status_code, 404)

    def test_staff_teacher_cannot_bypass_quiz_scope_via_admin(self):
        from django.contrib.auth.models import Permission
        self.other_teacher.is_staff=True;self.other_teacher.save()
        self.other_teacher.user_permissions.add(*Permission.objects.filter(content_type__app_label='learning'))
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(f'/admin/learning/quiz/{self.q8.id}/change/').status_code,403)

    def test_wrong_grade_assignment_is_not_exposed(self):
        self.q9.classrooms.add(self.c8)
        self.client.force_login(self.student)
        self.assertEqual(self.client.get(f'/api/quizzes/{self.q9.id}/').status_code, 404)

    def test_all_teacher_classes_notifications_and_read_status_are_private(self):
        self.client.force_login(self.teacher)
        created=self.post('/api/portal/announcements/', {'audience':'all','title':'Aviso','body':'Trazer o caderno.'})
        self.assertEqual(created.status_code,201)
        notice=Announcement.objects.get(id=created.json()['id'])
        self.assertEqual(set(notice.classrooms.values_list('id',flat=True)),{self.c8.id,self.c8b.id})
        self.client.force_login(self.student)
        result=self.client.get('/api/portal/announcements/').json()
        self.assertEqual(result['unread_count'],1)
        self.assertEqual(result['results'][0]['class_names'],['8A'])
        url=f'/api/portal/announcements/{notice.id}/read/'
        self.assertEqual(self.post(url,{}).status_code,200)
        self.assertEqual(self.post(url,{}).status_code,200)
        self.assertEqual(AnnouncementRead.objects.count(),1)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['unread_count'],0)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'],[])
        self.assertEqual(self.post(url,{}).status_code,404)
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'],[])

    def test_notice_to_one_class_and_revoked_membership(self):
        Enrollment.objects.create(classroom=self.c8b, student=self.other)
        self.client.force_login(self.teacher)
        created=self.post('/api/portal/announcements/',{'audience':'class','class_id':self.c8.id,'title':'Só 8A','body':'Mensagem.'})
        notice_id=created.json()['id']
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'],[])
        self.client.force_login(self.student)
        Enrollment.objects.filter(student=self.student).delete()
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'],[])
        self.assertEqual(self.post(f'/api/portal/announcements/{notice_id}/read/',{}).status_code,404)

    def test_notice_cannot_target_another_teachers_class_or_be_sent_by_student(self):
        self.client.force_login(self.teacher)
        payload={'audience':'class','class_id':self.c9.id,'title':'Inválido','body':'Mensagem'}
        self.assertEqual(self.post('/api/portal/announcements/',payload).status_code,403)
        self.assertEqual(Announcement.objects.count(),0)
        self.client.force_login(self.student)
        self.assertEqual(self.post('/api/portal/announcements/',payload).status_code,403)
        self.client.logout()
        self.assertEqual(self.client.get('/api/portal/announcements/').status_code,401)


class LocalMediaTests(TestCase):
    def test_video_range_seeking_and_unpublished_protection(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            subject=Subject.objects.create(name='Português',grade=9)
            item=Resource.objects.create(subject=subject,title='Vídeo',kind='video',file=SimpleUploadedFile('video.mp4',b'0123456789'))
            user=User.objects.create_user('listener')
            user.groups.add(Group.objects.get_or_create(name='Aluno')[0])
            self.client.force_login(user)
            url=self.client.get(f'/api/resources/{item.id}/').json()['viewer']['stream_url']
            self.assertEqual(self.client.get(item.file.url).status_code,403)
            for header, expected, content_range in [('bytes=2-5',b'2345','bytes 2-5/10'),('bytes=-3',b'789','bytes 7-9/10'),('bytes=7-',b'789','bytes 7-9/10')]:
                response=self.client.get(url,HTTP_RANGE=header)
                self.assertEqual(response.status_code,206)
                self.assertEqual(response['Content-Range'],content_range)
                self.assertEqual(b''.join(response.streaming_content),expected)
                response.close()
            for header in ['bytes=99-100','bytes=-0','bytes=5-2','bytes=0-1,3-4']:
                self.assertEqual(self.client.get(url,HTTP_RANGE=header).status_code,416)
            item.published=False;item.save()
            self.assertEqual(self.client.get(url,HTTP_RANGE='bytes=0-1').status_code,404)


def sample_pdf():
    from io import BytesIO
    import pypdfium2 as pdfium
    document=pdfium.PdfDocument.new()
    page=document.new_page(300,400)
    page.close()
    output=BytesIO()
    document.save(output)
    document.close()
    return output.getvalue()


class ProtectedReaderTests(ClassroomFixtures, TestCase):
    def test_pdf_original_blocked_and_identified_page_requires_login(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            item=Resource.objects.create(subject=self.s9,title='Livro protegido',kind='book',file=SimpleUploadedFile('livro.pdf',sample_pdf()))
            public=self.client.get('/api/resources/').json()['results']
            self.assertNotIn('file_url',public[0])
            self.assertNotIn('body',public[0])
            self.assertEqual(self.client.get(f'/api/resources/{item.id}/').status_code,401)
            self.assertEqual(self.client.get(f'/api/resources/{item.id}/pages/').status_code,401)
            self.client.force_login(self.student)
            info=self.client.get(f'/api/resources/{item.id}/').json()
            self.assertEqual(info['viewer']['mode'],'pdf')
            self.assertEqual(info['viewer']['page_count'],1)
            self.assertEqual(self.client.get(item.file.url).status_code,403)
            page=self.client.get(info['viewer']['page_url'])
            self.assertEqual(page.status_code,200)
            self.assertEqual(page['Content-Type'],'image/png')
            self.assertTrue(page.content.startswith(b'\x89PNG'))
            self.assertEqual(page['Cache-Control'],'private, no-store')
            self.assertEqual(self.client.get(info['viewer']['page_url']+'?page=2').status_code,404)
            self.client.force_login(self.other)
            other_page=self.client.get(info['viewer']['page_url'])
            self.assertNotEqual(page.content,other_page.content)
            item.published=False;item.save()
            self.assertEqual(self.client.get(info['viewer']['page_url']).status_code,404)

    def test_streaming_links_cannot_be_reused_by_another_session(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            item=Resource.objects.create(subject=self.s9,title='Vídeo',kind='video',file=SimpleUploadedFile('video.mp4',b'0123456789'))
            self.client.force_login(self.student)
            url=self.client.get(f'/api/resources/{item.id}/').json()['viewer']['stream_url']
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(url).status_code,403)
            self.client.force_login(self.student)
            self.assertEqual(self.client.get(url).status_code,403)
            self.client.logout()
            self.assertEqual(self.client.get(url).status_code,401)

    def test_private_assignment_reader_checks_class_on_every_page(self):
        from unittest.mock import patch
        from django.core.files.storage import FileSystemStorage
        with TemporaryDirectory() as directory, patch.object(Assignment._meta.get_field('attachment'),'storage',FileSystemStorage(location=directory)):
            item=Assignment.objects.create(classroom=self.c8,title='Ficha privada',instructions='Ler.',attachment=SimpleUploadedFile('ficha.pdf',sample_pdf()))
            self.client.force_login(self.student)
            info=self.client.get(f'/api/portal/assignments/{item.id}/reader/').json()
            self.assertEqual(self.client.get(info['viewer']['page_url']).status_code,200)
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(f'/api/portal/assignments/{item.id}/reader/').status_code,404)
            self.assertEqual(self.client.get(info['viewer']['page_url']).status_code,404)
            self.client.force_login(self.student)
            Enrollment.objects.filter(student=self.student).delete()
            self.assertEqual(self.client.get(info['viewer']['page_url']).status_code,404)
