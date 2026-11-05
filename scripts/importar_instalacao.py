"""Importa os dados locais de uma instalação EduBox anterior para este clone."""
from pathlib import Path
import shutil
import sqlite3
import sys
ROOT = Path(__file__).resolve().parents[1]

def import_data(source):
    source = Path(source).resolve()
    if source == ROOT:
        raise ValueError('Escolhe a pasta antiga, diferente deste clone Git.')
    old = source / 'backend'
    new = ROOT / 'backend'
    if not (old / 'db.sqlite3').is_file():
        raise ValueError('Não encontrei backend/db.sqlite3 na pasta antiga.')
    names = ['db.sqlite3', 'media', 'private_assignments']
    if any((new / n).exists() for n in names):
        raise ValueError('Este clone já contém dados. A importação não substitui dados existentes.')
    migrations = list((old / 'learning/migrations').glob('*.py'))
    files = [old/'db.sqlite3'] + migrations
    for name in ['media','private_assignments']:
        if (old/name).exists(): files.extend(p for p in (old/name).rglob('*') if p.is_file())
    required = sum(p.stat().st_size for p in files) + 500*1024*1024
    if shutil.disk_usage(ROOT).free < required:
        raise ValueError('Espaço insuficiente no disco de destino para importar os dados com margem de segurança.')
    try:
        # Backup SQLite consistente; a instalação original nunca é modificada.
        with sqlite3.connect(f'{(old/"db.sqlite3").as_uri()}?mode=ro', uri=True) as src:
            with sqlite3.connect(new/'db.sqlite3') as dst: src.backup(dst)
        for name in ['media','private_assignments']:
            if (old/name).exists(): shutil.copytree(old/name,new/name)
        for p in migrations:
            if p.name != '__init__.py': shutil.copy2(p,new/'learning/migrations'/p.name)
    except Exception:
        print('Importação interrompida. A pasta original continua intacta. Não voltes a importar por cima deste destino incompleto.')
        raise
    (new/'.edubox_imported').touch()
    print('Dados importados. A instalação antiga ficou intacta.')

if __name__ == '__main__':
    try:
        path = sys.argv[1] if len(sys.argv)>1 else input('Pasta antiga [D:\\Downloads\\EduBox_MVP]: ').strip().strip('"') or r'D:\Downloads\EduBox_MVP'
        import_data(path)
    except Exception as exc:
        print('ERRO:',exc);sys.exit(1)
