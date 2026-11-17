import json
from django.db.models import Count, Q, F
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .models import Quiz, Resource, Subject
from .portal_views import guard, role
from .readers import describe_file, media_url, private_response, render_page, valid_media_token


def library_resources():
    # Old audio records are retained for the school, but no longer exposed to readers.
    return Resource.objects.filter(published=True).exclude(kind__in=['audio', 'audiobook']).exclude(file__iendswith='.mp3')


def selected_grade(request: HttpRequest):
    raw = request.GET.get("grade")
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return -1
    return value if 1 <= value <= 12 else -1


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "mode": "local", "product": "EduBox MVP"})


@require_GET
def subjects(request):
    qs = Subject.objects.annotate(
        material_count=Count("resources", filter=Q(resources__published=True), distinct=True),
    )
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(grade=grade)
    return JsonResponse({"results": [{
        "id": s.id, "name": s.name, "grade": s.grade,
        "description": s.description, "material_count": s.material_count,
    } for s in qs]})


@require_GET
def resources(request):
    qs = library_resources().select_related("subject")
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(subject__grade=grade)
    kind = request.GET.get('kind')
    subject_id = request.GET.get('subject')
    search = request.GET.get('q', '').strip()[:200]
    if kind:
        qs = qs.filter(kind=kind)
    if subject_id:
        qs = qs.filter(subject_id=subject_id) if subject_id.isdigit() else qs.none()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search) | Q(author__icontains=search) | Q(category__icontains=search) | Q(subject__name__icontains=search))
    return JsonResponse({"results": [{
        "kind": r.kind, "kind_label": r.get_kind_display(), "author": r.author, "language": r.language,
        "subject_id": r.subject_id, "created_at": r.created_at.isoformat(),
        "file_format": r.file.name.rsplit('.', 1)[-1].lower() if r.file else None,
        "id": r.id, "title": r.title, "description": r.description,
        "category": r.category, "subject": r.subject.name if r.subject else "Leitura geral", "grade": r.subject.grade if r.subject else None,
        "has_file": bool(r.file), "has_text": bool(r.body), "has_external": bool(r.external_url),
        "rights_note": r.rights_note,
    } for r in qs]})


