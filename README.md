# Portfolio — split into editable sections

Your site is now split into small files inside `parts/`. You edit ONE small
file, run one command, and the full `index.html` is rebuilt. This is what lets
you (or an AI) touch a single section cheaply instead of re-processing the whole
page every time.

## The files you'll actually edit

| File | What it is | Edit this when you want to change… |
|------|------------|-------------------------------------|
| `parts/01_header.html` | Sticky top bar (avatar, name, download menu) | Name in header, CV/Portfolio links |
| `parts/02_profile.html` | Profile card (photo, title, action buttons, statement) | Your bio, job title, contact icons |
| `parts/03_projects.html` | Projects carousel cards | Add / edit / remove a project |
| `parts/04_skills.html` | Skillset tabs + skill bars | Skill names, percentages, categories |
| `parts/05_events.html` | Events carousel cards | Add / edit / remove an event |
| `parts/06_value.html` | "What I bring to the table" cards | The value cards |
| `parts/07_footer_static.html` | Bottom static footer | Footer text |
| `parts/08_footer_sticky.html` | Sticky status bar footer | The "available" status line |

## The files you'll rarely touch (shared "brain")

- `parts/00_head.html` — ALL the CSS lives here (the `<style>` block) plus fonts/meta.
- `parts/09_scripts.html` — ALL the JavaScript (carousels, tabs, lazy-load,
  lightbox, menus) plus the closing `</body></html>`.
- `parts/_body_open.html`, `parts/_main_open.html` — tiny wrappers, don't edit.

## How to edit a section with an AI (the cheap workflow)

1. Open just the one part file, e.g. `parts/03_projects.html`.
2. Paste ONLY that file to the AI: "Here is my projects section, add a new
   project card for X, keep the same structure and classes."
3. Paste the AI's result back over that one file.
4. Run the build (below). Done — the AI never had to see the whole 1,400-line page.

### ⚠️ One important rule
Sections rely on CSS classes (in `00_head.html`) and JavaScript (in
`09_scripts.html`). So when you ask the AI to edit a section, tell it:
**"keep the existing class names and data-* attributes exactly."**
That's what keeps the carousels, tabs, and lightbox working after you paste back.
If you add a genuinely new kind of element that needs new styling or behavior,
that's the case where you'd also touch `00_head.html` or `09_scripts.html`.

## Rebuild the site

```
python3 build.py
```

This regenerates `index.html` from the parts. Open `index.html` in a browser to
check it. The build just concatenates the parts in order — it never changes your
content.

## Going back / safety
`build.py` only ever overwrites `index.html`. Your source of truth is the
`parts/` folder, so keep that. If a build ever looks wrong, you only need to fix
the one part file you last edited.
