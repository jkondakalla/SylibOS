"""Shared utilities used across adapters, shapes, and pipeline."""

from __future__ import annotations
import json
import re
from pathlib import Path


def html_to_text(html: str) -> str:
    """Strip HTML tags, decode entities, collapse whitespace."""
    try:
        from bs4 import BeautifulSoup
        text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s{2,}", " ", text).strip()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"Bad JSON at {path}: {e}") from e


def humanise_slug(slug: str) -> str:
    """'18-06sc-linear-algebra-fall-2011' → 'Linear Algebra'"""
    parts = slug.split("-")
    clean = [
        p for p in parts
        if not re.match(r"^\d{4}$", p)
        and p not in ("fall", "spring", "summer", "winter")
        and not re.match(r"^\d+[a-z]{0,3}$", p)
    ]
    return " ".join(clean).title() or slug
