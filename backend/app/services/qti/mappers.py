"""Convert between OpenVision item content and QTI 2.1 assessmentItem XML.

OpenVision items store a TipTap ``content`` document plus a discriminated
``options`` payload (``choices`` for choice questions, word bounds for essays).
Only the three in-scope interaction types are mapped (directive §9.2); anything
else raises :class:`UnsupportedInteraction` so the import reports it instead of
silently dropping the item.
"""

import re
from html import escape
from xml.etree import ElementTree as ET

from app.services.items_service import extract_text_from_tiptap_json
from app.services.qti.sanitizer import strip_to_text

_QTI_NS = "http://www.imsglobal.org/xsd/imsqti_v2p1"
_NCNAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]*$")
_CHOICE_TYPES = {"MULTIPLE_CHOICE", "MULTIPLE_RESPONSE"}


class QtiMappingError(Exception):
    """A supported interaction was found but could not be mapped."""


class UnsupportedInteraction(QtiMappingError):
    """The item uses an interaction type outside the supported set."""


def _local(tag: str) -> str:
    """Strip an XML namespace, returning the bare local tag name."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _tiptap(prompt: str) -> dict:
    """Wrap plain prompt text in a minimal TipTap document."""
    para: dict = {"type": "paragraph"}
    if prompt:
        para["content"] = [{"type": "text", "text": prompt}]
    return {"type": "doc", "content": [para]}


def _choice_identifier(choice: dict, index: int) -> str:
    """Reuse the choice id when it is a valid NCName, else synthesize one."""
    cid = str(choice.get("id", "")).strip()
    return cid if _NCNAME.match(cid) else f"CHOICE_{index}"


# --- export --------------------------------------------------------------

def item_to_xml(
    *, identifier: str, title: str, question_type: str, content: dict,
    options: dict, include_correct: bool,
) -> str:
    """Render a single OpenVision item as a QTI 2.1 assessmentItem document."""
    prompt = escape(extract_text_from_tiptap_json(content or {}))
    if question_type in _CHOICE_TYPES:
        body = _choice_body(question_type, prompt, options or {}, include_correct)
    elif question_type == "ESSAY":
        body = _essay_body(prompt)
    else:
        raise UnsupportedInteraction(f"Cannot export question type: {question_type}")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<assessmentItem xmlns="{_QTI_NS}" identifier="{escape(identifier, quote=True)}" '
        f'title="{escape(title, quote=True)}" adaptive="false" timeDependent="false">\n'
        f"{body}\n</assessmentItem>\n"
    )


def _choice_body(question_type: str, prompt: str, options: dict, include_correct: bool) -> str:
    """Build responseDeclaration + choiceInteraction for choice questions."""
    choices = options.get("choices", []) or []
    multiple = question_type == "MULTIPLE_RESPONSE"
    cardinality = "multiple" if multiple else "single"
    max_choices = len(choices) if multiple else 1
    correct_ids = [
        _choice_identifier(c, i) for i, c in enumerate(choices) if c.get("is_correct")
    ]
    correct_block = ""
    if include_correct:
        values = "".join(f"<value>{escape(c)}</value>" for c in correct_ids)
        correct_block = f"<correctResponse>{values}</correctResponse>"
    rendered = "".join(
        f'<simpleChoice identifier="{escape(_choice_identifier(c, i), quote=True)}">'
        f"{escape(str(c.get('text', '')))}</simpleChoice>"
        for i, c in enumerate(choices)
    )
    return (
        f'  <responseDeclaration identifier="RESPONSE" cardinality="{cardinality}" '
        f'baseType="identifier">{correct_block}</responseDeclaration>\n'
        f'  <itemBody>\n    <div class="prompt">{prompt}</div>\n'
        f'    <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" '
        f'maxChoices="{max_choices}">{rendered}</choiceInteraction>\n  </itemBody>'
    )


def _essay_body(prompt: str) -> str:
    """Build responseDeclaration + extendedTextInteraction for essays."""
    return (
        '  <responseDeclaration identifier="RESPONSE" cardinality="single" baseType="string"/>\n'
        f'  <itemBody>\n    <div class="prompt">{prompt}</div>\n'
        '    <extendedTextInteraction responseIdentifier="RESPONSE"/>\n  </itemBody>'
    )


# --- import --------------------------------------------------------------

def xml_to_item(root: ET.Element) -> dict:
    """Map a parsed assessmentItem element to OpenVision item parts.

    Returns ``{title, question_type, content, options}`` ready for validation;
    raises :class:`UnsupportedInteraction`/:class:`QtiMappingError` on problems.
    """
    if _local(root.tag) != "assessmentItem":
        raise QtiMappingError("Root element is not an assessmentItem")
    title = root.get("title") or root.get("identifier") or "Imported item"
    body = _find(root, "itemBody")
    if body is None:
        raise QtiMappingError("assessmentItem has no itemBody")

    prompt = strip_to_text(_prompt_markup(body))
    choice = _find(body, "choiceInteraction")
    essay = _find(body, "extendedTextInteraction")
    if choice is not None:
        return _import_choice(root, choice, title, prompt)
    if essay is not None:
        return {
            "title": title,
            "question_type": "ESSAY",
            "content": _tiptap(prompt),
            "options": {"question_type": "ESSAY", "min_words": 0, "max_words": 1000},
        }
    found = next((_local(c.tag) for c in body if _local(c.tag).endswith("Interaction")), "none")
    raise UnsupportedInteraction(f"Unsupported interaction type: {found}")


def _import_choice(root: ET.Element, choice: ET.Element, title: str, prompt: str) -> dict:
    """Map a choiceInteraction to MULTIPLE_CHOICE or MULTIPLE_RESPONSE."""
    try:
        max_choices = int(choice.get("maxChoices", "1"))
    except ValueError:
        max_choices = 1
    correct = _correct_identifiers(root)
    choices = []
    for sc in choice:
        if _local(sc.tag) != "simpleChoice":
            continue
        ident = sc.get("identifier", "")
        choices.append({
            "id": ident,
            "text": strip_to_text("".join(sc.itertext())),
            "is_correct": ident in correct,
            "weight": 1.0,
        })
    if not choices:
        raise QtiMappingError("choiceInteraction has no simpleChoice options")
    qtype = "MULTIPLE_RESPONSE" if max_choices != 1 else "MULTIPLE_CHOICE"
    return {
        "title": title,
        "question_type": qtype,
        "content": _tiptap(prompt),
        "options": {"question_type": qtype, "choices": choices},
    }


def _correct_identifiers(root: ET.Element) -> set[str]:
    """Collect the correctResponse identifier values from responseDeclaration."""
    decl = _find(root, "responseDeclaration")
    correct = _find(decl, "correctResponse") if decl is not None else None
    if correct is None:
        return set()
    return {v.text.strip() for v in correct if _local(v.tag) == "value" and v.text}


def _prompt_markup(body: ET.Element) -> str:
    """Extract prompt markup from itemBody, excluding interaction elements."""
    parts = []
    for child in body:
        if _local(child.tag).endswith("Interaction"):
            continue
        parts.append("".join(child.itertext()))
    return " ".join(p.strip() for p in parts if p.strip())


def _find(parent: ET.Element, local_name: str):
    """Find the first descendant whose local tag name matches (excludes parent)."""
    for el in parent.iter():
        if _local(el.tag) == local_name and el is not parent:
            return el
    return None
