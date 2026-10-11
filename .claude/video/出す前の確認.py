# -*- coding: utf-8 -*-
u"""**公開中の掲示板に差し替えて出す直前**の board.html を、機械で確かめる。

    python 出す前の確認.py <出すファイル> [--moto 公開中のもの]

なぜ要るか（2026-10-11・v154 で実際に困った）
-----------------------------------------------
`仕上げ.py` の ⑤ は **scratchpad の board.src.html** を見ている。
これは git に入っていないので、別のセッションが直してもこちらに来ない。
だから「公開中の掲示板は正しいのに、⑤ だけが落ちる」ことが起きる
（v154 で起きた。置き場所.txt が ZIP に 0 か所と出たが、
 公開中のものには 2 か所ちゃんと入っていた）。

そのときの正しい渡し方は **「公開中のものを読んで py-* だけ差し替える」** で、
board.src.html は出さない。ただしその出す側を機械が見ていなかった。
**見ていない所は必ず壊れる。** だからここで見る。

見るもの
--------
① py-* の並びと数が、公開中のものと変わっていないか（増減＝取りこぼし）
② ZIPを作る2か所とも pushKyotsu を呼び、置き場所.txt を入れているか
③ menu.ps1 の MakeVideo が Prepare を呼ぶのが 1 か所あるか
   （v150 がまる1版ぶん本人のパソコンに届かなかった原因）
④ 差し替えた py-* が Python として読めるか（</script のばらしの壊れ）
⑤ PACK_VERSION が上がっているか
⑥ 入れたはずの道具の中身が、リポジトリのものと1文字まで同じか
"""
import io
import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
IRERU = [(u"py-slideshow", u"make_slideshow.py"),
         (u"py-manabu", u"話数を学ぶ.py")]


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def dasu(s):
    return re.findall(r'<script type="text/plain" id="([^"]+)"', s)


def naka(s, sid):
    m = re.search(r'<script type="text/plain" id="%s">\n(.*?)\n</script>'
                  % re.escape(sid), s, re.S)
    return m.group(1) if m else None


def main():
    if len(sys.argv) < 2:
        say(__doc__)
        return 2
    p = sys.argv[1]
    moto = None
    if u"--moto" in sys.argv:
        moto = sys.argv[sys.argv.index(u"--moto") + 1]
    s = io.open(p, encoding="utf-8").read()
    warui = []

    # ① py-* の並び
    ids = dasu(s)
    say(u"py-* は %d本" % len(ids))
    if moto:
        m0 = dasu(io.open(moto, encoding="utf-8").read())
        if m0 != ids:
            kieta = [x for x in m0 if x not in ids]
            fueta = [x for x in ids if x not in m0]
            warui.append(u"py-* の並びが変わりました 消えた:%s 増えた:%s"
                         % (u",".join(kieta) or u"なし",
                            u",".join(fueta) or u"なし"))
        else:
            say(u"○ ① 公開中のものと同じ並び・同じ数")
    elif len(ids) < 50:
        warui.append(u"py-* が %d本しかありません（50本以上あるはず）" % len(ids))

    # ② ZIP の2か所
    yobi = len(re.findall(r"^\s*pushKyotsu\(entries\);", s, re.M))
    nb = len(re.findall(r'name:"置き場所\.txt"', s))
    if yobi < 2 or nb < 2:
        warui.append(u"ZIPを作る所: pushKyotsu %d か所 / 置き場所.txt %d か所"
                     u"（どちらも2か所必要）" % (yobi, nb))
    else:
        say(u"○ ② ZIPを作る2か所とも共通と置き場所.txtが入ります")

    # ③ Prepare
    pre = s.count(u'"  Prepare",')
    if pre != 1:
        warui.append(u"MakeVideo の Prepare が %d か所（1か所でなければならない）" % pre)
    else:
        say(u"○ ③ MakeVideo が Prepare を呼びます")

    # ④⑥ 中身
    for sid, fn in IRERU:
        t = naka(s, sid)
        if t is None:
            warui.append(u"%s が入っていません" % sid)
            continue
        t = t.replace(u"<\\/script", u"</script")
        try:
            compile(t, sid, "exec")
        except SyntaxError as e:
            warui.append(u"%s が Python として読めません: %s" % (sid, e))
            continue
        honmono = io.open(os.path.join(REPO, fn), encoding="utf-8").read()
        if t != honmono:
            warui.append(u"%s の中身が %s と違います（%d文字 対 %d文字）"
                         % (sid, fn, len(t), len(honmono)))
        else:
            say(u"○ ④⑥ %-14s %s と1文字まで同じ（%d文字）" % (sid, fn, len(t)))

    # ⑤ 版
    v = re.findall(r'PACK_VERSION\s*=\s*"v(\d+)"', s)
    if len(v) != 1:
        warui.append(u"PACK_VERSION が %d 個あります（1個のはず）" % len(v))
    else:
        say(u"○ ⑤ PACK_VERSION = v%s" % v[0])
        if moto:
            v0 = re.findall(r'PACK_VERSION\s*=\s*"v(\d+)"',
                            io.open(moto, encoding="utf-8").read())
            if v0 and int(v[0]) <= int(v0[0]):
                warui.append(u"PACK_VERSION が上がっていません（v%s → v%s）"
                             % (v0[0], v[0]))

    say(u"")
    if warui:
        say(u"落ちました。%d件:" % len(warui))
        for w in warui:
            say(u"  ・" + w)
        say(u"\n出さないこと。直してからもう一度。")
        return 1
    say(u"○ ぜんぶ通りました。この board.html は出してよいです。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
