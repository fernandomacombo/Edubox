from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods, require_POST
from .models import Announcement, AnnouncementRead, Classroom
from .portal_views import data, err, guard, role, who


def visible_announcements(request):
    qs = Announcement.objects.select_related('author').prefetch_related('classrooms')
    if role(request.user) == 'teacher':
        return qs.filter(author=request.user)
    return qs.filter(classrooms__enrollments__student=request.user).distinct()


@require_http_methods(['GET', 'POST'])
def announcements(request):
    blocked = guard(request, {'teacher', 'student'} if request.method == 'GET' else {'teacher'})
    if blocked:
        return blocked
    if request.method == 'POST':
        try:
            obj = data(request)
            title = str(obj.get('title', '')).strip()
            body = str(obj.get('body', '')).strip()
            audience = obj.get('audience')
            if not title or len(title) > 180 or not body or len(body) > 2000:
                return err('Preenche o título (até 180 caracteres) e a mensagem (até 2000).')
            targets = Classroom.objects.filter(teacher=request.user)
            if audience == 'class':
                targets = targets.filter(pk=int(obj.get('class_id')))
            elif audience != 'all':
                return err('Escolhe uma turma ou todas as tuas turmas.')
            targets = list(targets)
            if not targets:
                return err('Não tens autorização para a turma seleccionada, ou ainda não tens turmas.', 403)
        except (ValueError, TypeError):
            return err('Turma ou mensagem inválida.')
        with transaction.atomic():
            item = Announcement.objects.create(author=request.user, title=title, body=body)
            item.classrooms.set(targets)
        return JsonResponse({'id': item.id, 'ok': True}, status=201)

    qs = visible_announcements(request)
    is_student = role(request.user) == 'student'
    read_ids = set(AnnouncementRead.objects.filter(student=request.user).values_list('announcement_id', flat=True)) if is_student else set()
    unread = qs.exclude(id__in=read_ids).count() if is_student else 0
    # Show unread first, so a long history cannot hide an unread notification.
    from django.db.models import Case, When, Value, IntegerField
    qs = qs.annotate(read_order=Case(When(id__in=read_ids, then=Value(1)), default=Value(0), output_field=IntegerField())).order_by('read_order', '-created_at', '-id')
    enrolled = set(Classroom.objects.filter(enrollments__student=request.user).values_list('id', flat=True)) if is_student else None
    result = [{'id': item.id, 'title': item.title, 'body': item.body,
               'author': who(item.author), 'created_at': item.created_at.isoformat(),
               'class_names': [c.name for c in item.classrooms.all() if enrolled is None or c.id in enrolled],
               'read': item.id in read_ids if is_student else True}
              for item in qs[:100]]
    response = JsonResponse({'results': result, 'unread_count': unread})
    response['Cache-Control'] = 'private, no-store'
    return response


@require_POST
def mark_read(request, pk):
    blocked = guard(request, {'student'})
    if blocked:
        return blocked
    item = get_object_or_404(visible_announcements(request), pk=pk)
    AnnouncementRead.objects.get_or_create(announcement=item, student=request.user)
    return JsonResponse({'ok': True})
