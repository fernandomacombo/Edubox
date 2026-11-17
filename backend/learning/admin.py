from django.contrib import admin
from django import forms
from django.db import models
from .models import Choice, Question, Quiz, Resource, Subject

class SchoolAdmin(admin.ModelAdmin):
    # A gestão global é reservada ao administrador, mesmo para professores staff.
    def has_module_permission(self, request):
        return request.user.is_superuser
    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser
    def has_add_permission(self, request):
        return request.user.is_superuser
    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser
    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "grade")
    list_filter = ("grade",)
    search_fields = ("name",)

class ProtectedFileInput(forms.ClearableFileInput):
    template_name = 'admin/learning/protected_file_input.html'


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    formfield_overrides = {models.FileField: {'widget': ProtectedFileInput}}
    list_display = ("title", "kind", "author", "subject", "published", "created_at")
    list_filter = ("kind", "published", "subject__grade", "subject", "language")
    search_fields = ("title", "description", "author")
    fieldsets = (("Catálogo público da biblioteca", {"fields": ("title", "kind", "subject", "author", "language", "description")}), ("Conteúdo", {"fields": ("body", "file", "external_url")}), ("Publicação", {"fields": ("rights_note", "published"), "description": "Materiais publicados podem ser consultados por todas as classes. Não publique aqui fichas privadas ou respostas de alunos."}))

class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1

class QuizAdminForm(forms.ModelForm):
    class Meta:
        model = Quiz
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        subject = cleaned.get('subject')
        classrooms = cleaned.get('classrooms')
        if subject and classrooms is not None and classrooms.exclude(grade=subject.grade).exists():
            raise forms.ValidationError('Selecciona apenas turmas da classe do exercício.')
        return cleaned


@admin.register(Quiz)
class QuizAdmin(SchoolAdmin):
    form = QuizAdminForm
    filter_horizontal = ("classrooms",)
    list_display = ("title", "subject", "published")
    list_filter = ("published", "subject__grade")
    inlines = [QuestionInline]

class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 4

@admin.register(Question)
class QuestionAdmin(SchoolAdmin):
    list_display = ("prompt", "quiz", "position")
    list_filter = ("quiz__subject__grade", "quiz")
    inlines = [ChoiceInline]


from .models import Classroom, Enrollment, Assignment, Submission

@admin.register(Classroom)
class ClassroomAdmin(SchoolAdmin):
    list_display = ('name','grade','teacher')
    list_filter = ('grade',)

@admin.register(Enrollment)
class EnrollmentAdmin(SchoolAdmin):
    list_display = ('classroom','student')

@admin.register(Assignment)
class AssignmentAdmin(SchoolAdmin):
    list_display = ('title','classroom','published')
    exclude = ('attachment',)
    readonly_fields = ('private_pdf',)

    @admin.display(description='PDF privado')
    def private_pdf(self, obj):
        if not obj or not obj.attachment:
            return 'Sem PDF. Publica os novos PDFs através do portal do professor.'
        return 'PDF guardado. Consulta disponível no leitor da ficha, no espaço do professor.'

@admin.register(Submission)
class SubmissionAdmin(SchoolAdmin):
    list_display = ('student','assignment','score')
    readonly_fields = ('student','assignment','answer','submitted_at')
