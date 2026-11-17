from tempfile import TemporaryDirectory
from django.contrib.auth.models import User, Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from .test_library_permissions import ClassroomFixtures, sample_pdf
from .models import Resource, Assignment, Submission, Enrollment, Announcement, TransferRecord, GroupMember, AssignmentGroup


class SchoolWorkflowTests(ClassroomFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser('school', 'school@example.test', 'test-only-password')
        self.a = Assignment.objects.create(classroom=self.c8, title='Avaliação de ciências', instructions='Responder.', kind='assessment')

    def transfer(self, **changes):
        payload = {'kind': 'student', 'source_id': self.c8.id, 'target_id': self.c9.id, 'student': self.student.username, 'reason': 'Transferência pedida pela escola.'}
        payload.update(changes)
        return self.post('/api/school/transfer/', payload)

    def test_school_endpoints_require_administrator(self):
        for user in [self.teacher, self.student]:
            self.client.force_login(user)
            for route in ['overview', 'notices', 'library']:
                self.assertEqual(self.client.get(f'/api/school/{route}/').status_code, 403)
                self.assertEqual(self.post(f'/api/school/{route}/', {}).status_code, 403 if route != 'overview' else 405)
            self.assertEqual(self.transfer().status_code, 403)
        self.assertEqual(TransferRecord.objects.count(), 0)

    def test_teacher_staff_cannot_edit_library_even_with_model_permissions(self):
        self.teacher.is_staff = True; self.teacher.save()
        self.teacher.user_permissions.add(*Permission.objects.filter(content_type__app_label='learning'))
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.get('/admin/learning/resource/').status_code, 403)
        self.assertEqual(self.client.get('/admin/learning/subject/').status_code, 403)

    def test_general_library_material_has_no_grade_and_can_be_used_in_assignment(self):
        self.client.force_login(self.admin)
        result = self.post('/api/school/library/', {'title':'Contos de Moçambique', 'kind':'book', 'category':'Literatura', 'body':'Um conto.', 'published':True})
        self.assertEqual(result.status_code, 200, result.content)
        item = Resource.objects.get(pk=result.json()['id'])
        self.assertIsNone(item.subject_id)
        self.client.logout()
        entry = next(r for r in self.client.get('/api/resources/?q=Literatura').json()['results'] if r['id'] == item.id)
        self.assertIsNone(entry['grade'])
        self.assertEqual(entry['category'], 'Literatura')
        self.assertNotIn('body', entry)
        self.client.force_login(self.teacher)
        assigned = self.post('/api/portal/assignments/', {'class_id':self.c8.id,'title':'Leitura','instructions':'Ler.','resource_id':item.id,'document_mode':'existing'})
        self.assertEqual(assigned.status_code, 201, assigned.content)

    def test_pdf_ebook_upload_and_audio_blocked_without_deleting_legacy(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            self.client.force_login(self.admin)
            result = self.client.post('/api/school/library/', {'title':'Ebook','kind':'ebook','category':'Literatura','published':'true','file':SimpleUploadedFile('book.pdf', sample_pdf())})
            self.assertEqual(result.status_code, 200, result.content)
            self.assertEqual(Resource.objects.get(pk=result.json()['id']).kind, 'ebook')
            audio = Resource.objects.create(subject=self.s8, title='Antigo', kind='audio', file=SimpleUploadedFile('old.mp3', b'123'))
            self.assertEqual(self.client.get(f'/api/resources/{audio.id}/').status_code, 404)
            self.assertTrue(Resource.objects.filter(pk=audio.pk).exists())
            self.assertEqual(self.client.get(audio.file.url).status_code, 404)
            upload = self.client.post('/api/school/library/', {'title':'Som','kind':'other','category':'Geral','file':SimpleUploadedFile('new.mp3',b'abc')})
            self.assertEqual(upload.status_code, 400)

    def test_draft_bulletin_is_private_and_published_notice_reaches_all_roles(self):
        self.client.force_login(self.admin)
        result = self.post('/api/school/notices/', {'title':'Reunião','body':'Quinta-feira na escola.','published':False})
        self.assertEqual(result.status_code, 200)
        notice_id = result.json()['id']
        self.client.logout()
        self.assertEqual(self.client.get('/api/school/bulletin/').json()['results'], [])
        self.client.force_login(self.student)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'], [])
        self.client.force_login(self.admin)
        self.post('/api/school/notices/', {'id':notice_id,'title':'Reunião','body':'Quinta-feira na escola.','published':True})
        self.client.logout()
        public = self.client.get('/api/school/bulletin/').json()['results']
        self.assertEqual(public[0]['title'], 'Reunião')
        self.assertNotIn('author', public[0])
        for user in [self.teacher,self.student,self.other]:
            self.client.force_login(user)
            result = self.client.get('/api/portal/announcements/').json()
            self.assertEqual(result['unread_count'], 1)
            self.assertEqual(result['results'][0]['class_names'], ['Direcção da escola'])
            self.assertEqual(self.post(f'/api/portal/announcements/{notice_id}/read/', {}).status_code, 200)
            self.assertEqual(self.client.get('/api/portal/announcements/').json()['unread_count'], 0)

    def test_student_transfer_preserves_history_and_revokes_old_content(self):
        record = Submission.objects.create(assignment=self.a, student=self.student, answer='Resposta histórica', score=14, feedback='Bom')
        self.client.force_login(self.admin)
        self.assertEqual(self.transfer().status_code, 200)
        self.assertEqual(self.transfer().status_code, 409)  # retry never duplicates transfer
        self.assertEqual(TransferRecord.objects.count(), 1)
        record.refresh_from_db(); self.assertEqual(record.score, 14)
        self.client.force_login(self.student)
        current = self.client.get('/api/portal/assignments/').json()['results']
        self.assertNotIn(self.a.id, [r['id'] for r in current])
        self.assertIn(self.a9.id, [r['id'] for r in current])
        self.assertEqual(self.post(f'/api/portal/assignments/{self.a.id}/submit/',{'answer':'Nova'}).status_code, 404)
        history = self.client.get('/api/portal/history/').json()['results']
        self.assertEqual(history[0]['answer'], 'Resposta histórica')
        self.assertEqual(history[0]['score'], 14)
        self.assertNotIn('correction', history[0])
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/api/portal/history/').json()['results'], [])

    def test_external_transfer_disables_account_and_keeps_all_answers(self):
        Enrollment.objects.create(classroom=self.c8b, student=self.student)
        Submission.objects.create(assignment=self.a, student=self.student, answer='Preservar', score=10)
        self.client.force_login(self.admin)
        self.assertEqual(self.transfer(kind='student_exit').status_code, 200)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_active)
        self.assertFalse(Enrollment.objects.filter(student=self.student).exists())
        self.assertEqual(Submission.objects.filter(student=self.student).count(), 1)
        self.client.force_login(self.student)
        self.assertIn(self.client.get('/api/portal/classes/').status_code, [401,403])

    def test_teacher_handover_transfers_ownership_and_existing_announcements(self):
        notice = Announcement.objects.create(author=self.teacher, title='Aviso antigo', body='Mantém-se.')
        notice.classrooms.add(self.c8)
        record = Submission.objects.create(assignment=self.a, student=self.student, answer='Ler', score=12)
        self.client.force_login(self.admin)
        result = self.transfer(kind='teacher',previous_teacher=self.teacher.username,target_teacher=self.other_teacher.username)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.transfer(kind='teacher',previous_teacher=self.teacher.username,target_teacher=self.other_teacher.username).status_code, 409)
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.get(f'/api/portal/assignments/{self.a.id}/responses/').status_code, 404)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'], [])
        self.assertEqual(self.post(f'/api/portal/responses/{record.id}/grade/', {'score':20}).status_code, 403)
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(f'/api/portal/assignments/{self.a.id}/responses/').status_code, 200)
        self.assertEqual(self.client.get('/api/portal/announcements/').json()['results'][0]['id'], notice.id)
        self.assertEqual(self.post(f'/api/portal/responses/{record.id}/grade/', {'score':15}).status_code, 200)

    def test_transfer_validation_does_not_change_enrollment(self):
        self.client.force_login(self.admin)
        for changes in [{'target_id':self.c8.id},{'target_id':-1},{'reason':''},{'student':self.teacher.username}]:
            self.assertEqual(self.transfer(**changes).status_code,400)
        self.assertTrue(Enrollment.objects.filter(student=self.student,classroom=self.c8).exists())
        self.assertEqual(TransferRecord.objects.count(), 0)

    def test_correction_hidden_until_graded_closed_and_explicitly_published(self):
        response = Submission.objects.create(assignment=self.a, student=self.student, answer='Resolver')
        url = f'/api/portal/assignments/{self.a.id}/settings/'
        self.client.force_login(self.teacher)
        self.assertEqual(self.post(url,{'correction':'Resolução secreta'}).status_code, 200)
        self.client.force_login(self.student)
        entry = next(r for r in self.client.get('/api/portal/assignments/').json()['results'] if r['id']==self.a.id)
        self.assertEqual(entry['correction'], '')
        self.assertEqual(self.post(url,{'correction_published':True}).status_code,403)
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.post(url,{'correction_published':True}).status_code,403)
        self.client.force_login(self.teacher)
        self.assertEqual(self.post(url,{'correction_published':True}).status_code,400)
        self.assertEqual(self.post(url,{'accepting_submissions':False,'correction_published':True}).status_code,400)
        self.post(f'/api/portal/responses/{response.id}/grade/',{'score':15})
        self.assertEqual(self.post(url,{'accepting_submissions':False,'correction_published':True}).status_code,200)
        self.client.force_login(self.student)
        entry = next(r for r in self.client.get('/api/portal/assignments/').json()['results'] if r['id']==self.a.id)
        self.assertEqual(entry['correction'], 'Resolução secreta')
        self.assertEqual(self.post(f'/api/portal/assignments/{self.a.id}/submit/',{'answer':'Late'}).status_code,409)
        self.client.force_login(self.other)
        self.assertNotIn(self.a.id,[r['id'] for r in self.client.get('/api/portal/assignments/').json()['results']])

    def test_cannot_reopen_while_correction_published_or_change_type_after_delivery(self):
        self.a.correction='Resposta';self.a.correction_published=True;self.a.accepting_submissions=False;self.a.save()
        Submission.objects.create(assignment=self.a,student=self.student,answer='x',score=10)
        self.client.force_login(self.teacher)
        url=f'/api/portal/assignments/{self.a.id}/settings/'
        self.assertEqual(self.post(url,{'accepting_submissions':True}).status_code,400)
        self.assertEqual(self.post(url,{'kind':'group'}).status_code,409)
        self.assertEqual(self.post(url,{'accepting_submissions':True,'correction_published':False}).status_code,200)


