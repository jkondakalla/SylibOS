"""
Modern OCW adapter (ocw-studio / Hugo format, post-2015).

Reads root data.json, content_map.json, and resources/*/data.json.
Falls back to slug-based metadata if root data.json is absent.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

from ..manifest import Instructor, ResourceNode
from .base import CourseAdapter


# ── Department number → name lookup ──────────────────────────────────────────

_DEPT_MAP: dict[str, str] = {
    "1":   "Civil & Environmental Engineering",
    "2":   "Mechanical Engineering",
    "3":   "Materials Science & Engineering",
    "4":   "Architecture",
    "5":   "Chemistry",
    "6":   "Electrical Engineering & Computer Science",
    "7":   "Biology",
    "8":   "Physics",
    "9":   "Brain & Cognitive Sciences",
    "10":  "Chemical Engineering",
    "11":  "Urban Studies & Planning",
    "12":  "Earth, Atmospheric & Planetary Sciences",
    "14":  "Economics",
    "15":  "Management",
    "16":  "Aeronautics & Astronautics",
    "17":  "Political Science",
    "18":  "Mathematics",
    "20":  "Biological Engineering",
    "21":  "Humanities",
    "21A": "Anthropology",
    "21G": "Global Languages",
    "21H": "History",
    "21L": "Literature",
    "21M": "Music & Theater Arts",
    "22":  "Nuclear Science & Engineering",
    "24":  "Linguistics & Philosophy",
    "STS": "Science, Technology & Society",
    "EC":  "Edgerton Center",
    "ES":  "Experimental Study Group",
    "HST": "Health Sciences & Technology",
    "MAS": "Media Arts & Sciences",
    "SP":  "Special Programs",
}

# File types with no instructional text value
_SKIP_FILE_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif",
    "image/webp", "image/svg+xml", "text/plain",
})

# Matches an 11-char YouTube ID at end of a string
_YT_ID_PAT = re.compile(r"[A-Za-z0-9_-]{11}$")


class ModernAdapter(CourseAdapter):

    # ── Metadata ──────────────────────────────────────────────────────────────

    def parse_metadata(self) -> dict:
        data_path = self.zip_root / "data.json"
        if not data_path.exists():
            return self._metadata_from_slug()

        try:
            data = json.loads(data_path.read_text(encoding="utf-8"))
        except Exception:
            return self._metadata_from_slug()

        dept_numbers: list[str] = data.get("department_numbers", [])
        instructors = [
            Instructor(
                first_name=i.get("first_name", ""),
                last_name=i.get("last_name", ""),
                middle_initial=i.get("middle_initial", ""),
                salutation=i.get("salutation", ""),
                title=i.get("title", ""),
            )
            for i in (data.get("instructors") or [])
        ]

        return {
            "course_id":              self._normalize_course_id(
                                          data.get("primary_course_number", "")
                                          or self._slug_course_id()
                                      ),
            "extra_course_ids":       self._parse_extra_numbers(
                                          data.get("extra_course_numbers", "")
                                      ),
            "site_uid":               data.get("site_uid", ""),
            "legacy_uid":             data.get("legacy_uid"),
            "title":                  data.get("course_title", ""),
            "description":            data.get("course_description", ""),
            "department_numbers":     dept_numbers,
            "departments":            [_DEPT_MAP.get(n, n) for n in dept_numbers],
            "topics":                 data.get("topics", []),
            "level":                  data.get("level", []),
            "term":                   data.get("term", ""),
            "year":                   str(data.get("year", "")),
            "instructors":            instructors,
            "learning_resource_types": data.get("learning_resource_types", []),
        }

    # ── Resources ─────────────────────────────────────────────────────────────

    def parse_resources(self) -> list[ResourceNode]:
        resources_dir = self.zip_root / "resources"
        if not resources_dir.is_dir():
            return []

        results: list[ResourceNode] = []
        for data_path in resources_dir.rglob("data.json"):
            slug = data_path.parent.name
            try:
                raw = json.loads(data_path.read_text(encoding="utf-8"))
            except Exception:
                continue

            types = raw.get("learning_resource_types") or []
            if not types:
                continue

            file_type = raw.get("file_type", "")
            if file_type in _SKIP_FILE_TYPES:
                continue

            youtube_id = self._extract_youtube_id(raw, slug)

            results.append(ResourceNode(
                slug=slug,
                uid=raw.get("uid") or raw.get("site_uid"),
                title=raw.get("title", ""),
                description=raw.get("description", ""),
                primary_type=types[0],
                secondary_types=types[1:],
                file_path=raw.get("file", ""),
                file_type=file_type,
                youtube_id=youtube_id,
            ))

        return results

    # ── Content map ───────────────────────────────────────────────────────────

    def load_content_map(self) -> dict[str, str]:
        p = self.zip_root / "content_map.json"
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize_course_id(raw: str) -> str:
        return raw.strip().upper().replace(" ", "")

    @staticmethod
    def _parse_extra_numbers(raw: str) -> list[str]:
        if not raw:
            return []
        return [n.strip().upper() for n in raw.split(",") if n.strip()]

    @staticmethod
    def _extract_youtube_id(raw: dict, slug: str) -> str | None:
        vm = raw.get("video_metadata") or {}
        if vm.get("youtube_id"):
            return vm["youtube_id"]
        # Slug sometimes IS the YouTube ID (11-char alphanumeric-with-dash)
        if re.match(r"^[A-Za-z0-9_-]{11}$", slug):
            return slug
        return None

    def _slug_course_id(self) -> str:
        """Derive course_id from the directory slug when data.json is absent."""
        slug  = self.zip_root.name
        parts = slug.split("-")
        dept  = parts[0].upper() if parts else "UNKNOWN"
        num   = parts[1] if len(parts) > 1 else ""
        digits  = re.match(r"^\d+", num)
        variant = re.sub(r"^\d+", "", num).upper()
        return f"{dept}.{digits.group(0)}{variant}" if digits else dept

    def _metadata_from_slug(self) -> dict:
        """Minimal metadata derived from the directory slug."""
        slug  = self.zip_root.name
        parts = slug.split("-")

        year_m   = re.search(r"(20\d{2}|19\d{2})", slug)
        year     = year_m.group(1) if year_m else ""
        season_m = re.search(r"\b(fall|spring|summer|winter)\b", slug)
        season   = season_m.group(1).title() if season_m else ""
        term     = f"{season} {year}".strip()

        return {
            "course_id":              self._slug_course_id(),
            "extra_course_ids":       [],
            "site_uid":               "",
            "legacy_uid":             None,
            "title":                  "",
            "description":            "",
            "department_numbers":     [],
            "departments":            [],
            "topics":                 [],
            "level":                  [],
            "term":                   term,
            "year":                   year,
            "instructors":            [],
            "learning_resource_types": [],
        }
