# -*- coding: utf-8 -*-
u"""選び直しを学ぶ（仕上げ.py ㊱）

■ 本人の指定（2026-11-21）

  > この変更を覚えていてもらいたくて、変更した内容を蓄積して、データとして解析しどんどんあなたの
  > 画像割り当て精度を高めて欲しいです。

  本人がスマホで選び直した 118 か所（ラブコメ20選）は、ほぼ「その字幕に出てくる人が写っている絵」だった
  （選び直した割合 名前の出る字幕 67%・立場の言葉 52%・人が出ない字幕 29%）。
  設計は docs/superpowers/specs/2026-11-21-選び直しを学ぶ-design.md

■ 見ること
  ① 台本のあらすじから主人公・ヒロインの名前を読む／字幕に出てくる人（名前・立場の言葉・二人）
"""
from __future__ import print_function
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
warui = []


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def mod(path, name):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def ichi(ms):
    u"""① 名前を読む・字幕に出てくる人"""
    paras = [u"物語は、見た目で怖がられている高校生の主人公、高須竜児と、小さくて気の強いヒロイン、逢坂大河が、"
             u"お互いに好きな人と結ばれるため、協力関係となるところから始まります。",
             u"本作の魅力は、竜児と大河の掛け合いで、…",
             u"物語は、ごく普通の主人公が、旅に出るところから始まります。"]
    ji = ms.hito_jisho(paras, [u"とらドラ！", u"とらドラ！", u"名無し"])
    t = ji.get(u"とらドラ！", {})
    iu(t.get(u"主人公") == [u"高須竜児"] and t.get(u"ヒロイン") == [u"逢坂大河"],
       u"① あらすじから主人公（高須竜児）とヒロイン（逢坂大河）を読む（%s）" % t)
    iu(t.get(u"yobi", {}).get(u"竜児") == u"高須竜児" and t.get(u"yobi", {}).get(u"大河") == u"逢坂大河",
       u"① 同じ章の台本に出てくる短い呼び名（竜児・大河）も同じ人")
    iu(ms.hito_no_ji(u"高須竜児と、小さくて気の強いヒロイン、", t) == frozenset([u"高須竜児"]),
       u"① 名前が出る字幕は名前だけ（同じ字幕の「ヒロイン」は次の字幕の人の説明なので数えない）")
    iu(ms.hito_no_ji(u"物語は、見た目で怖がられている高校生の主人公、", t) == frozenset([u"高須竜児"]),
       u"① 名前の無い字幕の「主人公」は、その作品の主人公の名前に読みかえる")
    iu(ms.hito_no_ji(u"二人の掛け合いと、", t) == frozenset([u"高須竜児", u"逢坂大河"]),
       u"① 「二人」は主人公とヒロイン")
    iu(ms.hito_no_ji(u"そのリアルすぎる表現に心を打たれ、", t) == frozenset(),
       u"① 人が出ない字幕は空")
    iu(ms.hito_no_ji(u"主人公が旅に出る", ji.get(u"名無し", {})) == frozenset([u"主人公"]),
       u"① 名前が台本から取れない作品は「主人公」の言葉のまま")
    ji2 = ms.hito_jisho([u"物語は、同人ゲームを作ろうとしている主人公の安芸倫也が、偶然出会ったヒロイン、加藤恵を、"
                         u"ゲームの主役のモデルに決めるところから始まります。",
                         u"感情をあまり表に出さない恵がふとした瞬間に見せる本音に、恵まれた環境の倫也が…"],
                        [u"冴え", u"冴え"])
    y2 = ji2.get(u"冴え", {}).get(u"yobi", {})
    iu(u"恵" not in y2 and y2.get(u"倫也") == u"安芸倫也",
       u"① 1文字の呼び名は使わない（「恵まれた」に入る）・2文字の呼び名（倫也）は使う（%s）" % y2)


def main():
    ms = mod(os.path.join(HERE, u"make_slideshow.py"), u"ms_manabi")
    ichi(ms)
    return 0


if __name__ == "__main__":
    rc = main()
    print(u"")
    if rc or warui:
        print(u"落ちました。%d件:" % len(warui))
        for x in warui:
            print(u"  ・" + x)
        sys.exit(1)
    print(u"全部通りました。")
