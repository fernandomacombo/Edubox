import json
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.core.exceptions import ValidationError
from django.http import FileResponse
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from .models import Classroom, Enrollment, Assignment, Submission, Resource, MAX_ASSIGNMENT_PDF_SIZE, validate_assignment_pdf


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
    qs=Assignment.objects.select_related('classroom','resource').prefetch_related('submissions')
    r=role(request.user)
    if r=='teacher':return qs.filter(classroom__teacher=request.user)
    if r=='student':return qs.filter(published=True,classroom__enrollments__student=request.user).distinct()
    if r=='admin':return qs
    return qs.none()

def assignment_dict(item,user):
    mine=next((s for s in item.submissions.all() if s.student_id==user.id),None)
    resource=item.resource
    return {'id':item.id,'title':item.title,'instructions':item.instructions,'class_id':item.classroom_id,'class_name':item.classroom.name,
            'grade':item.classroom.grade,'created_at':item.created_at.isoformat(),
            'attachment_url':f'/api/portal/assignments/{item.pk}/file/' if item.attachment else None,'resource':{'title':resource.title,'file_url':resource.file.url if resource.file else None, 'body':resource.body, 'external_url':resource.external_url} if resource and resource.published else None,
            'my_answer':{'answer':mine.answer,'score':mine.score,'feedback':mine.feedback} if mine else None}

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
            resource = Resource.objects.get(pk=int(obj['resource_id']), published=True, subject__grade=cls.grade)
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

    item = Assignment(classroom=cls, resource=resource, title=title, instructions=instructions)
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
    try:
        opened = item.attachment.open('rb')
    except (OSError, ValueError):
        return err('O ficheiro nao esta disponivel no servidor local.', 404)
    response = FileResponse(opened, content_type='application/pdf', as_attachment=False,
                            filename=item.attachment.name.rsplit('/', 1)[-1])
    response['Cache-Control'] = 'private, no-store'
    response['Content-Security-Policy'] = "sandbox"
    return response

@require_POST
def submit(request,pk):
    blocked=guard(request,{'student'})
    if blocked:return blocked
    a=get_object_or_404(visible_assignments(request),pk=pk)
    try: obj=data(request);answer=str(obj.get('answer','')).strip()
    except ValueError as e:return err(str(e))
    if not answer or len(answer)>8000:return err('Escreve uma resposta de até 8000 caracteres.')
    try:
        with transaction.atomic():Submission.objects.create(assignment=a,student=request.user,answer=answer)
    except IntegrityError:return err('Já entregaste esta ficha.',409)
    return JsonResponse({'ok':True},status=201)

@require_GET
def responses(request,pk):
    blocked=guard(request,{'teacher','admin'})
    if blocked:return blocked
    a=get_object_or_404(visible_assignments(request),pk=pk)
    return JsonResponse({'results':[{'id':s.id,'student':who(s.student),'answer':s.answer,'score':s.score,'feedback':s.feedback}
                                     for s in a.submissions.select_related('student')]})

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
    s.score=score;s.feedback=feedback;s.save(update_fields=['score','feedback'])
    return JsonResponse({'ok':True})
