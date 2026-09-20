#!/usr/bin/env python3
"""Render a storyboard.yaml (see build_storyboard.py) into a finished MP4:
cuts stills/clips to length with an optional Ken Burns zoom, burns in or
attaches subtitles from the cue text, and mixes narration + optional
ducked background music.

Requires ffmpeg/ffprobe on PATH.

Pipeline (each stage writes an intermediate file into --work-dir so it can
be inspected/rerun independently):
  1. one silent segment per cue  -> work/seg_XXXX.mp4
  2. concat segments (+ subtitle burn-in) -> work/silent_video.mp4
  3. narration (+ ducked bgm)    -> work/final_audio.wav
  4. mux video + audio (+ soft subtitles) -> <out>

Usage:
    python3 render_video.py storyboard.yaml --narration narration.wav \
        --bgm bgm.mp3 --out episode.mp4
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}


def run(cmd, **kwargs):
    print("+ " + " ".join(str(c) for c in cmd), file=sys.stderr)
    subprocess.run(cmd, check=True, **kwargs)


def ffprobe_duration(path):
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def asset_kind(path):
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    raise ValueError(f"cannot infer asset kind for {path} (unrecognized extension)")


def build_image_segment(src, duration, zoom, width, height, fps, out_path):
    # Upscale before zoompan so the pan/zoom doesn't look pixelated, then
    # crop to the target aspect and pan/zoom, then pad to the exact size.
    frames = max(1, round(duration * fps))
    scale = f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,crop={width * 2}:{height * 2}"
    if zoom == "in":
        zexpr = "min(zoom+0.0012,1.4)"
        zoompan = f"zoompan=z='{zexpr}':d={frames}:s={width}x{height}:fps={fps}"
    elif zoom == "out":
        zexpr = "if(eq(on,1),1.4,max(zoom-0.0012,1.0))"
        zoompan = f"zoompan=z='{zexpr}':d={frames}:s={width}x{height}:fps={fps}"
    else:
        zoompan = f"zoompan=z='1':d={frames}:s={width}x{height}:fps={fps}"
    vf = f"{scale},{zoompan},format=yuv420p"
    run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(src),
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf,
            "-r",
            str(fps),
            "-pix_fmt",
            "yuv420p",
            str(out_path),
        ]
    )


def build_video_segment(src, duration, width, height, fps, out_path):
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(src),
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf,
            "-r",
            str(fps),
            "-an",
            "-pix_fmt",
            "yuv420p",
            str(out_path),
        ]
    )


def srt_timestamp(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(cues, t0, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        for i, cue in enumerate(cues, start=1):
            f.write(f"{i}\n")
            f.write(f"{srt_timestamp(cue['start'] - t0)} --> {srt_timestamp(cue['end'] - t0)}\n")
            f.write(f"{cue['text']}\n\n")


def build_narration(args, cues, t0, workdir):
    if args.narration:
        return Path(args.narration)
    if args.narration_dir:
        clips = []
        for cue in cues:
            matches = sorted(glob.glob(os.path.join(args.narration_dir, f"{cue['id']:03d}*")))
            if matches:
                clips.append((cue, matches[0]))
        if not clips:
            print(
                f"warning: no narration clips matched in {args.narration_dir} "
                f"(expected files like 001.wav)",
                file=sys.stderr,
            )
            return None
        inputs = []
        filter_parts = []
        for i, (cue, path) in enumerate(clips):
            inputs += ["-i", path]
            delay_ms = round((cue["start"] - t0) * 1000)
            filter_parts.append(f"[{i}:a]adelay={delay_ms}:all=1[a{i}]")
        mix_inputs = "".join(f"[a{i}]" for i in range(len(clips)))
        filter_complex = ";".join(filter_parts) + f";{mix_inputs}amix=inputs={len(clips)}:duration=longest:dropout_transition=0[aout]"
        out_path = workdir / "narration_from_clips.wav"
        run(
            [
                "ffmpeg",
                "-y",
                *inputs,
                "-filter_complex",
                filter_complex,
                "-map",
                "[aout]",
                str(out_path),
            ]
        )
        return out_path
    return None


def build_final_audio(narration_path, bgm_path, total_duration, workdir):
    out_path = workdir / "final_audio.wav"
    if narration_path and bgm_path:
        run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(narration_path),
                "-stream_loop",
                "-1",
                "-i",
                str(bgm_path),
                "-filter_complex",
                "[0:a]apad,atrim=0:{d}[nar];"
                "[1:a]volume=1.0[bgm_in];"
                "[bgm_in][nar]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=400[ducked];"
                "[ducked][nar]amix=inputs=2:duration=first:dropout_transition=0,volume=2,atrim=0:{d}[aout]".format(
                    d=f"{total_duration:.3f}"
                ),
                "-map",
                "[aout]",
                str(out_path),
            ]
        )
    elif narration_path:
        run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(narration_path),
                "-af",
                f"apad,atrim=0:{total_duration:.3f}",
                str(out_path),
            ]
        )
    elif bgm_path:
        run(
            [
                "ffmpeg",
                "-y",
                "-stream_loop",
                "-1",
                "-i",
                str(bgm_path),
                "-af",
                f"apad,atrim=0:{total_duration:.3f}",
                str(out_path),
            ]
        )
    else:
        return None
    return out_path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("storyboard", help="Path to storyboard.yaml from build_storyboard.py")
    ap.add_argument("--narration", help="Single narration audio file spanning the whole video")
    ap.add_argument(
        "--narration-dir",
        help="Directory of per-cue narration clips named like 001.wav, 002.wav, ...",
    )
    ap.add_argument("--bgm", help="Optional background music file (looped/trimmed, ducked under narration)")
    ap.add_argument("--out", default="output.mp4", help="Output video path")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument(
        "--subtitles",
        choices=["burn", "soft", "none"],
        default="burn",
        help="Burn subtitles into the video, attach as a soft mov_text track, or skip (default: burn)",
    )
    ap.add_argument(
        "--font",
        help="Font name for burned-in subtitles (e.g. 'Noto Sans CJK JP'); "
        "required for readable Japanese on most minimal ffmpeg installs",
    )
    ap.add_argument("--work-dir", help="Directory for intermediate files (default: temp dir, kept for debugging)")
    args = ap.parse_args()

    if args.narration and args.narration_dir:
        ap.error("pass only one of --narration / --narration-dir")

    with open(args.storyboard, "r", encoding="utf-8") as f:
        storyboard = yaml.safe_load(f)
    cues = storyboard["cues"]
    if not cues:
        ap.error("storyboard has no cues")

    missing = [c["id"] for c in cues if not c.get("visual")]
    if missing:
        ap.error(f"cues {missing} have no `visual` asset assigned in the storyboard; fill those in first")

    workdir = Path(args.work_dir) if args.work_dir else Path(tempfile.mkdtemp(prefix="video_render_"))
    workdir.mkdir(parents=True, exist_ok=True)
    print(f"work dir: {workdir}", file=sys.stderr)

    t0 = cues[0]["start"]
    total_duration = cues[-1]["end"] - t0

    segments = []

    # If the script's first cue doesn't start at t=0 (e.g. a couple of
    # seconds of lead-in before anyone speaks), freeze-frame the first
    # cue's visual for that gap so the video timeline still starts at 0 -
    # matching a narration track that was recorded/transcribed from t=0.
    lead_in = t0
    if lead_in > 0.05:
        seg_path = workdir / "seg_0000_leadin.mp4"
        first_visual = cues[0]["visual"]
        kind = cues[0].get("kind") or asset_kind(first_visual)
        if kind == "image":
            build_image_segment(first_visual, lead_in, "none", args.width, args.height, args.fps, seg_path)
        else:
            build_video_segment(first_visual, lead_in, args.width, args.height, args.fps, seg_path)
        segments.append(seg_path)

    for cue in cues:
        kind = cue.get("kind") or asset_kind(cue["visual"])
        seg_path = workdir / f"seg_{cue['id']:04d}.mp4"
        duration = cue["end"] - cue["start"]
        if kind == "image":
            build_image_segment(cue["visual"], duration, cue.get("zoom", "none"), args.width, args.height, args.fps, seg_path)
        else:
            build_video_segment(cue["visual"], duration, args.width, args.height, args.fps, seg_path)
        segments.append(seg_path)

    concat_list = workdir / "concat_list.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for seg in segments:
            escaped = str(seg.resolve()).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    srt_path = workdir / "subtitles.srt"
    write_srt(cues, t0, srt_path)

    silent_video = workdir / "silent_video.mp4"
    if args.subtitles == "burn":
        sub_arg = str(srt_path).replace("\\", "/").replace(":", "\\:")
        style = f":force_style='FontName={args.font}'" if args.font else ""
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-vf",
                f"subtitles={sub_arg}{style}",
                "-r",
                str(args.fps),
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
                str(silent_video),
            ]
        )
    else:
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(silent_video),
            ]
        )

    narration_path = build_narration(args, cues, t0, workdir)
    if args.narration:
        dur = ffprobe_duration(narration_path)
        if abs(dur - total_duration) > 1.0:
            print(
                f"warning: narration duration ({dur:.1f}s) differs from the "
                f"script's total span ({total_duration:.1f}s) by more than 1s",
                file=sys.stderr,
            )
    final_audio = build_final_audio(narration_path, args.bgm, total_duration, workdir)

    mux_cmd = ["ffmpeg", "-y", "-i", str(silent_video)]
    maps = ["-map", "0:v"]
    next_input = 1
    if final_audio:
        mux_cmd += ["-i", str(final_audio)]
        maps += ["-map", f"{next_input}:a"]
        audio_codec = ["-c:a", "aac", "-b:a", "192k"]
        next_input += 1
    else:
        audio_codec = []

    subtitle_codec = []
    if args.subtitles == "soft":
        mux_cmd += ["-i", str(srt_path)]
        maps += ["-map", f"{next_input}:s"]
        subtitle_codec = ["-c:s", "mov_text", "-metadata:s:s:0", "language=jpn"]
        next_input += 1

    run(mux_cmd + maps + ["-c:v", "copy", *audio_codec, *subtitle_codec, "-t", f"{total_duration:.3f}", str(args.out)])

    print(f"done: {args.out}")
    if not args.work_dir:
        print(f"(intermediate files left in {workdir}; delete manually if not needed)", file=sys.stderr)


if __name__ == "__main__":
    main()
