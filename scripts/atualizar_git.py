"""Actualização Git sem sobrescrever alterações locais; backup compacto."""
from pathlib import Path
from datetime import datetime
import shutil
import sqlite3
import subprocess
import os
import sys
ROOT = Path(__file__).resolve().parents[1]

def run(args, cwd=ROOT, capture=False, env=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=capture, env=env)

def main():
    git = shutil.which('git')
    if not git: raise RuntimeError('Instala o Git para Windows primeiro.')
    status = run([git,'status','--porcelain'],capture=True).stdout.strip()
    if status: raise RuntimeError('Existem alterações locais no código. Guarda-as num commit antes de actualizar. Nenhum ficheiro foi substituído.')
    if run([git,'branch','--show-current'],capture=True).stdout.strip() != 'main':
        raise RuntimeError('Este actualizador espera a branch main. Não muda de branch automaticamente.')
    if shutil.disk_usage(ROOT).free < 1024**3:
        raise RuntimeError('Liberta pelo menos 1 GB no disco do projecto antes de actualizar.')
    python = ROOT/'backend/.venv/Scripts/python.exe'
    if not python.exists(): raise RuntimeError('Executa instalar_windows.bat primeiro.')
    before = run([git,'rev-parse','HEAD'],capture=True).stdout.strip()
    run([git,'fetch','origin','main'])
    upstream = run([git,'rev-parse','origin/main'],capture=True).stdout.strip()
    pending = ROOT/'runtime/update_pending'
    old_requirements = None
    old_lock = None
    backup = None
    if before == upstream and not pending.exists():
        print('Já tens a versão mais recente. Não foi criada outra cópia nem reinstalada nenhuma dependência.');return
    if before != upstream:
        run([git,'merge-base','--is-ancestor',before,upstream])
        backup = ROOT/'backups'/datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        backup.mkdir(parents=True)
        run([git,'bundle','create',str(backup/'codigo.bundle'),'HEAD'])
        db=ROOT/'backend/db.sqlite3'
        if db.exists():
            with sqlite3.connect(db) as source, sqlite3.connect(backup/'db.sqlite3') as dest: source.backup(dest)
        shutil.copytree(ROOT/'backend/learning/migrations',backup/'migrations',ignore=shutil.ignore_patterns('__pycache__'))
        old_requirements=(ROOT/'backend/requirements.txt').read_bytes()
        old_lock=(ROOT/'frontend/package-lock.json').read_bytes()
        pending.parent.mkdir(parents=True,exist_ok=True)
        pending.write_text(str(backup),encoding='utf-8')
        run([git,'merge','--ff-only',upstream])
    else:
        print('A retomar a validação interrompida, sem criar outro backup.')
        backup = pending.read_text(encoding='utf-8')
    env=os.environ.copy();temp=ROOT/'runtime/tmp';temp.mkdir(parents=True,exist_ok=True)
    env.update(TEMP=str(temp),TMP=str(temp),TMPDIR=str(temp))
    if old_requirements != (ROOT/'backend/requirements.txt').read_bytes():
        run([str(python),'-m','pip','install','-r','requirements.txt'],cwd=ROOT/'backend',env=env)
    for args in [('check',),('makemigrations','learning','--noinput'),('migrate','--noinput'),('test','learning')]:
        run([str(python),'manage.py',*args],cwd=ROOT/'backend',env=env)
    npm=shutil.which('npm.cmd') or shutil.which('npm')
    if not npm: raise RuntimeError('npm não encontrado.')
    if old_lock != (ROOT/'frontend/package-lock.json').read_bytes() or not (ROOT/'frontend/node_modules').exists():
        run([npm,'ci'],cwd=ROOT/'frontend',env=env)
    for args in [('test',),('run','build')]:run([npm,*args],cwd=ROOT/'frontend',env=env)
    pending.unlink(missing_ok=True)
    print('Actualização concluída. Reinicia os servidores. Backup:',backup)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('Actualização não validada:',exc)
        print('Mantém os servidores parados e consulta o erro. Os documentos não são alterados pelo Git.')
        sys.exit(1)
