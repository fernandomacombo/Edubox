import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('importar_instalacao.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old = Path(self.temp.name)/'old'
        self.new = Path(self.temp.name)/'new'
        for root in [self.old,self.new]:
            (root/'backend/learning/migrations').mkdir(parents=True)
        with sqlite3.connect(self.old/'backend/db.sqlite3') as db:
            db.execute('create table example(value text)')
            db.execute("insert into example values ('retained')")
        for name in ['media','private_assignments']:
            (self.old/'backend'/name).mkdir()
            (self.old/'backend'/name/'sample.pdf').write_bytes(b'%PDF-1.7')
        (self.old/'backend/learning/migrations/0001_initial.py').write_text('# original')
        patcher=patch.object(module,'ROOT',self.new)
        patcher.start();self.addCleanup(patcher.stop)

    def test_import_preserves_source_and_copies_history(self):
        module.import_data(self.old)
        for root in [self.old,self.new]:
            with sqlite3.connect(root/'backend/db.sqlite3') as db:
                self.assertEqual(db.execute('select value from example').fetchone()[0],'retained')
            self.assertEqual((root/'backend/private_assignments/sample.pdf').read_bytes(),b'%PDF-1.7')
            self.assertEqual((root/'backend/learning/migrations/0001_initial.py').read_text(),'# original')
        self.assertTrue((self.new/'backend/.edubox_imported').exists())

    def test_refuses_existing_destination(self):
        (self.new/'backend/db.sqlite3').write_text('do not replace')
        with self.assertRaises(ValueError):module.import_data(self.old)
        self.assertEqual((self.new/'backend/db.sqlite3').read_text(),'do not replace')

    def test_refuses_low_disk_space_before_writing(self):
        with patch.object(module.shutil,'disk_usage',return_value=type('Disk',(),{'free':0})()):
            with self.assertRaises(ValueError):module.import_data(self.old)
        self.assertFalse((self.new/'backend/db.sqlite3').exists())

if __name__=='__main__':unittest.main()
