# -*- coding: utf-8 -*-
"""
Run with: python3 -m unittest tests.test_build_artifacts -v
(from the project root, after running `python3 build.py`)
"""
import json
import os
import re
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


class BuildFirst(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Always test against a freshly built index.html / homepage.md so
        # the tests can't pass against stale output.
        subprocess.run([sys.executable, "build.py"], cwd=ROOT, check=True)


class TestJsonLd(BuildFirst):
    def test_homepage_has_valid_person_json_ld(self):
        html = read("index.html")
        m = re.search(
            r'<script type="application/ld\+json">(.*?)</script>', html, re.S
        )
        self.assertIsNotNone(m, "No <script type=application/ld+json> found on homepage")
        data = json.loads(m.group(1))
        self.assertEqual(data["@type"], "Person")
        for field in ("name", "description", "url", "jobTitle"):
            self.assertIn(field, data)
            self.assertTrue(data[field])
        self.assertTrue(data["url"].startswith("https://"))
        self.assertIsInstance(data.get("sameAs"), list)
        self.assertGreaterEqual(len(data["sameAs"]), 1)


class TestHeadingStructure(BuildFirst):
    def test_exactly_one_h1(self):
        html = read("index.html")
        h1s = re.findall(r"<h1[ >]", html)
        self.assertEqual(len(h1s), 1, "Homepage must have exactly one <h1>")

    def test_no_heading_level_is_skipped(self):
        html = read("index.html")
        levels = [int(m) for m in re.findall(r"<h([1-6])[ >]", html)]
        self.assertTrue(levels, "No headings found")
        # Walking the sequence, a heading may only increase by one level
        # at a time (h1 -> h2 -> h3 is fine; h1 -> h3 is a skipped level).
        max_seen = 0
        for lvl in levels:
            if lvl > max_seen + 1:
                self.fail(
                    f"Heading level jumps from h{max_seen} to h{lvl} "
                    "without an intermediate level"
                )
            max_seen = max(max_seen, lvl)

    def test_raw_html_has_meaningful_text_without_js(self):
        html = read("index.html")
        text_only = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
        text_only = re.sub(r"<style.*?</style>", " ", text_only, flags=re.S)
        text_only = re.sub(r"<[^>]+>", " ", text_only)
        text_only = re.sub(r"\s+", " ", text_only).strip()
        self.assertGreaterEqual(len(text_only), 500)

    def test_content_to_markup_ratio_clears_the_five_percent_target(self):
        # Regression guard for the "content without JavaScript" agent-readiness
        # check: raw visible text divided by total page bytes must clear 5%.
        # This is what pushed CSS/JS out of parts/00_head.html and
        # parts/09_scripts.html into styles.css/script.js, and what removed the
        # ~65KB of byte-for-byte duplicated inline `style="..."` attributes
        # from parts/04_skills.html.
        html = read("index.html")
        text_only = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
        text_only = re.sub(r"<style.*?</style>", " ", text_only, flags=re.S)
        text_only = re.sub(r"<!--.*?-->", " ", text_only, flags=re.S)
        text_only = re.sub(r"<[^>]+>", " ", text_only)
        text_only = re.sub(r"\s+", " ", text_only).strip()
        ratio = len(text_only) / len(html)
        self.assertGreaterEqual(
            ratio, 0.05,
            f"content ratio {ratio:.2%} is below the 5% agent-readiness target",
        )

    def test_css_and_js_are_external_not_inlined(self):
        # The homepage should link to the external stylesheet/script rather
        # than carrying a giant inline <style>/<script> block, which is most
        # of what depresses the content ratio above.
        html = read("index.html")
        self.assertIn('<link rel="stylesheet" href="/styles.css">', html)
        self.assertIn('<script src="/script.js">', html)
        self.assertNotRegex(html, r"<style>[\s\S]{500,}</style>")
        # The one remaining inline <script> block is the small JSON-LD block,
        # not a bare JS <script> tag.
        bare_scripts = re.findall(r'<script(?![^>]*type="application/ld\+json")(?![^>]*src=)[^>]*>', html)
        self.assertEqual(bare_scripts, [], f"unexpected inline <script> block(s): {bare_scripts}")

    def test_styles_and_script_files_exist_and_are_nonempty(self):
        self.assertGreater(len(read("styles.css")), 1000)
        self.assertGreater(len(read("script.js")), 1000)


class TestTrustAnchorPages(unittest.TestCase):
    def _visible_text_len(self, html):
        body = html.split("<body>", 1)[1].split("</body>", 1)[0]
        text_only = re.sub(r"<[^>]+>", " ", body)
        text_only = re.sub(r"\s+", " ", text_only).strip()
        return len(text_only)

    def test_about_contact_privacy_each_have_500_plus_chars_of_content(self):
        for path in ("about/index.html", "contact/index.html", "privacy/index.html"):
            html = read(path)
            self.assertIn("<h1", html, f"{path} missing an <h1>")
            length = self._visible_text_len(html)
            self.assertGreaterEqual(
                length, 500, f"{path} has only {length} visible chars (need >= 500)"
            )

    def test_trust_pages_link_back_to_home_and_each_other(self):
        for path in ("about/index.html", "contact/index.html", "privacy/index.html"):
            html = read(path)
            self.assertIn('href="/"', html)

    def test_sitemap_lists_the_trust_anchor_pages(self):
        tree = ET.fromstring(read("sitemap.xml"))
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = {el.text for el in tree.findall("sm:url/sm:loc", ns)}
        for path in ("about", "contact", "privacy"):
            self.assertIn(f"https://www.lizibuilds.tech/{path}", locs)


class TestSitemap(unittest.TestCase):
    def test_sitemap_is_well_formed_and_lists_homepage(self):
        tree = ET.fromstring(read("sitemap.xml"))
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [el.text for el in tree.findall("sm:url/sm:loc", ns)]
        self.assertIn("https://www.lizibuilds.tech/", locs)


class TestNotFoundPage(unittest.TestCase):
    def test_404_page_has_helpful_recovery_links(self):
        html = read("404.html")
        self.assertIn("<h1", html)
        self.assertIn('href="/"', html)
        self.assertIn("sitemap.xml", html)
        self.assertIn("llms.txt", html)
        self.assertIn('href="/about"', html)
        self.assertIn('href="/contact"', html)
        # meta robots noindex so the 404 itself doesn't get indexed
        self.assertIn('name="robots"', html)


class TestLlmsTxt(unittest.TestCase):
    def setUp(self):
        self.content = read("llms.txt")
        self.lines = [l for l in self.content.splitlines() if l.strip()]

    def test_starts_with_h1(self):
        self.assertTrue(self.lines[0].startswith("# "))

    def test_has_blockquote_summary(self):
        self.assertTrue(any(l.startswith(">") for l in self.lines[:5]))

    def test_has_when_to_use_section_with_specifics(self):
        self.assertIn("## When to use this", self.content)
        section = self.content.split("## When to use this", 1)[1]
        section = section.split("\n##", 1)[0]
        # Should name concrete use cases, not just generic marketing copy.
        self.assertGreaterEqual(section.count("\n-"), 3)
        self.assertNotIn("cutting-edge", section.lower())
        self.assertNotIn("world-class", section.lower())

    def test_has_at_least_one_markdown_link(self):
        self.assertRegex(self.content, r"\[[^\]]+\]\((https?://|/)[^)]+\)")

    def test_lists_the_trust_anchor_pages(self):
        for path in ("/about", "/contact", "/privacy"):
            self.assertIn(f"https://www.lizibuilds.tech{path}", self.content)


class TestHomepageMarkdown(BuildFirst):
    def test_homepage_md_starts_with_h1_and_has_content(self):
        md = read("homepage.md")
        self.assertTrue(md.startswith("# "))
        self.assertGreaterEqual(len(md), 500)

    def test_homepage_md_has_no_leftover_html_tags(self):
        md = read("homepage.md")
        self.assertNotRegex(md, r"<(div|span|section|article|button|svg)\b")


if __name__ == "__main__":
    unittest.main()
