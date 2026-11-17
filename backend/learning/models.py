from pathlib import Path
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.db import models

GRADES = [(i, f"{i}.ª classe") for i in range(8, 13)]
MAX_UPLOAD_SIZE = 80 * 1024 * 1024
ALLOWED_UPLOAD_SUFFIXES = {".pdf", ".mp4", ".png", ".jpg", ".jpeg", ".webp"}


def validate_resource_file(value):
    if not value:
        return
    if Path(value.name).suffix.lower() not in ALLOWED_UPLOAD_SUFFIXES:
        raise ValidationError("Formato não permitido. Use PDF, MP4, JPG, PNG ou WEBP.")
    if value.size > MAX_UPLOAD_SIZE:
        raise ValidationError("O ficheiro deve ter no máximo 80 MB nesta versão.")


class Subject(models.Model):
    name = models.CharField("Disciplina", max_length=100)
    grade = models.PositiveSmallIntegerField("Classe", choices=GRADES)
    description = models.TextField("Descrição", blank=True)

    class Meta:
        verbose_name = "Disciplina"
        verbose_name_plural = "Disciplinas"
        ordering = ["grade", "name"]
        constraints = [models.UniqueConstraint(fields=["name", "grade"], name="unique_subject_grade")]

    def __str__(self):
        return f"{self.name} — {self.get_grade_display()}"


class Resource(models.Model):
    KIND_CHOICES = [
        ('book', 'Livro'), ('research', 'Trabalho de pesquisa'),
        ('video', 'Vídeo'), ('ebook', 'Ebook (PDF)'),
        ('document', 'Documento / apontamentos'), ('image', 'Imagem'),
        ('other', 'Outros materiais'),
    ]
    kind = models.CharField('Tipo de material', max_length=20, choices=KIND_CHOICES, default='other')
    author = models.CharField('Autor / instituição', max_length=180, blank=True)
    language = models.CharField('Idioma', max_length=60, blank=True)
    category = models.CharField("Tema / categoria", max_length=100, default="Geral")
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name="resources", verbose_name="Disciplina (opcional)")
    title = models.CharField("Título", max_length=180)
    description = models.TextField("Descrição", blank=True)
    body = models.TextField("Conteúdo da aula (texto simples)", blank=True)
    file = models.FileField("Ficheiro local", upload_to="resources/%Y/%m/", validators=[validate_resource_file], blank=True)
    external_url = models.URLField("Ligação online alternativa", blank=True)
    rights_note = models.CharField("Direitos / licença do material", max_length=240, blank=True,
                                   help_text="Indique a origem e confirmação de direito de distribuição.")
    published = models.BooleanField("Publicado", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Material didáctico"
        verbose_name_plural = "Materiais didácticos"
        ordering = ["-created_at"]

    def clean(self):
        if not self.file and not self.external_url and not self.body:
            raise ValidationError("Adicione um texto, ficheiro local ou uma ligação externa.")

    def __str__(self):
        return self.title


class Quiz(models.Model):
    classrooms = models.ManyToManyField('Classroom', blank=True, related_name='quizzes',
                                       verbose_name='Turmas autorizadas',
                                       help_text='Sem turmas seleccionadas, o exercício fica reservado à administração.')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="quizzes", verbose_name="Disciplina")
    title = models.CharField("Título", max_length=180)
    published = models.BooleanField("Publicado", default=True)

    class Meta:
        verbose_name = "Teste"
        verbose_name_plural = "Testes"

    def __str__(self):
        return self.title


class Question(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions", verbose_name="Teste")
    prompt = models.TextField("Pergunta")
    position = models.PositiveSmallIntegerField("Ordem", default=1)

    class Meta:
        verbose_name = "Pergunta"
        verbose_name_plural = "Perguntas"
        ordering = ["position", "id"]

    def __str__(self):
        return self.prompt[:90]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices", verbose_name="Pergunta")
    text = models.CharField("Resposta", max_length=300)
    correct = models.BooleanField("Correcta", default=False)

    class Meta:
        verbose_name = "Opção de resposta"
        verbose_name_plural = "Opções de resposta"

    def __str__(self):
        return self.text


# EduBox v0.2 — aprendizagem por turmas no servidor local.
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

class Classroom(models.Model):
    name = models.CharField('Turma', max_length=100)
    grade = models.PositiveSmallIntegerField('Classe', choices=GRADES)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='edubox_classes')
    class Meta:
        verbose_name = 'Turma'
        verbose_name_plural = 'Turmas'
        constraints = [models.UniqueConstraint(fields=['name','grade','teacher'], name='unique_teacher_class')]
    def __str__(self): return f'{self.name} — {self.grade}.ª classe'

