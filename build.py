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
    '06b_contact.html',        # <-- ADD YOUR NEW FILE HERE
    '07_footer_static.html',   # includes </main>
    '08_footer_sticky.html',
    '09_scripts.html',         # includes </body></html>
]
# blank-line spacing between blocks to match the original layout
html = '\n\n'.join(r(n) for n in order) + '\n'
open('index.html', 'w', encoding='utf-8').write(html)
print('Built index.html (%d bytes)' % len(html))