@require_GET
def resource_detail(request, pk):
    blocked = guard(request, {'student', 'teacher', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(library_resources().select_related('subject'), pk=pk)
    info = {'id': item.id, 'title': item.title, 'body': item.body,
            'viewer_label': request.user.username, 'viewer': None}
    if item.file:
        try:
            info['viewer'] = describe_file(item.file, f'/api/resources/{item.id}/pages/', request, media_url(item, request))
        except Exception:
            return JsonResponse({'error': 'Não foi possível abrir o ficheiro. Pede à escola que o verifique.'}, status=422)
    # External providers cannot enforce EduBox reading restrictions. Keep their links in admin only.
    info['external_only'] = bool(item.external_url and not item.file and not item.body)
    return private_response(JsonResponse(info))


@require_GET
def resource_page(request, pk):
    blocked = guard(request, {'student', 'teacher', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(library_resources(), pk=pk)
    if not item.file:
        return JsonResponse({'error': 'Sem ficheiro.'}, status=404)
    return render_page(item.file, request)


def visible_quizzes(request):
    qs = Quiz.objects.filter(published=True).select_related('subject')
    user_role = role(request.user)
    if user_role == 'admin':
        return qs
    if user_role == 'teacher':
        return qs.filter(classrooms__teacher=request.user, classrooms__grade=F('subject__grade')).distinct()
    if user_role == 'student':
        return qs.filter(classrooms__enrollments__student=request.user, classrooms__grade=F('subject__grade')).distinct()
    return qs.none()


@require_GET
def quizzes(request):
    qs = visible_quizzes(request).annotate(question_count=Count('questions', distinct=True))
    grades = list(qs.order_by('subject__grade').values_list('subject__grade', flat=True).distinct())
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(subject__grade=grade)
    response = JsonResponse({'grades': grades, 'login_required': role(request.user) is None, 'results': [{
        'id': quiz.id, 'title': quiz.title, 'grade': quiz.subject.grade,
        'subject': quiz.subject.name, 'question_count': quiz.question_count,
    } for quiz in qs]})
    response['Cache-Control'] = 'private, no-store'
    return response


@require_GET
def quiz_detail(request, quiz_id):
    blocked = guard(request, {'teacher', 'student', 'admin'})
    if blocked:
        return blocked
    quiz = get_object_or_404(visible_quizzes(request), pk=quiz_id)
    questions = list(quiz.questions.prefetch_related("choices"))
    return JsonResponse({
        "id": quiz.id, "title": quiz.title,
        "questions": [{
            "id": q.id, "prompt": q.prompt,
            "choices": [{"id": c.id, "text": c.text} for c in q.choices.all()],
        } for q in questions],
    })


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({"ready": True})


@require_POST
def submit_quiz(request, quiz_id):
    blocked = guard(request, {'teacher', 'student', 'admin'})
    if blocked:
        return blocked
    quiz = get_object_or_404(visible_quizzes(request), pk=quiz_id)
    try:
        body = json.loads(request.body)
        answers = body.get("answers", {})
    except (json.JSONDecodeError, ValueError, AttributeError):
        return JsonResponse({"error": "Formato JSON inválido."}, status=400)
    if not isinstance(answers, dict):
        return JsonResponse({"error": "As respostas devem ser um objecto JSON."}, status=400)
    questions = list(quiz.questions.prefetch_related("choices"))
    score = 0
    corrections = []
    for question in questions:
        selected = str(answers.get(str(question.id), ""))
        choices = list(question.choices.all())
        good = next((choice for choice in choices if choice.correct), None)
        correct = bool(good and selected == str(good.id))
        score += int(correct)
        corrections.append({
            "question_id": question.id, "correct": correct,
            "correct_choice_id": good.id if good else None,
            "correct_text": good.text if good else "Sem resposta configurada",
        })
    return JsonResponse({"score": score, "total": len(questions), "corrections": corrections})


@require_GET
def resource_file(request, path):
    # Preserve old links, but never serve unpublished or arbitrary media files.
    from django.http import FileResponse
    blocked = guard(request, {'student', 'teacher', 'admin'})
    if blocked:
        return blocked
    item = get_object_or_404(library_resources(), file=path)
    if not item.file.name.lower().endswith('.mp4') or not valid_media_token(item, request):
        return JsonResponse({'error': 'Abre o material através do leitor da biblioteca.'}, status=403)

    try:
        opened = item.file.open('rb')
    except (OSError, ValueError):
        return JsonResponse({'error': 'Ficheiro indisponível.'}, status=404)
    # Byte ranges allow seeking in local videos.
    import mimetypes
    import re
    from django.http import HttpResponse, StreamingHttpResponse
    filename = item.file.name.rsplit('/', 1)[-1]
    size = opened.size
    range_header = request.headers.get('Range')
    if range_header:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header)
        valid = match is not None and any(match.groups()) and size > 0
        start, end = 0, size - 1
        if valid:
            left, right = match.groups()
            try:
                if left:
                    start = int(left)
                    end = min(int(right), size - 1) if right else size - 1
                    valid = start <= end and start < size
                else:
                    suffix = int(right)
                    start = max(0, size - suffix)
                    valid = suffix > 0
            except ValueError:
                valid = False
        if not valid:
            opened.close()
            return HttpResponse(status=416, headers={'Content-Range': f'bytes */{size}'})
        opened.seek(start)
        def chunks():
            remaining = end - start + 1
            try:
                while remaining:
                    chunk = opened.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
            finally:
                opened.close()
        response = StreamingHttpResponse(chunks(), status=206, content_type=mimetypes.guess_type(filename)[0] or 'application/octet-stream')
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
        response['Content-Length'] = str(end - start + 1)
    else:
        response = FileResponse(opened, filename=filename)
    response['Accept-Ranges'] = 'bytes'

    private_response(response)
    response['Content-Security-Policy'] = 'sandbox'
    return response
