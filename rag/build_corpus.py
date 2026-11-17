"""Download the official Red Hat pages listed in sources.json and save them as plain text.

Usage:  python -m rag.build_corpus

Each page becomes rag/corpus/<doc_id>.md with a small header (title, url, fetched date)
followed by the page's readable text. Headings are kept as markdown "#" lines so the
chunker can split on them. Navigation, scripts, styles, headers and footers are dropped.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CORPUS_DIR = ROOT / "corpus"
SOURCES = ROOT / "sources.json"

SKIP_TAGS = {"script", "style", "noscript", "nav", "header", "footer", "svg", "form", "button", "iframe", "template"}
BLOCK_TAGS = {"p", "li", "dt", "dd", "pre", "blockquote", "figcaption", "caption", "tr", "div", "section", "article"}
HEADING_TAGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4}
# Lines that are page chrome rather than content.
BOILERPLATE = re.compile(
    r"^(skip to (main )?content|log in|login|sign in|register|contact us|cookie|all red hat|"
    r"subscriptions|downloads|red hat console|get support|share|copy link|was this helpful|"
    r"search|menu|close|back to top|english|español|deutsch|italiano|日本語|한국어|中文|français|português)\b",
    re.I,
)

FOOTER_START = re.compile(r"^(LinkedIn YouTube Facebook|#+ (Quick Links|About Red Hat|Red Hat legal and privacy links)$)")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.lines: list[str] = []
        self.buf: list[str] = []
        self.heading_level = 0

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if not text:
            return
        if self.heading_level:
            self.lines.append("#" * self.heading_level + " " + text)
        else:
            self.lines.append(text)

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag in HEADING_TAGS:
            self._flush()
            self.heading_level = HEADING_TAGS[tag]
        elif tag in BLOCK_TAGS or tag == "br":
            self._flush()
        elif tag in ("td", "th"):
            self.buf.append(" | ")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if tag in HEADING_TAGS:
            self._flush()
            self.heading_level = 0
        elif tag in BLOCK_TAGS:
            self._flush()

    def handle_data(self, data):
        if not self.skip_depth:
            self.buf.append(data)

    def text(self) -> str:
        self._flush()
        out: list[str] = []
        seen: set[str] = set()
        for line in self.lines:
            if FOOTER_START.match(line):  # site footer: everything after is links, not content
                break
            if len(line) < 3 or BOILERPLATE.match(line.lstrip("# ")):
                continue
            # Drop exact repeats (menus and cards often repeat the same line).
            if line in seen and not line.startswith("#"):
                continue
            seen.add(line)
            out.append(line)
        return "\n".join(out)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (rag-corpus-builder)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> None:
    CORPUS_DIR.mkdir(exist_ok=True)
    sources = json.loads(SOURCES.read_text())
    today = dt.date.today().isoformat()
    for src in sources:
        parser = TextExtractor()
        parser.feed(fetch(src["url"]))
        body = parser.text()
        header = f"---\ndoc_id: {src['doc_id']}\ntitle: {src['title']}\nurl: {src['url']}\nfetched: {today}\n---\n"
        (CORPUS_DIR / f"{src['doc_id']}.md").write_text(header + body + "\n")
        print(f"{src['doc_id']:<26} {len(body):>7} chars")


if __name__ == "__main__":
    main()
