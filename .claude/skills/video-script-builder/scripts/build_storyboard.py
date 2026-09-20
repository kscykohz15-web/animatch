#!/usr/bin/env python3
"""Turn cues.json + an assets folder into an editable storyboard.yaml.

Convention: name asset files with the cue id as a numeric prefix, e.g.
    assets/001_title.png
    assets/002.mp4
    assets/007_map.jpg
Files matching a cue's id are auto-assigned. Anything left as `visual: null`
must be filled in by hand (or by Claude, reading the cue text and the asset
folder) before rendering.

Usage:
    python3 build_storyboard.py cues.json --assets-dir assets -o storyboard.yaml
"""
import argparse
import json
import re
from pathlib import Path

import yaml

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}
PREFIX_RE = re.compile(r"^0*(\d+)[_.\-]")


def index_assets(assets_dir):
    by_id = {}
    for p in sorted(Path(assets_dir).iterdir()):
        if not p.is_file():
            continue
        m = PREFIX_RE.match(p.name)
        if m:
            by_id.setdefault(int(m.group(1)), []).append(p)
    return by_id


def asset_kind(path):
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return "unknown"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cues", help="Path to cues.json from parse_script.py")
    ap.add_argument("--assets-dir", required=True, help="Directory holding per-cue assets")
    ap.add_argument("-o", "--out", default="storyboard.yaml", help="Output storyboard YAML path")
    ap.add_argument(
        "--default-zoom",
        choices=["in", "out", "none"],
        default="in",
        help="Default Ken Burns zoom applied to image cues with no explicit override (default: in)",
    )
    args = ap.parse_args()

    with open(args.cues, "r", encoding="utf-8") as f:
        cues = json.load(f)

    assets_by_id = index_assets(args.assets_dir)
    unmatched = []
    entries = []
    for cue in cues:
        matches = assets_by_id.get(cue["id"], [])
        visual = None
        kind = None
        if matches:
            chosen = matches[0]
            kind = asset_kind(chosen)
            visual = str(chosen)
            if len(matches) > 1:
                print(f"note: cue {cue['id']} matched multiple files, using {chosen.name}")
        else:
            unmatched.append(cue["id"])

        entries.append(
            {
                "id": cue["id"],
                "start": cue["start"],
                "end": cue["end"],
                "duration": round(cue["end"] - cue["start"], 3),
                "text": cue["text"],
                "visual": visual,
                "kind": kind,  # "image" | "video"; render_video.py re-detects if null
                "zoom": args.default_zoom if kind == "image" else "none",
                "transition": "cut",
            }
        )

    storyboard = {"cues": entries}
    with open(args.out, "w", encoding="utf-8") as f:
        yaml.safe_dump(storyboard, f, allow_unicode=True, sort_keys=False)

    print(f"wrote {len(entries)} cues -> {args.out}")
    if unmatched:
        print(
            f"warning: {len(unmatched)} cue(s) have no matching asset and need a manual "
            f"`visual:` value before rendering: {unmatched}"
        )


if __name__ == "__main__":
    main()
