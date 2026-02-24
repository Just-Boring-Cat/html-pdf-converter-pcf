#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTROL_MANIFEST = ROOT / "pcf/HtmlPdfPrintButton/HtmlPdfPrintButton/ControlManifest.Input.xml"
SOLUTION_XML = ROOT / "solution/Html_to_PDF_Component_Solution/src/Other/Solution.xml"


def bump_patch(version: str) -> str:
    parts = [int(p) for p in version.strip().split(".") if p != ""]
    while len(parts) < 3:
        parts.append(0)
    parts[2] += 1
    return ".".join(str(p) for p in parts)


def replace_once(pattern: str, text: str, repl_fn):
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        raise ValueError(f"Pattern not found: {pattern}")
    replacement = repl_fn(match)
    return text[: match.start()] + replacement + text[match.end() :], match


def update_control_manifest(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")

    def repl(match: re.Match[str]) -> str:
        old = match.group(2)
        new = bump_patch(old)
        repl.old = old  # type: ignore[attr-defined]
        repl.new = new  # type: ignore[attr-defined]
        return f'{match.group(1)}{new}{match.group(3)}'

    updated, _ = replace_once(r'(<control\b[^>]*\bversion=")([^"]+)(")', text, repl)
    path.write_text(updated, encoding="utf-8")
    return repl.old, repl.new  # type: ignore[attr-defined]


def update_solution_xml(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")

    def repl(match: re.Match[str]) -> str:
        old = match.group(2)
        new = bump_patch(old)
        repl.old = old  # type: ignore[attr-defined]
        repl.new = new  # type: ignore[attr-defined]
        return f"{match.group(1)}{new}{match.group(3)}"

    updated, _ = replace_once(r'(<Version>)([^<]+)(</Version>)', text, repl)
    path.write_text(updated, encoding="utf-8")
    return repl.old, repl.new  # type: ignore[attr-defined]


def main() -> int:
    try:
        control_old, control_new = update_control_manifest(CONTROL_MANIFEST)
        solution_old, solution_new = update_solution_xml(SOLUTION_XML)
    except Exception as exc:  # pragma: no cover
        print(f"[bump_versions] ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        f"[bump_versions] ControlManifest version {control_old} -> {control_new} | "
        f"Solution version {solution_old} -> {solution_new}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