class Enrollment(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name='enrollments')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='edubox_enrollments')
    class Meta:
        verbose_name = 'Inscrição'
        verbose_name_plural = 'Inscrições'
        constraints = [models.UniqueConstraint(fields=['classroom','student'], name='unique_class_student')]
    def __str__(self): return f'{self.student.username} / {self.classroom}'

# As fichas privadas sao guardadas fora de MEDIA_ROOT e nao aparecem na rota /media/.
MAX_ASSIGNMENT_PDF_SIZE = 15 * 1024 * 1024


def private_assignment_storage():
    return FileSystemStorage(location=settings.BASE_DIR / "private_assignments")


def validate_assignment_pdf(value):
    if not value:
        return
    if Path(value.name).suffix.lower() != ".pdf":
        raise ValidationError("Escolhe um documento PDF.")
    if value.size > MAX_ASSIGNMENT_PDF_SIZE:
        raise ValidationError("O PDF nao pode exceder 15 MB.")
    try:
        position = value.tell()
        value.seek(0)
        header = value.read(5)
        value.seek(position)
    except (OSError, ValueError, AttributeError):
        raise ValidationError("Nao foi possivel validar o documento PDF.")
    if header != b"%PDF-":
        raise ValidationError("Este ficheiro nao tem uma assinatura PDF valida.")


class Assignment(models.Model):
    KIND_CHOICES = [('exercise', 'Exercício'), ('group', 'Trabalho em grupo'), ('assessment', 'Avaliação')]
    kind = models.CharField('Tipo de actividade', max_length=20, choices=KIND_CHOICES, default='exercise')
    accepting_submissions = models.BooleanField('Aceita entregas', default=True)
    correction = models.TextField('Correcção / resolução', max_length=12000, blank=True)
    correction_published = models.BooleanField('Correcção publicada', default=False)

    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name='assignments')
    resource = models.ForeignKey(Resource, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField('Ficha', max_length=180)
    attachment = models.FileField('PDF privado da ficha', upload_to='assignments/%Y/%m/',
                                  storage=private_assignment_storage,
                                  validators=[validate_assignment_pdf], blank=True)
    instructions = models.TextField('Instruções', max_length=4000)
    published = models.BooleanField('Publicada', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        verbose_name = 'Ficha atribuída'
        verbose_name_plural = 'Fichas atribuídas'
        ordering = ['-created_at']
    def clean(self):
        if self.resource_id and self.attachment:
            raise ValidationError('Escolhe um material existente ou um novo PDF, nunca ambos.')
        if self.resource_id and self.classroom_id:
            if not self.resource.published or (self.resource.subject_id and self.resource.subject.grade != self.classroom.grade):
                raise ValidationError('O material deve estar publicado e pertencer à classe da turma.')

    def __str__(self): return self.title

class AssignmentGroup(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='work_groups')
    name = models.CharField('Nome do grupo', max_length=100)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment', 'name'], name='unique_assignment_group_name')]

class GroupMember(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE)
    group = models.ForeignKey(AssignmentGroup, on_delete=models.CASCADE, related_name='members')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment', 'student'], name='unique_assignment_group_student')]

class Submission(models.Model):
    group = models.ForeignKey(AssignmentGroup, null=True, blank=True, on_delete=models.PROTECT)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='edubox_deliveries')

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='submissions')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='edubox_submissions')
    answer = models.TextField('Resposta', max_length=8000)
    submitted_at = models.DateTimeField(auto_now_add=True)
    score = models.PositiveSmallIntegerField('Nota (0–20)', null=True, blank=True, validators=[MinValueValidator(0),MaxValueValidator(20)])
    feedback = models.TextField('Comentário', max_length=2000, blank=True)
    class Meta:
        verbose_name = 'Resposta de aluno'
        verbose_name_plural = 'Respostas de alunos'
        constraints = [models.UniqueConstraint(fields=['assignment','student'], name='unique_assignment_student')]
    def __str__(self): return f'{self.student.username}: {self.assignment.title}'



class Announcement(models.Model):
    school_wide = models.BooleanField('Informe da escola', default=False)
    published = models.BooleanField('Publicado', default=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='edubox_announcements')
    classrooms = models.ManyToManyField(Classroom, related_name='announcements', verbose_name='Turmas destinatárias')
    title = models.CharField('Título', max_length=180)
    body = models.TextField('Mensagem', max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = 'Anúncio'
        verbose_name_plural = 'Anúncios'

    def __str__(self):
        return self.title


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='reads')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['announcement', 'student'], name='unique_announcement_reader')]


class TransferRecord(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    kind = models.CharField(max_length=20)
    details = models.JSONField(default=dict)
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = 'Registo de transferência'
        verbose_name_plural = 'Registos de transferências'
