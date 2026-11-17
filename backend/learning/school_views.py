"""School-owned catalogue, public bulletin and audited membership changes."""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from .models import Announcement, Classroom, Enrollment, Resource, Subject, TransferRecord
from .portal_views import class_dict, data, err, guard, role, who
from .readers import private_response, describe_file, render_page


def notice_dict(item):
    return {'id': item.id, 'title': item.title, 'body': item.body,
            'published': item.published, 'created_at': item.created_at.isoformat(),
            'has_document': bool(item.attachment), 'document_name': item.attachment.name.rsplit('/', 1)[-1] if item.attachment else ''}


@require_GET
def bulletin(request):
    from .school_management import public_profile, event_dict
    from .models import SchoolEvent
    from django.utils import timezone
    return JsonResponse({'school': public_profile(), 'events': [event_dict(e) for e in SchoolEvent.objects.filter(published=True, date__gte=timezone.localdate())[:20]], 'results': [notice_dict(n) for n in Announcement.objects.filter(school_wide=True, published=True)[:100]]})


@require_http_methods(['GET', 'POST'])
def notices(request):
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    if request.method == 'GET':
        return private_response(JsonResponse({'results': [notice_dict(n) for n in Announcement.objects.filter(school_wide=True)[:100]]}))
    try:
        obj = request.POST if request.content_type.startswith('multipart/form-data') else data(request)
        title, body = str(obj.get('title', '')).strip(), str(obj.get('body', '')).strip()
        published = obj.get('published', False)
        if published not in [True,False,'true','false']: return err('Estado de publicação inválido.')
        published = published in [True,'true']
        if not title or len(title) > 180 or len(body) > 2000:
            return err('Preenche o título e o informe, respeitando os limites indicados.')
        item = get_object_or_404(Announcement, pk=obj['id'], school_wide=True) if obj.get('id') else Announcement(author=request.user, school_wide=True)
        upload = request.FILES.get('file')
        remove = obj.get('remove_document') in [True, 'true']
        if upload and remove: return err('Escolhe substituir ou remover o documento.')
        if upload:
            from .models import validate_assignment_pdf
            validate_assignment_pdf(upload)
            item.attachment = upload
        elif remove: item.attachment = ''
        if not body and not item.attachment: return err('Escreve o informe ou anexa um documento PDF.')
    except ValidationError as e: return err(' '.join(e.messages))
    except (ValueError, TypeError): return err('Informe inválido.')
    notify_again = bool(item.pk and published and (not item.published or item.title != title or item.body != body or upload or remove))
    with transaction.atomic():
        item.title, item.body, item.published = title, body, published
        item.save()
        if notify_again: item.reads.all().delete()
    return JsonResponse(notice_dict(item))


def resource_dict(r):
    return {'id': r.id, 'title': r.title, 'kind': r.kind, 'category': r.category,
            'author': r.author, 'language': r.language, 'description': r.description,
            'body': r.body, 'subject_id': r.subject_id, 'rights_note': r.rights_note,
            'published': r.published, 'file_name': r.file.name.rsplit('/', 1)[-1] if r.file else ''}


@require_http_methods(['GET', 'POST'])
def library(request):
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    if request.method == 'GET':
        return private_response(JsonResponse({'results': [resource_dict(r) for r in Resource.objects.all()],
                                             'subjects': [{'id': s.id, 'name': str(s)} for s in Subject.objects.all()]}))
    try:
        obj = request.POST if request.content_type.startswith('multipart/form-data') else data(request)
        item = get_object_or_404(Resource, pk=int(obj['id'])) if obj.get('id') else Resource()
        for field in ['title', 'kind', 'category', 'author', 'language', 'description', 'body', 'rights_note']:
            setattr(item, field, str(obj.get(field, '')).strip())
        item.category = item.category or 'Geral'
        item.subject = get_object_or_404(Subject, pk=int(obj['subject_id'])) if obj.get('subject_id') else None
        publish = obj.get('published', False)
        if publish not in [True, False, 'true', 'false']: return err('Estado de publicação inválido.')
        item.published = publish in [True, 'true']
        upload = request.FILES.get('file')
        if upload: item.file = upload
        if item.kind not in dict(Resource.KIND_CHOICES): return err('Escolhe um tipo de material disponível. Áudios deixaram de fazer parte do catálogo.')
        if item.file and item.file.name.lower().endswith('.mp3'): return err('Substitui o áudio por um ebook em PDF ou outro formato permitido.')
        if item.kind == 'ebook' and (not item.file or not item.file.name.lower().endswith('.pdf')):
            return err('Carrega o ebook em PDF para leitura protegida.')
        if len(item.body) > 100000 or len(item.description) > 4000: return err('O texto excede o limite permitido.')
        item.full_clean()
    except ValidationError as e: return err(' '.join(e.messages))
    except (ValueError, TypeError): return err('Dados do material inválidos.')
    item.save()
    return JsonResponse(resource_dict(item))


