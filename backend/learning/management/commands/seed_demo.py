from django.core.management.base import BaseCommand
from learning.models import Choice, Question, Quiz, Resource, Subject

DEMO = [
    (8, "Matemática", "Números, álgebra e resolução de problemas.",
     "Operações com números inteiros", [
         ("Quanto é (-3) + 7?", [("4", True), ("-10", False), ("10", False)]),
         ("Qual é o produto de (-2) × (-5)?", [("-10", False), ("10", True), ("7", False)]),
     ]),
    (9, "Português", "Leitura, escrita e comunicação.",
     "Elementos da gramática", [
         ("Qual das palavras é um verbo?", [("Correr", True), ("Bonito", False), ("Escola", False)]),
         ("Qual é o plural de 'papel'?", [("Papels", False), ("Papéis", True), ("Papelses", False)]),
     ]),
    (10, "Biologia", "Conhecimentos essenciais sobre a vida.",
     "Introdução à célula", [
         ("Que estrutura contém o material genético da célula eucariótica?", [("Núcleo", True), ("Parede celular", False), ("Ribossoma", False)]),
     ]),
]

class Command(BaseCommand):
    help = "Cria disciplinas e testes demonstrativos originais (não oficiais)."

    def handle(self, *args, **options):
        for grade, name, description, quiz_title, questions in DEMO:
            subject, _ = Subject.objects.get_or_create(
                grade=grade, name=name, defaults={"description": description}
            )
            lesson_bodies = {
                "Matemática": "NÚMEROS INTEIROS\n\nOs números inteiros incluem números negativos, zero e números positivos.\n\nExemplo: -3 + 7 = 4. Quando somamos um número negativo e outro positivo, comparamos os valores absolutos e conservamos o sinal do maior.\n\nPratica: quanto é -5 + 9?",
                "Português": "CLASSES DE PALAVRAS\n\nOs verbos indicam acções, estados ou acontecimentos.\n\nExemplos: correr, estudar, aprender.\n\nOs substantivos podem nomear pessoas, lugares e objectos.\n\nPratica: identifica o verbo na frase 'A aluna estuda matemática'.",
                "Biologia": "INTRODUÇÃO À CÉLULA\n\nA célula é uma unidade estrutural e funcional dos seres vivos.\n\nAs células eucarióticas apresentam um núcleo delimitado por membrana.\n\nPratica: indica uma diferença entre célula procariótica e eucariótica.",
            }
            Resource.objects.get_or_create(subject=subject, title=f"Aula introdutória — {name}", defaults={"body": lesson_bodies[name], "description": "Material demonstrativo criado para testar a plataforma.", "rights_note": "Conteúdo original de demonstração."})
            quiz, created = Quiz.objects.get_or_create(subject=subject, title=quiz_title)
            if created:
                for index, (prompt, choices) in enumerate(questions, start=1):
                    question = Question.objects.create(quiz=quiz, prompt=prompt, position=index)
                    Choice.objects.bulk_create([
                        Choice(question=question, text=text, correct=correct)
                        for text, correct in choices
                    ])
        self.stdout.write(self.style.SUCCESS("Disciplinas e exercícios de demonstração criados."))
