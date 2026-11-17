import json
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from .readers import describe_file, private_response, render_page
from .models import Classroom, Enrollment, Assignment, Submission, Resource, AssignmentGroup, GroupMember, MAX_ASSIGNMENT_PDF_SIZE, validate_assignment_pdf


def role(user):
    if not user.is_authenticated or not user.is_active: return None
    if user.is_superuser: return 'admin'
    if user.groups.filter(name='Professor').exists(): return 'teacher'
    if user.groups.filter(name='Aluno').exists(): return 'student'
    return None

def err(msg, status=400): return JsonResponse({'error':msg},status=status)
def guard(request, allowed):
    r=role(request.user)
    if r not in allowed: return err('É necessário entrar com uma conta autorizada.' if not r else 'Sem autorização.', 401 if not request.user.is_authenticated else 403)
    return None

def data(request):
    if len(request.body)>30000: raise ValueError('Pedido demasiado grande.')
    try: obj=json.loads(request.body)
    except (ValueError,UnicodeDecodeError): raise ValueError('JSON inválido.')
    if not isinstance(obj,dict): raise ValueError('Dados inválidos.')
    return obj

def who(user): return {'username':user.username,'name':user.get_full_name() or user.username}

def session_data(user):
    r=role(user)
    return {'user':{**who(user),'role':r} if r else None}

@require_GET
@ensure_csrf_cookie
def session(request): return JsonResponse(session_data(request.user))

@require_POST
def sign_in(request):
    try: obj=data(request)
    except ValueError as e: return err(str(e))
    username=str(obj.get('username','')).strip();password=obj.get('password','')
    if not isinstance(password,str) or not username: return err('Preenche o utilizador e a palavra-passe.')
    user=authenticate(request,username=username,password=password)
    if not user or not role(user):return err('Dados de acesso inválidos ou conta sem grupo EduBox.',401)
    login(request,user)
    return JsonResponse(session_data(user))

@require_POST
def sign_out(request):
    logout(request);return JsonResponse({'ok':True})

def visible_classes(request):
    qs=Classroom.objects.select_related('teacher').prefetch_related('enrollments__student')
    r=role(request.user)
    if r=='teacher':return qs.filter(teacher=request.user)
    if r=='student':return qs.filter(enrollments__student=request.user).distinct()
    if r=='admin':return qs
    return qs.none()

def class_dict(cls, full=False):
    result={'id':cls.id,'name':cls.name,'grade':cls.grade,'teacher':who(cls.teacher),'student_count':cls.enrollments.count()}
    if full:result['students']=[who(e.student) for e in cls.enrollments.all()]
    return result

@require_http_methods(['GET','POST'])
def classes(request):
    blocked=guard(request,{'teacher','student','admin'} if request.method=='GET' else {'teacher'})
    if blocked:return blocked
    if request.method=='GET':return JsonResponse({'results':[class_dict(c,role(request.user)!='student') for c in visible_classes(request)]})
    try:
        obj=data(request);name=str(obj.get('name','')).strip();grade=int(obj.get('grade',0))
    except (ValueError,TypeError) as e:return err(str(e))
    if not name or len(name)>100 or grade not in range(8,13):return err('Indica nome e classe válida (8 a 12).')
    try: cls=Classroom.objects.create(name=name,grade=grade,teacher=request.user)
    except IntegrityError:return err('A turma já existe.',409)
    return JsonResponse(class_dict(cls),status=201)

@require_POST
def enroll(request,pk):
    blocked=guard(request,{'teacher','admin'})
    if blocked:return blocked
    cls=get_object_or_404(visible_classes(request),pk=pk)
    try: obj=data(request)
    except ValueError as e:return err(str(e))
    user=get_user_model().objects.filter(username=str(obj.get('username','')).strip(),is_active=True).first()
    if not user or role(user)!='student':return err('Aluno não encontrado. Cria a conta e atribui grupo Aluno na administração.',404)
    enrollment,created=Enrollment.objects.get_or_create(classroom=cls,student=user)
    if not created:return err('Este aluno já está inscrito.',409)
    return JsonResponse({'ok':True},status=201)

