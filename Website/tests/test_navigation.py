import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "https://nethera.example"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.base = None
        self.links = []
        self.ids = set()
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "base":
            self.base = attrs.get("href")
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
        if "id" in attrs:
            self.ids.add(attrs["id"])


class NavigationTests(unittest.TestCase):
    def test_website_links_resolve_to_files_and_existing_sections(self):
        for filename in ("nethera.html", "step_by_step.html"):
            page = Page(ROOT / "Website/html" / filename)
            entrypoints = ["/website/html/" + filename]
            if filename == "nethera.html":
                entrypoints.append("/")
            for entrypoint in entrypoints:
                base = urljoin(ORIGIN + entrypoint, page.base or "")
                for href in page.links:
                    target = urlsplit(urljoin(base, href))
                    if target.netloc != "nethera.example":
                        continue
                    with self.subTest(page=filename, entry=entrypoint, href=href):
                        if target.path.startswith("/website/"):
                            path = ROOT / "Website" / target.path.removeprefix("/website/")
                        else:
                            path = ROOT / "Applikation" / target.path.lstrip("/")
                        self.assertTrue(path.is_file(), str(path))
                        if target.fragment:
                            self.assertIn(target.fragment, Page(path).ids)


if __name__ == "__main__":
    unittest.main()
