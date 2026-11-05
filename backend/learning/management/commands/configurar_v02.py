from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group
class Command(BaseCommand):
    help = 'Cria os grupos Professor e Aluno'
    def handle(self,*args,**kwargs):
        for name in ('Professor','Aluno'):
            Group.objects.get_or_create(name=name)
            self.stdout.write(f'Grupo {name}: pronto')
