"""IMS content package (ZIP) handling and hardened XML parsing for QTI.

Security posture (directive §9.4, CLAUDE.md §1):
- XML with a DOCTYPE or ENTITY declaration is rejected outright, which blocks
  XXE and billion-laughs without depending on a third-party parser.
- ZIP members are size-bounded and path-checked to prevent zip-slip.
"""

import io
import posixpath
import zipfile
from xml.etree import ElementTree as ET

_QTI_NS = "http://www.imsglobal.org/xsd/imsqti_v2p1"
_CP_NS = "http://www.imsglobal.org/xsd/imscp_v1p1"

MAX_PACKAGE_BYTES = 20 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_ITEMS = 1000


class QtiPackageError(Exception):
    """The uploaded package or XML is malformed or unsafe."""


def parse_xml_safely(data: bytes) -> ET.Element:
    """Parse XML bytes after rejecting DTDs/entity declarations."""
    head = data.lstrip()[:4096].lower()
    if b"<!doctype" in head or b"<!entity" in head:
        raise QtiPackageError("XML declares a DOCTYPE/ENTITY, which is not allowed.")
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise QtiPackageError(f"Malformed XML: {exc}")


def _is_item_xml(data: bytes) -> bool:
    """Cheap check that an XML blob looks like a QTI assessmentItem."""
    return b"assessmentItem" in data[:8192]


def read_package(filename: str, data: bytes) -> list[tuple[str, bytes]]:
    """Return ``(name, xml_bytes)`` for each assessmentItem in the upload.

    Accepts a bare ``.xml`` item or a ``.zip`` IMS package. ZIP members are
    bounded and path-checked; only item XML files are returned.
    """
    if len(data) > MAX_PACKAGE_BYTES:
        raise QtiPackageError("Package exceeds size limit.")
    if filename.lower().endswith(".xml"):
        return [(filename, data)]
    if not filename.lower().endswith(".zip"):
        raise QtiPackageError("Unsupported file type; expected .xml or .zip.")
    return _read_zip(data)


def _read_zip(data: bytes) -> list[tuple[str, bytes]]:
    """Safely extract candidate item XML files from a ZIP package."""
    items: list[tuple[str, bytes]] = []
    total = 0
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise QtiPackageError("File is not a valid ZIP archive.")
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = info.filename
        # Zip-slip guard: reject absolute paths or any traversal outside root.
        norm = posixpath.normpath(name)
        if norm.startswith("/") or norm.startswith("..") or ":" in name:
            raise QtiPackageError(f"Unsafe path in package: {name}")
        total += info.file_size
        if total > MAX_UNCOMPRESSED_BYTES:
            raise QtiPackageError("Package uncompressed size exceeds limit.")
        if not name.lower().endswith(".xml") or norm.endswith("imsmanifest.xml"):
            continue
        with archive.open(info) as fh:
            blob = fh.read()
        if _is_item_xml(blob):
            items.append((name, blob))
        if len(items) > MAX_ITEMS:
            raise QtiPackageError("Package exceeds item count limit.")
    if not items:
        raise QtiPackageError("No QTI assessmentItem files found in package.")
    return items


def build_manifest(item_hrefs: list[str]) -> str:
    """Build a minimal imsmanifest.xml referencing each exported item."""
    resources = "".join(
        f'    <resource identifier="res-{i}" type="imsqti_item_xmlv2p1" href="{href}">\n'
        f'      <file href="{href}"/>\n    </resource>\n'
        for i, href in enumerate(item_hrefs)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<manifest identifier="MANIFEST-1" xmlns="{_CP_NS}">\n'
        "  <organizations/>\n  <resources>\n"
        f"{resources}  </resources>\n</manifest>\n"
    )


def build_package(items: list[tuple[str, str]]) -> bytes:
    """Build an IMS content package ZIP from ``(href, item_xml)`` pairs."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("imsmanifest.xml", build_manifest([href for href, _ in items]))
        for href, xml in items:
            archive.writestr(href, xml)
    return buffer.getvalue()
