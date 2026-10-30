import importlib.util
import json
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
   (root/'._app.js').write_bytes(b'legacy filesystem metadata')
   first=assets.prepare(root);html=(root/'index.html').read_text()
   self.assertFalse((root/'assets'/first/'._app.js').exists())
   self.assertRegex(first,r'^[0-9a-f]{16}$')
   self.assertIn('data-assets-version="'+first+'"',html)
   for name in ['styles.css','typography.css','fonts/oxanium-latin-700.woff2','read-cache.js','app.js','ai-ui.js','mobile-ui.js','tiga-icon.svg']:
    if not name.endswith('.js'):self.assertIn('assets/'+first+'/'+name,html)
    self.assertEqual((root/'assets'/first/name).read_bytes(),(root/name).read_bytes())
   self.assertEqual((root/'assets'/first/'fonts/Oxanium-OFL.txt').read_bytes(),(root/'fonts/Oxanium-OFL.txt').read_bytes())
   self.assertEqual(html.count('<script src='),2)
   self.assertIn('assets/'+first+'/startup.js',html)
   self.assertLess(html.index('startup.js'),html.index('bundle.js'))
   self.assertIn('assets/'+first+'/bundle.js',html)
   order=json.loads((root/'assets'/first/'entrypoints.json').read_text())
   self.assertEqual(order[-1],'app.js')
   bundle=(root/'assets'/first/'bundle.js').read_text()
   self.assertEqual(bundle,'\n;\n'.join('// '+name+'\n'+(root/name).read_text() for name in order))
   self.assertEqual(assets.prepare(root),first)
   self.assertEqual((root/'index.html').read_text(),html)
   with (root/'app.js').open('a') as f:f.write('\n// revision test\n')
   self.assertNotEqual(assets.prepare(root),first)
   self.assertNotEqual((root/'index.html').read_text(),html)
   self.assertNotEqual((root/'assets'/first/'app.js').read_bytes(),(root/'app.js').read_bytes())

 def test_bilibili_mobile_player_is_allowed_without_opening_arbitrary_frames(self):
  policies=re.findall(r'add_header Content-Security-Policy "([^"]+)" always;', (ROOT/'nginx.conf').read_text())
  self.assertEqual(len(policies),2,'main HTML and fingerprinted assets keep the same policy')
  self.assertEqual(policies[0],policies[1])
  for policy in policies:
   directives={part.strip().split()[0]:part.strip().split()[1:] for part in policy.split(';') if part.strip()}
   self.assertEqual(directives['frame-src'],['https://player.bilibili.com','https://www.bilibili.com/blackboard/webplayer/mbplayer.html'])
   self.assertEqual(directives['default-src'],["'self'"])
   self.assertEqual(directives['frame-ancestors'],["'self'"])
