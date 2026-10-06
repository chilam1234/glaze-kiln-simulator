"""Build dist/glaze-kiln.html: one self-contained file (JS incl. three.js + addons, and CSS inlined) that runs from file://.
Usage: python3 tests/build_single.py   (needs esbuild: $ESBUILD, /workspace/.tools-esbuild, PATH, or falls back to `npx esbuild`)"""
import os, re, shutil, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
def find_esbuild():
    for c in (os.environ.get('ESBUILD'), '/workspace/.tools-esbuild/node_modules/.bin/esbuild', shutil.which('esbuild')):
        if c and os.path.exists(c): return [c]
    return ['npx', '--yes', 'esbuild@0.23']
cmd = find_esbuild() + [os.path.join(ROOT, 'js/main.js'), '--bundle', '--format=iife', '--minify', '--target=es2020', '--legal-comments=none',
    '--alias:three=' + os.path.join(ROOT, 'vendor/three.module.js'),
    '--alias:three/addons=' + os.path.join(ROOT, 'vendor/addons')]
js = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
js = js.replace('</script', '<\\/script')   # never close the inline tag early
css = open(os.path.join(ROOT, 'css/style.css'), encoding='utf-8').read()
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
html = re.sub(r'<script type="importmap">.*?</script>\s*', '', html, flags=re.S)
html = re.sub(r'<link rel="stylesheet" href="css/style.css(?:\?v=[^"]*)?">', lambda _m: '<style>\n' + css + '\n</style>', html)
html = re.sub(r'<script type="module" src="js/main.js(?:\?v=[^"]*)?"></script>', lambda _m: '<script>\n' + js + '\n</script>', html)
assert 'src="js/' not in html and 'href="css/' not in html and 'importmap' not in html
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist/glaze-kiln.html')
open(out, 'w', encoding='utf-8').write(html)
print(out, '%.2f MB' % (os.path.getsize(out) / 1e6))
