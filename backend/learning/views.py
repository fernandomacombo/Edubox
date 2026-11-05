import json
from django.db.models import Count, Q
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .models import Quiz, Resource, Subject


def selected_grade(request: HttpRequest):
    raw = request.GET.get("grade")
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return -1
    return value if 8 <= value <= 12 else -1


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "mode": "local", "product": "EduBox MVP"})


@require_GET
def subjects(request):
    qs = Subject.objects.annotate(
        material_count=Count("resources", filter=Q(resources__published=True), distinct=True),
        quiz_count=Count("quizzes", filter=Q(quizzes__published=True), distinct=True),
    )
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(grade=grade)
    return JsonResponse({"results": [{
        "id": s.id, "name": s.name, "grade": s.grade,
        "description": s.description, "material_count": s.material_count,
        "quiz_count": s.quiz_count,
    } for s in qs]})


@require_GET
def resources(request):
    qs = Resource.objects.filter(published=True).select_related("subject")
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(subject__grade=grade)
    return JsonResponse({"results": [{
        "id": r.id, "title": r.title, "description": r.description,
        "subject": r.subject.name, "grade": r.subject.grade,
        "file_url": r.file.url if r.file else None,
        "body": r.body,
        "external_url": r.external_url or None,
        "rights_note": r.rights_note,
    } for r in qs]})


@require_GET
def quizzes(request):
    qs = Quiz.objects.filter(published=True).select_related("subject").annotate(
        question_count=Count("questions", distinct=True)
    )
    grade = selected_grade(request)
    if grade is not None:
        qs = qs.filter(subject__grade=grade)
    return JsonResponse({"results": [{
        "id": quiz.id, "title": quiz.title, "grade": quiz.subject.grade,
        "subject": quiz.subject.name, "question_count": quiz.question_count,
    } for quiz in qs]})


@require_GET
def quiz_detail(request, quiz_id):
    quiz = get_object_or_404(Quiz.objects.filter(published=True), pk=quiz_id)
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
    quiz = get_object_or_404(Quiz.objects.filter(published=True), pk=quiz_id)
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
    item = get_object_or_404(Resource.objects.filter(published=True), file=path)
    try:
        opened = item.file.open('rb')
    except (OSError, ValueError):
        return JsonResponse({'error': 'Ficheiro indisponível.'}, status=404)
    response = FileResponse(opened, filename=item.file.name.rsplit('/', 1)[-1])
    response['Cache-Control'] = 'no-store'
    response['Content-Security-Policy'] = 'sandbox'
    return response
