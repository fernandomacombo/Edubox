from django.contrib import admin
from .models import Choice, Question, Quiz, Resource, Subject

@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "grade")
    list_filter = ("grade",)
    search_fields = ("name",)

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ("title", "subject", "published", "created_at")
    list_filter = ("published", "subject__grade", "subject")
    search_fields = ("title", "description")

class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1

@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "subject", "published")
    list_filter = ("published", "subject__grade")
    inlines = [QuestionInline]

class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 4

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("prompt", "quiz", "position")
    list_filter = ("quiz__subject__grade", "quiz")
    inlines = [ChoiceInline]


from .models import Classroom, Enrollment, Assignment, Submission

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
        from django.utils.html import format_html
        from django.urls import reverse
        if not obj or not obj.attachment:
            return 'Sem PDF. Publica os novos PDFs através do portal do professor.'
        return format_html('<a href="{}">Abrir PDF privado</a>', reverse('portal_assignment_file', args=[obj.pk]))

@admin.register(Submission)
class SubmissionAdmin(SchoolAdmin):
    list_display = ('student','assignment','score')
    readonly_fields = ('student','assignment','answer','submitted_at')
