"""
Project / lab shape builder.

pages/ has top-level dirs matching project-*, lab-*, studio-*, design-*.
Each such dir becomes a unit; its sub-pages become sessions.
If a dir has no sub-pages, the dir itself becomes a single-session unit.
"""

from __future__ import annotations
import re
from pathlib import Path

from .._utils import html_to_text, read_json
from ..manifest import SessionNode, UnitNode
from .base import SpineBuilder

_PROJECT_PAT    = re.compile(r"^(project|lab|studio|design)-", re.IGNORECASE)
_SKIP_SLUGS     = frozenset({
    "syllabus", "resource-index", "instructor-insights", "related-resources",
})
_ASSESSMENT_PAT = re.compile(
    r"deliverable|due[-\s]date|milestone|submission|report|exam|quiz",
    re.IGNORECASE,
)


class ProjectLabBuilder(SpineBuilder):

    def build(self) -> list[UnitNode]:
        pages_dir = self.zip_root / "pages"
        if not pages_dir.is_dir():
            return []

        unit_dirs = sorted(
            d for d in pages_dir.iterdir()
            if d.is_dir()
            and _PROJECT_PAT.match(d.name)
            and d.name not in _SKIP_SLUGS
        )

        units: list[UnitNode] = []
        for unit_idx, unit_dir in enumerate(unit_dirs):
            up = unit_dir / "data.json"
            if not up.exists():
                continue
            try:
                unit_data = read_json(up)
            except ValueError:
                continue

            sub_dirs = sorted(
                d for d in unit_dir.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            )

            sessions: list[SessionNode] = []
            for si, sub in enumerate(sub_dirs):
                sp = sub / "data.json"
                if not sp.exists():
                    continue
                try:
                    data = read_json(sp)
                except ValueError:
                    continue
                content = data.get("content", "")
                is_assessment = bool(
                    _ASSESSMENT_PAT.search(sub.name)
                    or _ASSESSMENT_PAT.search(content[:500])
                )
                sessions.append(SessionNode(
                    slug=sub.name,
                    title=data.get("title", sub.name),
                    overview=html_to_text(content),
                    is_assessment=is_assessment,
                    order=si,
                ))

            if not sessions:
                # The unit dir itself is a single-session unit
                content = unit_data.get("content", "")
                sessions = [SessionNode(
                    slug=unit_dir.name,
                    title=unit_data.get("title", unit_dir.name),
                    overview=html_to_text(content),
                    is_assessment=False,
                    order=0,
                )]

            units.append(UnitNode(
                slug=unit_dir.name,
                title=unit_data.get("title", unit_dir.name),
                overview=html_to_text(unit_data.get("content", "")),
                order=unit_idx,
                sessions=sessions,
                is_synthetic=False,
            ))

        return units
