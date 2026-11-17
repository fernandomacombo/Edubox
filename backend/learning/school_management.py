"""One registered school per local EduBox; administration stays authenticated."""
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods
from .models import SchoolProfile, SchoolEvent, Classroom, Enrollment, Attendance, Assignment, Submission, Resource, Announcement, Subject
from .portal_views import data, err, guard, role, who, class_dict
from .readers import private_response

PROFILE_FIELDS = ['name', 'code', 'motto', 'province', 'district', 'address', 'phone', 'email', 'principal', 'academic_year']


def public_profile():
    school = SchoolProfile.objects.first()
    if not school: return None
    return {key: getattr(school, key) for key in ['name', 'motto', 'province', 'district', 'academic_year', 'phone', 'email']}


@require_http_methods(['GET', 'POST'])
def profile(request):
    if request.method == 'GET':
        item = SchoolProfile.objects.first()
        full = {key: getattr(item, key) for key in PROFILE_FIELDS} if item and role(request.user) == 'admin' else public_profile()
        return private_response(JsonResponse({'school': full}))
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    try:
        obj = data(request)
        values = {key: str(obj.get(key, '')).strip() for key in PROFILE_FIELDS if key != 'academic_year'}
        values['academic_year'] = int(obj.get('academic_year', 0))
        item = SchoolProfile(pk=1, **values)
        item.full_clean(validate_unique=False)
        SchoolProfile.objects.update_or_create(pk=1, defaults=values)
    except ValidationError as e: return err(' '.join(e.messages))
    except (ValueError, TypeError): return err('Ano lectivo inválido.')
    return JsonResponse({'school': values})


def person_dict(user):
    return {**who(user), 'first_name':user.first_name, 'last_name':user.last_name,
            'role':'teacher' if user.groups.filter(name='Professor').exists() else 'student',
            'email':user.email, 'active':user.is_active,
            'classes':list(user.edubox_classes.values_list('name', flat=True)) if user.groups.filter(name='Professor').exists() else list(user.edubox_enrollments.values_list('classroom__name', flat=True))}


@require_http_methods(['GET', 'POST'])
def people(request):
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    User = get_user_model()
    if request.method == 'GET':
        users = User.objects.filter(is_superuser=False, groups__name__in=['Professor','Aluno']).distinct().order_by('first_name','username')
        return private_response(JsonResponse({'results':[person_dict(u) for u in users]}))
    try:
        obj = data(request)
        editing = obj.get('existing_username')
        with transaction.atomic():
            if editing:
                user = get_object_or_404(User.objects.select_for_update().filter(is_superuser=False,groups__name__in=['Professor','Aluno']).distinct(), username=editing)
                expected_role = 'teacher' if user.groups.filter(name='Professor').exists() else 'student'
                if obj.get('role', expected_role) != expected_role: return err('O perfil não pode ser alterado. Usa contas separadas para professor e aluno.')
            else:
                if obj.get('role') not in ['teacher','student']: return err('Escolhe Professor ou Aluno.')
                user = User(username=str(obj.get('username','')).strip())
                expected_role = obj['role']
            for key in ['first_name','last_name','email']:
                setattr(user,key,str(obj.get(key,'')).strip())
            if not user.first_name: return err('Indica o nome da pessoa.')
            active = obj.get('active',True)
            if type(active) is not bool: return err('Estado da conta inválido.')
            if not active and user.pk:
                if user.edubox_classes.exists(): return err('Transfere primeiro as turmas deste professor para outro responsável.')
                if user.edubox_enrollments.exists(): return err('Usa Transferências para registar a saída do aluno sem perder o histórico.')
            password = obj.get('password','')
            if not isinstance(password,str): return err('Palavra-passe inválida.')
            if not editing and not password: return err('Define uma palavra-passe inicial.')
            if password:
                validate_password(password,user)
                user.set_password(password)
            user.is_active = active
            user.full_clean(exclude=['password'])
            user.save()
            if not editing: user.groups.add(Group.objects.get_or_create(name='Professor' if expected_role=='teacher' else 'Aluno')[0])
    except ValidationError as e: return err(' '.join(e.messages))
    except (ValueError,TypeError): return err('Dados da pessoa inválidos.')
    except IntegrityError: return err('Esse utilizador já existe.',409)
    return JsonResponse(person_dict(user))


@require_http_methods(['GET','POST'])
def classes(request):
    blocked=guard(request,{'admin'})
    if blocked:return blocked
    if request.method=='GET':
        return private_response(JsonResponse({'results':[class_dict(c,True) for c in Classroom.objects.select_related('teacher').prefetch_related('enrollments__student').order_by('grade','name')]}))
    try:
        obj=data(request)
        name=str(obj.get('name','')).strip();grade=int(obj.get('grade',0))
        teacher=get_user_model().objects.get(username=obj.get('teacher'),is_active=True)
        if role(teacher)!='teacher' or not name or len(name)>100 or grade not in range(1,13): return err('Indica nome, classe (1 a 12) e professor activo.')
        item=Classroom(name=name,grade=grade,teacher=teacher);item.full_clean();item.save()
    except ValidationError as e:return err(' '.join(e.messages))
    except (ValueError,TypeError,get_user_model().DoesNotExist):return err('Turma ou professor inválido.')
    except IntegrityError:return err('Esta turma já existe.',409)
    return JsonResponse(class_dict(item,True),status=201)


