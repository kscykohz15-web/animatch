# -*- coding: utf-8 -*-
u"""画像プラン.txt が台本にちゃんと効くか、動画を作らずに調べる。

  ① #指定 のタグが タグ一覧.txt にある言葉か（綴り間違いは黙って外れるため）
  ② @@話数 のフォルダ名が 話数マップ.txt にあるか
  ③ 書いたキーワードが、本番と同じ切り方で台本に当たるか
  ④ 字幕のうち何割に、* 以外の行が当たるか（当たらないぶんは中身と無関係な絵になる）

  python plan_check.py 画像プラン_第1回.txt ../final/第1回_人生年表_字幕用_最終版.txt
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def tags_of(path):
    u"""タグ一覧.txt から、使ってよい言葉を集める。"""
    go = set()
    for line in io.open(path, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#"):
            continue
        if t.startswith(u"■"):
            continue
        t = t.split(u"※")[0]
        for w in t.split():
            if w and not w.startswith(u"("):
                go.add(w)
    return go


def wasuu_of(path):
    u"""話数マップ.txt のフォルダ名。"""
    out = set()
    for line in io.open(path, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        if u"\t" in line and not line.lstrip().startswith(u"#"):
            out.add(line.split(u"\t")[0].strip())
    return out


def cues_of(script):
    out = []
    for dan in io.open(script, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        if dan.strip():
            out.extend(M.kugiri(dan.strip()))
    return out


def yomu(plan):
    u"""画像プランを、行の並びとして読む。(キーワード群, 指定の並び) """
    rows, focus = [], []
    for line in io.open(plan, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#") or u"\t" not in t:
            continue
        k, v = t.split(u"\t", 1)
        k, v = k.strip(), [x.strip() for x in v.split(u",") if x.strip()]
        if k == u"@@話数":
            focus = v
        elif k:
            rows.append(([x for x in k.split(u"|") if x], v))
    return rows, focus


def shirabe(plan, script, shizuka=False):
    tags = tags_of(os.path.join(HERE, u"タグ一覧.txt"))
    wasuu = wasuu_of(os.path.join(HERE, u"話数マップ.txt"))
    rows, focus = yomu(plan)
    cues = cues_of(script)
    komatta = []

    # ① タグの綴り
    warui_tag = set()
    for keys, files in rows:
        for f in files:
            if not f.startswith(u"#"):
                continue
            for w in f[1:].split():
                if w not in tags:
                    warui_tag.add(w)
    if warui_tag:
        komatta.append(u"タグ一覧に無い言葉 %d個: %s"
                       % (len(warui_tag), u" ".join(sorted(warui_tag))))

    # ② 話数フォルダ
    warui_wa = [f for f in focus if f not in wasuu]
    for keys, files in rows:
        for f in files:
            if f.startswith(u"@") and not f.startswith(u"@@"):
                if f[1:] not in wasuu:
                    warui_wa.append(f[1:])
            elif u"/" in f:
                if f.split(u"/")[0] not in wasuu:
                    warui_wa.append(f.split(u"/")[0])
    if warui_wa:
        komatta.append(u"話数マップに無いフォルダ: %s"
                       % u" ".join(sorted(set(warui_wa))))

    # ③ 台本に当たらないキーワード
    atara = []
    for keys, files in rows:
        if keys == [u"*"]:
            continue
        if not any(any(k in c for c in cues) for k in keys):
            atara.append(u"|".join(keys))
    if atara:
        komatta.append(u"台本に無いキーワード %d本: %s"
                       % (len(atara), u" / ".join(atara[:8])))

    # ④ どれだけの字幕に、* 以外が当たるか（本番と同じ「いちばん長いキー」規則）
    atta = 0
    for c in cues:
        best, blen = None, -1
        for keys, files in rows:
            if keys == [u"*"]:
                continue
            for k in keys:
                if k in c and len(k) > blen:
                    best, blen = files, len(k)
        atta += best is not None
    wariai = 100.0 * atta / max(1, len(cues))
    if wariai < 70.0:
        komatta.append(u"字幕の %.0f%% にしか当たっていません（70%%は欲しい）" % wariai)

    if not shizuka:
        print(u"%s" % os.path.basename(plan))
        print(u"  @@話数: %s" % (u", ".join(focus) or u"（指定なし）"))
        print(u"  行 %d本 / 字幕 %d枚 → 当たる字幕 %d枚 (%.0f%%)"
              % (len(rows), len(cues), atta, wariai))
    return komatta, wariai


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(u"使い方: python plan_check.py 画像プラン_○○.txt 台本_字幕用.txt")
        sys.exit(1)
    k, _ = shirabe(sys.argv[1], sys.argv[2])
    for x in k:
        print(u"  → " + x)
    sys.exit(1 if k else 0)
