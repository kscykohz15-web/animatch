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
# ■ 差し替えたものは、**差し替えたものぜんぶ**を見る（2026-10-15）
#
# ここに書いていないものは見ない。見ていない所は必ず壊れる
# （この道具そのものが、その反省で出来ている）。
# v159 で ずれ実測.py と 見た目.txt も差し替えたのに、
# ここには make_slideshow.py と 話数を学ぶ.py しか無かった。
IRERU = [(u"py-slideshow", u"make_slideshow.py"),
         (u"py-manabu", u"話数を学ぶ.py"),
         (u"py-zure", u"ずれ実測.py"),
         # v162 で採点にも @@全部おまかせ を見せたので、ここにも足す。
         # 「差し替えたものはぜんぶ見る」── 見ていない所は必ず壊れる。
         (u"py-kekka", u"miru_kekka.py"),
         # v170 の採点で「カタログに2人目の名前が無い絵が 2373枚」と出た。
         # 付け直す口（--二人だけ）を miru.py に足したので、ここにも足す。
         # **見ていない所は必ず壊れる。**
         (u"py-miru", u"miru.py"),
         # v175 で「絵ではないフォルダ」、v176 で「髪の色」を
         # 置き場所.py に移した。**道具3本が同じ一覧を見る前提**なので、
         # ここが古いと miru.py だけ新しい一覧で動く。
         (u"py-basho", u"置き場所.py")]
# Python ではないもの（中身の一致だけ見る。compile はしない）
IRERU_TXT = [(u"kyotsu-mitame", u"見た目.txt")]


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def dasu(s):
    return re.findall(r'<script type="text/plain" id="([^"]+)"', s)


def naka(s, sid):
    u"""そのブロックの中身。

    ■ 改行が有る形と無い形が混ざっている（2026-10-15）

    `>\n中身\n</script>` だけを見ていたので、掲示板に 1行目から
    直に書いてあるブロック（kyotsu-mitame がそれ）が**取れずに
    「入っていません」と出ていた。** 取れないものを「無い」と
    言うのは、いちばん危ない嘘なので、両方の形を読む。
    """
    m = re.search(r'<script type="text/plain" id="%s">\n?(.*?)\n?</script>'
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

    for sid, fn in IRERU_TXT:
        t = naka(s, sid)
        if t is None:
            warui.append(u"%s が入っていません" % sid)
            continue
        t = t.replace(u"<\\/script", u"</script")
        honmono = io.open(os.path.join(REPO, fn), encoding="utf-8-sig").read()
        # 掲示板に入れるとき前後の改行は落ちるので、そこだけそろえて比べる
        if t.strip(u"\n") != honmono.strip(u"\n"):
            warui.append(u"%s の中身が %s と違います（%d文字 対 %d文字）"
                         % (sid, fn, len(t), len(honmono)))
        else:
            say(u"○ ⑥ %-14s %s と同じ（%d文字）" % (sid, fn, len(t)))

    # ⑦ 公開中にあって、出すほうから**消える**ものはないか（2026-10-15）
    #
    # ■ これが無くて、あやうく他人の仕事を消すところだった
    #
    # 差し替えのやり方は「公開中のものを読んで py-* だけ入れ替える」。
    # **入れ替えるブロックの中身は、こちらのファイルで丸ごと上書きされる。**
    # ところが公開中の掲示板には、**git に入っていない v159**（別のセッションが
    # 出したもの）があった。気づかずに出せば、その
    #   kiriyoi / load_shou_credit / muri_ni_kiru
    # が黙って消えていた（メモリ61節）。
    #
    # ⑥（入れたブロックがこちらのファイルと1文字まで同じか）では見つからない。
    # **⑥は「こちらのファイルが正しいか」を見ていない。**
    # 消えるものがあるかどうかは、公開中のものと比べるしかない。
    #
    # 行ごとに全部比べると注記の差で埋まるので、**def の名前**で見る。
    # 関数が消えるのは、まず間違いなく事故である。
    if moto:
        m0s = io.open(moto, encoding="utf-8").read()
        kieru = {}
        for sid, _fn in (IRERU + IRERU_TXT):
            a, b = naka(m0s, sid), naka(s, sid)
            if a is None or b is None:
                continue
            import re as _re
            aa = set(_re.findall(r"^def ([A-Za-z_0-9]+)", a, _re.M))
            bb = set(_re.findall(r"^def ([A-Za-z_0-9]+)", b, _re.M))
            if aa - bb:
                kieru[sid] = sorted(aa - bb)
        if kieru:
            for sid, ns in sorted(kieru.items()):
                warui.append(u"%s から関数が消えます: %s"
                             u"（公開中のほうが新しい可能性。git に無いものが"
                             u"出ているかもしれません）" % (sid, u" / ".join(ns)))
        else:
            say(u"○ ⑦ 公開中にあって消えてしまう関数はありません")

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