@require_http_methods(['GET','POST'])
def attendance(request):
    blocked=guard(request,{'admin'})
    if blocked:return blocked
    try:
        obj=request.GET if request.method=='GET' else data(request)
        classroom=get_object_or_404(Classroom,pk=int(obj.get('class_id')))
        day=date.fromisoformat(str(obj.get('date','')))
        if day>timezone.localdate():return err('Não é possível registar presenças numa data futura.')
        if request.method=='GET':
            roster=list(get_user_model().objects.filter(edubox_enrollments__classroom=classroom,is_active=True).order_by('first_name','username'))
            records={r.student_id:r for r in Attendance.objects.filter(classroom=classroom,date=day).select_related('student')}
            current={u.id for u in roster}
            return private_response(JsonResponse({'results':[{**who(u),'state':records[u.id].state if u.id in records else ''} for u in roster],
                'historical':[{**who(r.student),'state':r.state} for sid,r in records.items() if sid not in current]}))
        marks=obj.get('marks')
        if not isinstance(marks,list) or len(marks)>1000:return err('Lista de presenças inválida.')
        if not marks:return err('Selecciona pelo menos um estado de presença.')
        usernames=[]
        for mark in marks:
            if not isinstance(mark,dict) or not isinstance(mark.get('username'),str) or mark.get('state') not in dict(Attendance.STATES):return err('Estado de presença inválido.')
            usernames.append(mark['username'])
        if len(set(usernames))!=len(usernames):return err('Há alunos repetidos na lista.')
        with transaction.atomic():
            Classroom.objects.select_for_update().get(pk=classroom.pk)
            students={u.username:u for u in get_user_model().objects.filter(username__in=usernames,is_active=True,edubox_enrollments__classroom=classroom).distinct()}
            if len(students)!=len(usernames):return err('A turma mudou. Actualiza a lista antes de guardar.',409)
            for mark in marks:
                Attendance.objects.update_or_create(classroom=classroom,student=students[mark['username']],date=day,defaults={'state':mark['state'],'recorded_by':request.user})
    except (ValueError,TypeError):return err('Selecciona uma turma e uma data válida.')
    return JsonResponse({'ok':True,'saved_count':len(marks)})


def event_dict(item):
    return {'id':item.id,'title':item.title,'date':item.date.isoformat(),'location':item.location,'description':item.description,'published':item.published}


@require_http_methods(['GET','POST'])
def calendar(request):
    blocked=guard(request,{'admin'})
    if blocked:return blocked
    if request.method=='GET':return private_response(JsonResponse({'results':[event_dict(e) for e in SchoolEvent.objects.all()]}))
    try:
        obj=data(request)
        item=get_object_or_404(SchoolEvent,pk=int(obj['id'])) if obj.get('id') else SchoolEvent(author=request.user)
        for key in ['title','location','description']:setattr(item,key,str(obj.get(key,'')).strip())
        item.date=date.fromisoformat(str(obj.get('date','')))
        item.published=obj.get('published',False)
        if type(item.published) is not bool:return err('Estado de publicação inválido.')
        item.full_clean();item.save()
    except ValidationError as e:return err(' '.join(e.messages))
    except (ValueError,TypeError):return err('Evento ou data inválida.')
    return JsonResponse(event_dict(item))


@require_GET
def summary(request):
    blocked=guard(request,{'admin'})
    if blocked:return blocked
    today=timezone.localdate()
    User=get_user_model()
    attendance_counts={r['state']:r['total'] for r in Attendance.objects.filter(date__gte=today-timedelta(days=29),date__lte=today).values('state').annotate(total=Count('id'))}
    return private_response(JsonResponse({'school':public_profile(), 'today':today.isoformat(), 'counts':{
        'students':User.objects.filter(is_active=True,groups__name='Aluno',is_superuser=False).distinct().count(),
        'teachers':User.objects.filter(is_active=True,groups__name='Professor',is_superuser=False).distinct().count(),
        'classes':Classroom.objects.count(),'unassigned_students':User.objects.filter(is_active=True,groups__name='Aluno',is_superuser=False,edubox_enrollments__isnull=True).distinct().count(),
        'activities':Assignment.objects.count(),'pending_grades':Submission.objects.filter(score__isnull=True).count(),
        'library':Resource.objects.filter(published=True).exclude(kind__in=['audio','audiobook']).exclude(file__iendswith='.mp3').count(),
        'notices':Announcement.objects.filter(school_wide=True,published=True).count()},
        'attendance':attendance_counts,'events':[event_dict(e) for e in SchoolEvent.objects.filter(date__gte=today)[:5]]}))