def visible_assignments(request):
    qs=Assignment.objects.select_related('classroom','resource').prefetch_related('submissions', 'work_groups__members__student')
    r=role(request.user)
    if r=='teacher':return qs.filter(classroom__teacher=request.user)
    if r=='student':return qs.filter(published=True,classroom__enrollments__student=request.user).distinct()
    if r=='admin':return qs
    return qs.none()

def assignment_dict(item,user):
    mine=next((s for s in item.submissions.all() if s.student_id==user.id),None)
    resource=item.resource
    group = next((g for g in item.work_groups.all() if any(m.student_id == user.id for m in g.members.all())), None)
    result = {'kind': item.kind, 'kind_label': item.get_kind_display(),
            'accepting_submissions': item.accepting_submissions, 'correction_published': item.correction_published,
            'correction': item.correction if item.correction_published or role(user) in {'teacher', 'admin'} else '',
            'my_group': {'id': group.id, 'name': group.name, 'members': [who(m.student) for m in group.members.all()]} if group else None,
            'id':item.id,'title':item.title,'instructions':item.instructions,'class_id':item.classroom_id,'class_name':item.classroom.name,
            'grade':item.classroom.grade,'created_at':item.created_at.isoformat(),
            'attachment_url':f'/api/portal/assignments/{item.pk}/file/' if item.attachment else None,'resource':{'id':resource.id,'title':resource.title,'file_url':None, 'body':'', 'external_url':''} if resource and resource.published else None,
            'my_answer':{'answer':mine.answer,'score':mine.score,'feedback':mine.feedback} if mine else None}
    if role(user) in {'teacher', 'admin'}:
        submissions = list(item.submissions.all())
        result['groups'] = [{'id': g.id, 'name': g.name, 'members': [who(m.student) for m in g.members.all()]} for g in item.work_groups.all()]
        result['response_count'] = len(submissions)
        result['pending_count'] = sum(s.score is None for s in submissions)
    return result

@require_http_methods(['GET', 'POST'])
def assignments(request):
    blocked = guard(request, {'teacher', 'student', 'admin'} if request.method == 'GET' else {'teacher'})
    if blocked:
        return blocked
    if request.method == 'GET':
        return JsonResponse({'results': [assignment_dict(a, request.user) for a in visible_assignments(request)]})

    try:
        if request.content_type.startswith('multipart/form-data'):
            obj = request.POST
            upload = request.FILES.get('file')
            if sum(len(request.FILES.getlist(key)) for key in request.FILES) != (1 if upload else 0):
                return err('Envia apenas um documento PDF.')
        else:
            obj = data(request)
            upload = None
        cls = Classroom.objects.get(pk=int(obj.get('class_id')), teacher=request.user)
        resource = None
        if obj.get('resource_id'):
            resource = Resource.objects.filter(published=True).filter(Q(subject__isnull=True) | Q(subject__grade=cls.grade)).get(pk=int(obj['resource_id']))
        title = str(obj.get('title', '')).strip()
        instructions = str(obj.get('instructions', '')).strip()
    except (ValueError, TypeError, Classroom.DoesNotExist, Resource.DoesNotExist):
        return err('Turma ou material invalido.')

    if not title or len(title) > 180 or not instructions or len(instructions) > 4000:
        return err('Titulo e instrucoes sao obrigatorios.')
    mode = obj.get('document_mode')
    if mode is not None and (not isinstance(mode, str) or mode not in {'none', 'existing', 'upload'} or
            (mode == 'none' and (resource or upload)) or
            (mode == 'existing' and (not resource or upload)) or
            (mode == 'upload' and (not upload or resource))):
        return err('Selecciona apenas a modalidade de documento indicada e preenche-a.')
    if resource and upload:
        return err('Escolhe um documento existente OU envia um novo PDF.')
    if upload:
        try:
            validate_assignment_pdf(upload)
        except ValidationError as exc:
            return err(' '.join(exc.messages))
        if upload.size > MAX_ASSIGNMENT_PDF_SIZE:
            return err('O PDF nao pode exceder 15 MB.')

    item = Assignment(classroom=cls, resource=resource, title=title, instructions=instructions, kind=obj.get('kind', 'exercise'))
    if upload:
        item.attachment = upload
    try:
        item.full_clean()
    except ValidationError as exc:
        return err(' '.join(exc.messages))
    item.save()
    return JsonResponse(assignment_dict(item, request.user), status=201)