class GroupWorkTests(ClassroomFixtures, TestCase):
    def setUp(self):
        super().setUp()
        Enrollment.objects.create(classroom=self.c8, student=self.other)
        self.work=Assignment.objects.create(classroom=self.c8,title='Pesquisa em grupo',instructions='Pesquisar.',kind='group')

    def make_group(self):
        self.client.force_login(self.teacher)
        return self.post(f'/api/portal/assignments/{self.work.id}/groups/', {'name':'Grupo A','members':[self.student.username,self.other.username]})

    def test_group_delivery_and_grade_are_shared_and_duplicate_is_rejected(self):
        self.assertEqual(self.make_group().status_code,201)
        self.client.force_login(self.student)
        url=f'/api/portal/assignments/{self.work.id}/submit/'
        self.assertEqual(self.post(url,{'answer':'O nosso trabalho'}).status_code,201)
        self.assertEqual(Submission.objects.filter(assignment=self.work).count(),2)
        self.client.force_login(self.other)
        self.assertEqual(self.post(url,{'answer':'Duplicado'}).status_code,409)
        entry=next(r for r in self.client.get('/api/portal/assignments/').json()['results'] if r['id']==self.work.id)
        self.assertEqual(entry['my_answer']['answer'],'O nosso trabalho')
        self.assertEqual(entry['my_group']['name'],'Grupo A')
        self.client.force_login(self.teacher)
        sub=Submission.objects.filter(assignment=self.work).first()
        self.assertEqual(self.post(f'/api/portal/responses/{sub.id}/grade/',{'score':17,'feedback':'Bom trabalho em equipa'}).status_code,200)
        self.assertEqual(list(Submission.objects.filter(assignment=self.work).values_list('score',flat=True)),[17,17])

    def test_members_must_belong_to_class_and_to_only_one_group(self):
        self.client.force_login(self.teacher)
        url=f'/api/portal/assignments/{self.work.id}/groups/'
        self.assertEqual(self.post(url,{'name':'Inválido','members':[self.student.username,self.teacher.username]}).status_code,400)
        self.assertEqual(self.post(url,{'name':'Inválido','members':[self.student.username,self.student.username]}).status_code,400)
        self.assertEqual(self.make_group().status_code,201)
        self.assertEqual(self.make_group().status_code,409)
        self.assertEqual(AssignmentGroup.objects.count(),1)
        self.assertEqual(GroupMember.objects.count(),2)

    def test_student_cannot_self_assign_or_deliver_without_group(self):
        self.client.force_login(self.student)
        self.assertEqual(self.post(f'/api/portal/assignments/{self.work.id}/groups/', {'name':'x','members':[]}).status_code,403)
        self.assertEqual(self.post(f'/api/portal/assignments/{self.work.id}/submit/',{'answer':'x'}).status_code,409)
        self.assertEqual(Submission.objects.count(),0)

    def test_transferred_group_member_does_not_receive_new_delivery(self):
        self.assertEqual(self.make_group().status_code,201)
        Enrollment.objects.filter(classroom=self.c8,student=self.other).delete()
        self.client.force_login(self.student)
        self.assertEqual(self.post(f'/api/portal/assignments/{self.work.id}/submit/',{'answer':'Concluído'}).status_code,201)
        self.assertEqual(list(Submission.objects.values_list('student_id',flat=True)),[self.student.id])
