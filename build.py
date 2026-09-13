# -*- coding: utf-8 -*-
# Reassembles index.html from the files in parts/.
# Run:  python3 build.py
import os
P = 'parts'
def r(name):
    return open(os.path.join(P, name), encoding='utf-8').read().rstrip('\n')

order = [
    '00_head.html',
    '_body_open.html',
    '01_header.html',
    '_main_open.html',
    '02_profile.html',
    '03_projects.html',
    '04_skills.html',
    '05_events.html',
    '06_value.html',
    '06b_contact.html',
    '07_footer_static.html',   # includes </main>
    '08_footer_sticky.html',
    '09_scripts.html',         # includes </body></html>
]
# blank-line spacing between blocks to match the original layout
html = '\n\n'.join(r(n) for n in order) + '\n'
open('index.html', 'w', encoding='utf-8').write(html)
print('Built index.html (%d bytes)' % len(html))

# Also (re)generate homepage.md from the same parts/ source, for the
# Accept: text/markdown content-negotiation path (served by middleware.js).
# Keeps parts/ as the single source of truth for both representations.
import build_markdown
md = build_markdown.build_homepage_markdown(
    site_name='Lizi Zivzivadze',
    site_title='Lizi Zivzivadze - Electromechanical Engineer Portfolio',
    site_url='https://www.lizibuilds.tech/',
    tagline='Electromechanical Engineering Technology student and hardware+software builder - one shipped project at a time.',
)
open('homepage.md', 'w', encoding='utf-8').write(md)
print('Built homepage.md (%d bytes)' % len(md))