@require_GET
def overview(request):
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    teachers = [who(u) for u in get_user_model().objects.filter(is_active=True, groups__name='Professor').distinct() if role(u) == 'teacher']
    classes = Classroom.objects.select_related('teacher').prefetch_related('enrollments__student').order_by('grade', 'name')
    return private_response(JsonResponse({'teachers': teachers, 'classes': [class_dict(c, True) for c in classes],
        'transfers': [{'id': r.id, 'kind': r.kind, 'details': r.details, 'reason': r.reason,
                       'actor': who(r.actor), 'created_at': r.created_at.isoformat()} for r in TransferRecord.objects.select_related('actor')[:100]]}))


@require_POST
def transfer(request):
    blocked = guard(request, {'admin'})
    if blocked: return blocked
    try:
        obj = data(request)
        kind, reason = obj.get('kind'), str(obj.get('reason', '')).strip()
        if kind not in ['teacher', 'student', 'student_exit'] or not reason or len(reason) > 500:
            return err('Escolhe o tipo de transferência e indica o motivo (até 500 caracteres).')
        with transaction.atomic():
            source = Classroom.objects.select_for_update().get(pk=int(obj.get('source_id')))
            if kind == 'teacher':
                if source.teacher.username != obj.get('previous_teacher'):
                    return err('O responsável já mudou. Actualiza os dados antes de continuar.', 409)
                target = get_user_model().objects.select_for_update().get(username=obj.get('target_teacher'), is_active=True)
                if role(target) != 'teacher' or target.pk == source.teacher_id:
                    return err('Escolhe outro professor activo.')
                details = {'classroom': str(source), 'from': source.teacher.username, 'to': target.username}
                source.teacher = target
                source.save(update_fields=['teacher'])
            else:
                student = get_user_model().objects.select_for_update().get(username=obj.get('student'), is_active=True)
                if role(student) != 'student': return err('Conta de aluno inválida.')
                enrollment = Enrollment.objects.select_for_update().filter(classroom=source, student=student).first()
                if not enrollment: return err('O aluno já não está nesta turma. Actualiza os dados.', 409)
                details = {'student': student.username, 'from': str(source)}
                if kind == 'student':
                    target = Classroom.objects.select_for_update().get(pk=int(obj.get('target_id')))
                    if target.pk == source.pk: return err('Escolhe uma turma diferente.')
                    if Enrollment.objects.filter(classroom=target, student=student).exists(): return err('O aluno já está inscrito na turma de destino.', 409)
                    Enrollment.objects.create(classroom=target, student=student)
                    enrollment.delete()
                    details['to'] = str(target)
                else:
                    details['from_classes'] = list(student.edubox_enrollments.values_list('classroom__name', flat=True))
                    details['to'] = 'Outra escola — conta desactivada'
                    # Preserve answers/grades; remove current access and disable existing sessions.
                    student.edubox_enrollments.all().delete()
                    student.is_active = False
                    student.save(update_fields=['is_active'])
            TransferRecord.objects.create(actor=request.user, kind=kind, reason=reason, details=details)
    except (ValueError, TypeError, Classroom.DoesNotExist, get_user_model().DoesNotExist): return err('Turma ou pessoa inválida. Actualiza os dados.')
    except IntegrityError: return err('A transferência entra em conflito com uma turma existente. Revê o destino.', 409)
    return JsonResponse({'ok': True, 'message': 'Transferência concluída. O histórico foi preservado.'})



def readable_notice(request, pk):
    qs = Announcement.objects.filter(school_wide=True)
    if role(request.user) != 'admin': qs = qs.filter(published=True)
    return get_object_or_404(qs, pk=pk)


@require_GET
def notice_reader(request, pk):
    item = readable_notice(request, pk)
    if not item.attachment: return err('Este informe não tem documento.', 404)
    try: viewer = describe_file(item.attachment, f'/api/school/notices/{pk}/pages/', request)
    except Exception: return err('Não foi possível abrir o documento. Pede à escola que verifique o PDF.', 422)
    return private_response(JsonResponse({'title': item.title, 'viewer': viewer}))


@require_GET
def notice_page(request, pk):
    item = readable_notice(request, pk)
    if not item.attachment: return err('Este informe não tem documento.', 404)
    return render_page(item.attachment, request)
