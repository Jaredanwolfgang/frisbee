import importlib.util
import re
import shutil
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assets',ROOT/'scripts/prepare-assets.py')
assets=importlib.util.module_from_spec(spec);spec.loader.exec_module(assets)

class AssetTest(unittest.TestCase):
 def test_release_urls_are_versioned_idempotent_and_change_with_content(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'dist';shutil.copytree(ROOT/'dist',root)
   first=assets.prepare(root);html=(root/'index.html').read_text()
   self.assertRegex(first,r'^[0-9a-f]{16}$')
   self.assertIn('data-assets-version="'+first+'"',html)
   for name in ['styles.css','read-cache.js','app.js','ai-ui.js','mobile-ui.js','tiga-icon.svg']:
    self.assertIn('assets/'+first+'/'+name,html)
    self.assertEqual((root/'assets'/first/name).read_bytes(),(root/name).read_bytes())
   self.assertEqual(assets.prepare(root),first)
   self.assertEqual((root/'index.html').read_text(),html)
   with (root/'app.js').open('a') as f:f.write('\n// revision test\n')
   self.assertNotEqual(assets.prepare(root),first)
   self.assertNotEqual((root/'index.html').read_text(),html)
   self.assertNotEqual((root/'assets'/first/'app.js').read_bytes(),(root/'app.js').read_bytes())
