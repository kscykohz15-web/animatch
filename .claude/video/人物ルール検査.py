# -*- coding: utf-8 -*-
u"""人物ルール.txt が使っているタグが、本当に出てくる言葉か調べる。

タグ一覧.txt に無い言葉を条件に書くと、その規則は**絶対に当たらない**。
黙って当たらないだけなので、気づけない。
実際 オルステッド が「白髪 鎧 大人 男」になっていて、
「男」というタグは存在せず、一度も名前が付かなかった。

  python 人物ルール検査.py
"""
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def goi():
    u"""タグ一覧.txt に出てくる言葉を集める。"""
    out = set()
    for line in io.open(os.path.join(HERE, u"タグ一覧.txt"),
                        encoding="utf-8-sig").read().replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#") or t.startswith(u"■") or t.startswith(u"※"):
            continue
        out.update(t.replace(u"　", u" ").split())
    return out


def main():
    g = goi()
    if len(g) < 30:
        print(u"× タグ一覧.txt が読めていません (%d語)" % len(g))
        return 1
    warui, kazu = [], 0
    for n, line in enumerate(io.open(os.path.join(HERE, u"人物ルール.txt"),
                                     encoding="utf-8-sig").read()
                             .replace("\r\n", "\n").split("\n"), 1):
        t = line.strip()
        if not t or t.startswith(u"#") or u"\t" not in t:
            continue
        namae, joken = t.split(u"\t", 1)
        if namae.strip() == u"代わり":
            # 「代わり <タブ> 絵の無い人 <タブ> 代わりに写す人たち」の行。
            # タグの条件ではなく、人の名前が並んでいるだけなので調べない。
            continue
        kazu += 1
        for w in joken.replace(u"　", u" ").split():
            for x in w.lstrip(u"!").split(u"|"):
                if x and x not in g:
                    warui.append((n, namae.strip(), x))
    # miru_kekka.py の「やられ顔」の言葉も、出てくるタグか調べる。
    # コードの中に書いた言葉は、どの検査も見ていなかった
    # （「苦痛」と書いて、一度も当たらないまま気づけなかった）。
    try:
        import importlib.util
        sp = importlib.util.spec_from_file_location(
            "mk_r", os.path.join(HERE, u"miru_kekka.py"))
        mk = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(mk)
        for x in getattr(mk, "YARARE", []):
            kazu += 1
            if x not in g:
                warui.append((0, u"やられ顔(miru_kekka.py の YARARE)", x))
    except Exception as e:
        print(u"× miru_kekka.py を読めませんでした: %s" % e)
        return 1
    if warui:
        for (n, namae, x) in warui:
            print(u"× %d行目 %s の条件「%s」は、タグ一覧.txt にありません"
                  % (n, namae, x))
        print(u"\n× %d件。その規則は一度も当たりません。" % len(warui))
        return 1
    print(u"○ 人物ルール %d件の条件は、すべて出てくるタグです（%d語）"
          % (kazu, len(g)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
