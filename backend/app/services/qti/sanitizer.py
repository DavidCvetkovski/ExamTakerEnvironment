"""Conservative allowlist HTML sanitizer for imported QTI content.

No third-party sanitizer is available in this environment, so we parse with the
stdlib ``html.parser`` and re-emit only an explicit allowlist of tags and
attributes. Everything else (scripts, event handlers, ``javascript:`` URLs,
iframes, styles) is dropped. The frontend still runs DOMPurify before rendering
(directive §9.5, CLAUDE.md §1 defence in depth).
"""

from html import escape
from html.parser import HTMLParser

# Inline + block tags that are safe to round-trip. KaTeX delimiters live in text
# content (``$...$``) and survive untouched.
_ALLOWED_TAGS = {
    "p", "br", "strong", "em", "b", "i", "u", "span", "sub", "sup",
    "code", "pre", "blockquote", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "td", "th",
}
# Only class survives — it carries KaTeX/markup hints and cannot execute.
_ALLOWED_ATTRS = {"class"}
_VOID_TAGS = {"br"}


class _Sanitizer(HTMLParser):
    """Re-emit an allowlisted subset of the input HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def _safe_attrs(self, attrs) -> str:
        kept = []
        for name, value in attrs:
            if name.lower() in _ALLOWED_ATTRS and value is not None:
                kept.append(f' {name.lower()}="{escape(value, quote=True)}"')
        return "".join(kept)

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in _ALLOWED_TAGS and tag not in _VOID_TAGS:
            self.parts.append(f"<{tag}{self._safe_attrs(attrs)}>")
        elif tag in _VOID_TAGS:
            self.parts.append(f"<{tag}>")

    def handle_startendtag(self, tag, attrs):
        if tag.lower() in _ALLOWED_TAGS:
            self.parts.append(f"<{tag.lower()}>" if tag.lower() in _VOID_TAGS else "")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in _ALLOWED_TAGS and tag not in _VOID_TAGS:
            self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        self.parts.append(escape(data))


def sanitize_html(raw: str) -> str:
    """Return an allowlisted-safe version of ``raw`` HTML."""
    if not raw:
        return ""
    parser = _Sanitizer()
    parser.feed(raw)
    parser.close()
    return "".join(parser.parts).strip()


def strip_to_text(raw: str) -> str:
    """Flatten HTML to plain text (used for prompts that must be plain)."""
    if not raw:
        return ""

    class _Text(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.buf: list[str] = []

        def handle_data(self, data):
            self.buf.append(data)

    p = _Text()
    p.feed(raw)
    p.close()
    return "".join(p.buf).strip()