@require_GET
def assignment_file(request, pk):
    blocked = guard(request, {'teacher', 'student', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(visible_assignments(request), pk=pk)
    if not item.attachment:
        return err('Este trabalho nao possui um PDF.', 404)
    return err('Abre o PDF no leitor da ficha. A descarga do original não está disponível.', 403)


@require_GET
def assignment_reader(request, pk):
    blocked = guard(request, {'teacher', 'student', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(visible_assignments(request), pk=pk)
    if not item.attachment:
        return err('Esta ficha não tem PDF.', 404)
    try:
        info = describe_file(item.attachment, f'/api/portal/assignments/{pk}/pages/', request)
    except Exception:
        return err('Não foi possível abrir o PDF. Pede ao professor que verifique o ficheiro.', 422)
    return private_response(JsonResponse({'title': item.title, 'viewer': info}))


@require_GET
def assignment_page(request, pk):
    blocked = guard(request, {'teacher', 'student', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(visible_assignments(request), pk=pk)
    if not item.attachment:
        return err('Esta ficha não tem PDF.', 404)
    return render_page(item.attachment, request)


@require_POST
def submit(request,pk):
    blocked = guard(request, {'student'})
    if blocked: return blocked
    try:
        obj = data(request)
        answer = str(obj.get('answer', '')).strip()
    except ValueError as e: return err(str(e))
    if not answer or len(answer) > 8000: return err('Escreve uma resposta de até 8000 caracteres.')
    try:
        with transaction.atomic():
            # Lock the assignment before reading closure/groups or writing any delivery.
            a = get_object_or_404(Assignment.objects.select_for_update(), pk=pk)
            if not visible_assignments(request).filter(pk=a.pk).exists(): return err('Actividade não disponível.', 404)
            if not a.accepting_submissions: return err('O professor encerrou as entregas desta actividade.', 409)
            students, group = [request.user.id], None
            if a.kind == 'group':
                membership = GroupMember.objects.select_related('group').filter(assignment=a, student=request.user).first()
                if not membership: return err('O professor precisa de te atribuir a um grupo antes da entrega.', 409)
                group = membership.group
                students = list(group.members.filter(student__edubox_enrollments__classroom=a.classroom, student__is_active=True).values_list('student_id', flat=True).distinct())
                if a.submissions.filter(group=group).exists(): return err('O teu grupo já entregou este trabalho.', 409)
            for student_id in students:
                Submission.objects.create(assignment=a, student_id=student_id, submitted_by=request.user, group=group, answer=answer)
    except IntegrityError: return err('Já entregaste esta ficha.',409)
    return JsonResponse({'ok': True}, status=201)

@require_GET
def responses(request,pk):
    blocked=guard(request,{'teacher','admin'})
    if blocked:return blocked
    a=get_object_or_404(visible_assignments(request),pk=pk)
    return JsonResponse({'results':[{'id':s.id,'student':who(s.student),'answer':s.answer,'score':s.score,'feedback':s.feedback,'group_name':s.group.name if s.group_id else None}
                                     for s in a.submissions.select_related('student','group')]})

@require_POST
def grade_submission(request,pk):
    blocked=guard(request,{'teacher','admin'})
    if blocked:return blocked
    s=get_object_or_404(Submission.objects.select_related('assignment__classroom'),pk=pk)
    if role(request.user)!='admin' and s.assignment.classroom.teacher_id!=request.user.id:return err('Sem autorização para esta turma.',403)
    try:
        obj=data(request);score=obj.get('score');feedback=str(obj.get('feedback','')).strip()
        if type(score) is not int or not 0<=score<=20:raise ValueError('A nota deve ser inteiro entre 0 e 20.')
        if len(feedback)>2000:raise ValueError('Comentário demasiado longo.')
    except ValueError as e:return err(str(e))
    with transaction.atomic():
        locked = Assignment.objects.select_for_update().select_related('classroom').get(pk=s.assignment_id)
        if role(request.user) != 'admin' and locked.classroom.teacher_id != request.user.id: return err('Sem autorização para esta turma.',403)
        if s.group_id:
            Submission.objects.filter(assignment_id=s.assignment_id, group_id=s.group_id).update(score=score, feedback=feedback)
        else:
            s.score=score;s.feedback=feedback;s.save(update_fields=['score','feedback'])
    return JsonResponse({'ok':True})


@require_POST
def activity_settings(request, pk):
    blocked = guard(request, {'teacher', 'admin'})
    if blocked: return blocked
    try: obj = data(request)
    except ValueError as e: return err(str(e))
    with transaction.atomic():
        item = get_object_or_404(Assignment.objects.select_for_update(), pk=pk)
        if not visible_assignments(request).filter(pk=pk).exists(): return err('Sem autorização.', 403)
        if 'kind' in obj:
            if obj['kind'] not in dict(Assignment.KIND_CHOICES): return err('Tipo de actividade inválido.')
            if obj['kind'] != item.kind and 'group' in {obj['kind'], item.kind} and (item.submissions.exists() or item.work_groups.exists()):
                return err('O tipo não pode mudar depois de formar grupos ou receber entregas.', 409)
            item.kind = obj['kind']
        correction = str(obj.get('correction', item.correction)).strip()
        published = obj.get('correction_published', item.correction_published)
        accepting = obj.get('accepting_submissions', item.accepting_submissions)
        if len(correction) > 12000 or type(published) is not bool or type(accepting) is not bool:
            return err('Dados de correcção inválidos.')
        if published:
            if accepting: return err('Encerra as entregas antes de publicar a correcção.')
            if not correction: return err('Escreve a resolução antes de publicar.')
            if item.submissions.filter(score__isnull=True).exists(): return err('Avalia as respostas entregues antes de publicar a correcção.')
        item.correction, item.correction_published, item.accepting_submissions = correction, published, accepting
        item.save(update_fields=['kind', 'correction', 'correction_published', 'accepting_submissions'])
    return JsonResponse({'ok': True})


@require_POST
def activity_groups(request, pk):
    blocked = guard(request, {'teacher', 'admin'})
    if blocked: return blocked
    try:
        obj = data(request)
        name, usernames = str(obj.get('name', '')).strip(), obj.get('members')
        if not name or len(name) > 100 or not isinstance(usernames, list) or not 2 <= len(usernames) <= 100 or any(not isinstance(x, str) for x in usernames):
            return err('Indica um nome e pelo menos dois alunos para o grupo.')
        if len(set(usernames)) != len(usernames): return err('Não repitas alunos no grupo.')
        with transaction.atomic():
            item = get_object_or_404(Assignment.objects.select_for_update(), pk=pk)
            if not visible_assignments(request).filter(pk=pk).exists(): return err('Sem autorização.', 403)
            if item.kind != 'group' or not item.accepting_submissions: return err('Esta actividade não aceita novos grupos.')
            students = list(get_user_model().objects.filter(username__in=usernames, is_active=True, edubox_enrollments__classroom=item.classroom).distinct())
            if len(students) != len(usernames) or any(role(u) != 'student' for u in students): return err('Todos os membros devem ser alunos activos desta turma.')
            if GroupMember.objects.filter(assignment=item, student__in=students).exists(): return err('Um dos alunos já pertence a outro grupo desta actividade.', 409)
            if item.submissions.filter(student__in=students).exists(): return err('Um dos alunos já entregou esta actividade.', 409)
            group = AssignmentGroup.objects.create(assignment=item, name=name)
            GroupMember.objects.bulk_create([GroupMember(assignment=item, group=group, student=u) for u in students])
    except (ValueError, TypeError): return err('Grupo inválido.')
    except IntegrityError: return err('O nome ou os membros deste grupo já estão registados.', 409)
    return JsonResponse({'ok': True}, status=201)


@require_GET
def history(request):
    blocked = guard(request, {'student', 'admin'})
    if blocked: return blocked
    qs = Submission.objects.select_related('assignment__classroom').filter(student=request.user)
    qs = qs.exclude(assignment__classroom__enrollments__student=request.user)
    return private_response(JsonResponse({'results': [{'id': s.id, 'title': s.assignment.title,
        'class_name': str(s.assignment.classroom), 'answer': s.answer, 'score': s.score, 'feedback': s.feedback,
        'submitted_at': s.submitted_at.isoformat()} for s in qs.order_by('-submitted_at')]}))
