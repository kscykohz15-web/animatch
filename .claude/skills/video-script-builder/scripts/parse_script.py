#!/usr/bin/env python3
"""Parse a timestamped script (SRT, WebVTT, or plain `HH:MM:SS[.ms] text` lines)
into a flat list of cues with start/end/text, written as JSON.

Usage:
    python3 parse_script.py script.srt -o cues.json
    python3 parse_script.py script.txt --format plain --end-pad 4 -o cues.json
"""
import argparse
import json
import re
import sys

TIMESTAMP_RE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})"
)

# SRT/VTT cue timing line, e.g. "00:00:01,000 --> 00:00:04,000"
RANGE_RE = re.compile(
    r"(?P<h>\d{1,2}):(?P<m>\d{2}):(?P<s>\d{2})[.,](?P<ms>\d{1,3})\s*-->\s*"
    r"(?P<h2>\d{1,2}):(?P<m2>\d{2}):(?P<s2>\d{2})[.,](?P<ms2>\d{1,3})"
)

# Plain cue line, e.g. "00:00:05 セリフ内容" or "0:05 セリフ内容"
PLAIN_RE = re.compile(
    r"^\s*(?:(?P<h>\d{1,2}):)?(?P<m>\d{1,2}):(?P<s>\d{2}(?:[.,]\d{1,3})?)\s+(?P<text>.+)$"
)


def _to_seconds(h, m, s, ms=0):
    return int(h or 0) * 3600 + int(m or 0) * 60 + int(s or 0) + int(ms or 0) / 1000.0


def parse_srt_or_vtt(text):
    """Parses SRT and WebVTT alike: both use the same '-->' range line,
    just with ',' vs '.' as the millisecond separator and an optional
    'WEBVTT' header / cue-id lines, which we simply ignore."""
    lines = text.splitlines()
    cues = []
    i = 0
    cue_id = 0
    while i < len(lines):
        line = lines[i].strip()
        m = RANGE_RE.search(line)
        if m:
            start = _to_seconds(m.group("h"), m.group("m"), m.group("s"), m.group("ms"))
            end = _to_seconds(m.group("h2"), m.group("m2"), m.group("s2"), m.group("ms2"))
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip() != "":
                text_lines.append(lines[i].strip())
                i += 1
            cue_id += 1
            cues.append(
                {
                    "id": cue_id,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": " ".join(text_lines).strip(),
                }
            )
        i += 1
    return cues


def parse_plain(text, end_pad):
    lines = [l for l in text.splitlines() if l.strip() != ""]
    raw = []
    for line in lines:
        m = PLAIN_RE.match(line)
        if not m:
            continue
        s_val = m.group("s").replace(",", ".")
        start = _to_seconds(m.group("h"), m.group("m"), s_val)
        raw.append((start, m.group("text").strip()))
    if not raw:
        return []
    cues = []
    for idx, (start, cue_text) in enumerate(raw):
        end = raw[idx + 1][0] if idx + 1 < len(raw) else start + end_pad
        cues.append(
            {"id": idx + 1, "start": round(start, 3), "end": round(end, 3), "text": cue_text}
        )
    return cues


def detect_format(text):
    stripped = text.lstrip()
    if stripped.upper().startswith("WEBVTT"):
        return "vtt"
    if RANGE_RE.search(text):
        return "srt"
    return "plain"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("script", help="Path to the script file")
    ap.add_argument(
        "--format",
        choices=["auto", "srt", "vtt", "plain"],
        default="auto",
        help="Script format (default: auto-detect)",
    )
    ap.add_argument(
        "--end-pad",
        type=float,
        default=4.0,
        help="Seconds to give the final cue when using --format plain (default: 4.0)",
    )
    ap.add_argument("-o", "--out", default="cues.json", help="Output JSON path")
    args = ap.parse_args()

    with open(args.script, "r", encoding="utf-8") as f:
        text = f.read()

    fmt = args.format if args.format != "auto" else detect_format(text)

    if fmt in ("srt", "vtt"):
        cues = parse_srt_or_vtt(text)
    else:
        cues = parse_plain(text, args.end_pad)

    if not cues:
        print(f"error: no cues could be parsed from {args.script} (format={fmt})", file=sys.stderr)
        sys.exit(1)

    for c in cues:
        if c["end"] <= c["start"]:
            print(
                f"warning: cue {c['id']} has non-positive duration "
                f"(start={c['start']}, end={c['end']}); check the script",
                file=sys.stderr,
            )

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(cues, f, ensure_ascii=False, indent=2)

    total = cues[-1]["end"] - cues[0]["start"]
    print(f"parsed {len(cues)} cues ({fmt} format), total span {total:.1f}s -> {args.out}")


if __name__ == "__main__":
    main()
