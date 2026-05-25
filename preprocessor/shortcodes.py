"""
Hugo shortcode resolver.

OCW content text contains shortcodes like:
  {{% resource_link "uuid" "Display Text" %}}
  {{% resource "uuid" %}}

These must be resolved before the manifest is written — raw shortcodes
must never appear in any text field of the final CourseManifest.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

SHORTCODE_PATTERN = re.compile(
    r'{{%\s*(?P<name>\w+)\s+(?P<args>.*?)\s*%}}',
    re.DOTALL,
)
ARG_PATTERN = re.compile(r'"((?:[^"\\]|\\.)*)"')


def load_content_map(zip_root: Path) -> dict[str, str]:
    """Parse content_map.json → {uuid: relative_path}. Returns {} if missing."""
    p = zip_root / "content_map.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


class ShortcodeResolver:
    def __init__(self, content_map: dict[str, str], zip_root: Path):
        self._map   = content_map
        self._root  = zip_root
        self._cache: dict[str, str] = {}

    def resolve(self, text: str) -> str:
        """Replace all Hugo shortcodes with their display text."""
        if not text or "{{%" not in text:
            return text
        return SHORTCODE_PATTERN.sub(self._replace, text)

    def _replace(self, match: re.Match) -> str:
        name = match.group("name")
        args = ARG_PATTERN.findall(match.group("args"))

        if name == "resource_link" and len(args) >= 2:
            # {{% resource_link "uuid" "Display text" %}} → Display text
            return args[1]
        if name == "resource" and len(args) >= 1:
            # {{% resource "uuid" %}} → look up title
            return self._lookup_title(args[0])
        # Unknown shortcode: strip it
        return ""

    def _lookup_title(self, uuid: str) -> str:
        if uuid in self._cache:
            return self._cache[uuid]
        path = self._map.get(uuid, "").lstrip("/")
        if not path:
            return ""
        full = self._root / path
        if full.exists():
            try:
                title = json.loads(full.read_text(encoding="utf-8")).get("title", "")
                self._cache[uuid] = title
                return title
            except Exception:
                pass
        return ""
