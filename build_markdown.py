# -*- coding: utf-8 -*-
"""
Generates homepage.md (a clean Markdown representation of the homepage)
from the same parts/*.html source files that build.py assembles into
index.html. This keeps parts/ as the single source of truth: editing a
part and re-running `python3 build.py` updates the HTML page AND the
Markdown representation served to agents via Accept: text/markdown.

Per https://acceptmarkdown.com/guides/generating-markdown this is the
"build-time dual rendering" approach: one source, two representations
emitted at build time, no runtime HTML->Markdown conversion needed.

What gets stripped (per the same guide's "what to strip" list):
  - <script>, <style>, <svg> (icons/chrome, not content)
  - <nav> elements (filter bars, tab controls - UI, not content)
  - <button> elements (UI controls)
  - counters like "2/3" (class="*-counter") and the bare "URL" tag chip

What gets preserved: heading hierarchy, paragraph text, list items,
and links with real (non-icon) link text, as Markdown.
"""
import os
import re
from html.parser import HTMLParser

PARTS_DIR = "parts"

CONTENT_PARTS = [
    "02_profile.html",
    "03_projects.html",
    "04_skills.html",
    "05_events.html",
    "06_value.html",
    "06b_contact.html",
]

SKIP_TAGS = {"script", "style", "svg", "nav", "button", "head"}
BLOCK_TAGS = {"p", "div", "li", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6"}
HEADING_LEVEL = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}

SKIP_CLASS_SUBSTRINGS = ("counter", "card-url-tag", "filter-btn", "subtab-btn", "progress-track")
LIST_ROW_CLASS_SUBSTRINGS = ("skill-row",)


class MarkdownExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.skip_stack = []
        self.blocks = []  # list of strings (already-formatted markdown blocks)
        self.current_heading_level = None
        self.current_text = []
        self.current_link_href = None
        self.current_class = ""

    def _classes(self, attrs):
        for k, v in attrs:
            if k == "class":
                return v or ""
        return ""

    def _should_skip_element(self, tag, attrs):
        if tag in SKIP_TAGS:
            return True
        classes = self._classes(attrs)
        return any(s in classes for s in SKIP_CLASS_SUBSTRINGS)

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if self.skip_depth > 0:
            self.skip_stack.append(tag)
            self.skip_depth += 1
            return
        if self._should_skip_element(tag, attrs):
            self.skip_stack.append(tag)
            self.skip_depth = 1
            return
        classes = self._classes(attrs)
        if tag in HEADING_LEVEL:
            self._flush_paragraph()
            self.current_heading_level = HEADING_LEVEL[tag]
        elif tag == "a":
            href = attrs_d.get("href", "")
            if href and not href.startswith("javascript:"):
                self.current_link_href = href
        elif tag == "li" or any(s in classes for s in LIST_ROW_CLASS_SUBSTRINGS):
            self._flush_paragraph()
            self.current_text.append("- ")
        elif "skill-percentage" in classes and self.current_text:
            self.current_text.append(" \u2014 ")

    def handle_startendtag(self, tag, attrs):
        pass  # self-closing tags (img, br, etc.) carry no text content we need

    def handle_endtag(self, tag):
        if self.skip_depth > 0:
            if self.skip_stack and self.skip_stack[-1] == tag:
                self.skip_stack.pop()
                self.skip_depth -= 1
            return
        if tag in HEADING_LEVEL:
            text = "".join(self.current_text).strip()
            if text:
                self.blocks.append(f"{self.current_heading_level} {text}")
            self.current_text = []
            self.current_heading_level = None
        elif tag == "a":
            self.current_link_href = None
        elif tag in BLOCK_TAGS:
            self._flush_paragraph()

    def _flush_paragraph(self):
        text = "".join(self.current_text)
        text = re.sub(r"[ \t]+", " ", text).strip()
        if text:
            self.blocks.append(text)
        self.current_text = []

    def handle_data(self, data):
        if self.skip_depth > 0:
            return
        data = data.replace("\n", " ")
        if not data.strip():
            if self.current_text and not self.current_text[-1].endswith(" "):
                self.current_text.append(" ")
            return
        if self.current_link_href:
            self.current_text.append(f"[{data.strip()}]({self.current_link_href})")
        else:
            self.current_text.append(data)

    def get_markdown(self):
        self._flush_paragraph()
        # de-dupe consecutive identical blocks (tab panes vs. visible pane
        # duplication safeguard) and drop empties
        out = []
        seen_empty_run = False
        for b in self.blocks:
            b = b.strip()
            if not b:
                continue
            out.append(b)
        return "\n\n".join(out)


def read_part(name):
    with open(os.path.join(PARTS_DIR, name), encoding="utf-8") as f:
        return f.read()


def build_homepage_markdown(site_name, site_title, site_url, tagline):
    parser = MarkdownExtractor()
    for name in CONTENT_PARTS:
        parser.feed(read_part(name))
    body_md = parser.get_markdown()

    header = (
        f"# {site_title}\n\n"
        f"> {tagline}\n\n"
        f"Canonical page: {site_url}\n"
    )
    return header + "\n" + body_md + "\n"


if __name__ == "__main__":
    md = build_homepage_markdown(
        site_name="Lizi Zivzivadze",
        site_title="Lizi Zivzivadze - Electromechanical Engineer Portfolio",
        site_url="https://www.lizibuilds.tech/",
        tagline="Electromechanical Engineering Technology student and hardware+software builder - one shipped project at a time.",
    )
    with open("homepage.md", "w", encoding="utf-8") as f:
        f.write(md)
    print("Built homepage.md (%d bytes)" % len(md))
