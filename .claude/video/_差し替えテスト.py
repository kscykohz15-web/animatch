# -*- coding: utf-8 -*-
u"""差し替え.txt の読み取りを、**書きまちがいも含めて**最後まで走らせる

■ なぜ要るか（2026-10-22・本人のパソコンで動画が1本も作れなくなった）

v166 で「番号がまちがっているとき、使える幅まで出す」を足した。
ところが `code_norm` は**文字列ではなく (期,話,通し番号) の組**を返す。
それを文字列として split したので、

    AttributeError: 'tuple' object has no attribute 'split'

で落ちた。**落ちたのは「番号がまちがっているとき」だけ通る枝。**
こちらの材料には画像の番号が無いので、検査は一度もそこを通らなかった。

70節とまったく同じ失敗（ずれ実測.py を2版続けて落とした）。
**通らない枝は、壊れても分からない。** だから、

  ・ある番号            → その絵に当たる
  ・無い番号(範囲の外)   → 落ちず、**使える幅**を教える
  ・でたらめな文字       → 落ちず、知らせだけ出す
  ・紙の候補番号(1桁)    → 候補に当たる／無ければ知らせ

を、番号のある絵をその場で作って全部通す。ffmpeg も画像も要らない。
"""
from __future__ import print_function
import io
import os
import sys

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


def main():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"ms2", os.path.join(HERE, u"make_slideshow.py"))
    ms = importlib.util.module_from_spec(spec)
    sys.modules[u"ms2"] = ms
    spec.loader.exec_module(ms)

    # 本人の並びと同じ形の絵。第11話は 69枚しかない（本人の回と同じ）。
    images = []
    for i in range(1, 70):
        images.append(u"無職転生Ⅲ 第11話/%03d_aaa_x2.png" % i)
    for i in range(1, 80):
        images.append(u"無職転生Ⅲ 第12話/%03d_bbb_x2.png" % i)
    iu(ms.img_code(images[0]) == u"3-11-001",
       u"絵の名前から短い番号が作れる（%s）" % ms.img_code(images[0]))

    import tempfile
    oku = tempfile.mkdtemp(prefix=u"sashikae_")
    p = os.path.join(oku, u"差し替え.txt")

    def yomu(naka):
        io.open(p, "w", encoding="utf-8", newline="\r\n").write(naka)
        return ms.load_sashikae(p, images, moji=None)

    # ① ある番号
    out = yomu(u"1\t3-11-056\r\n")
    iu(out.get(1) == u"無職転生Ⅲ 第11話/056_aaa_x2.png",
       u"ある番号は、その絵に当たる（%s）" % out.get(1))

    # ② **無い番号（本人が落ちたのはここ）**
    out = yomu(u"9\t3-11-131\r\n")
    iu(not out.get(9), u"無い番号は当たらない（落ちずに済む）")

    # ③ でたらめな文字
    out = yomu(u"5\tあいうえお\r\n")
    iu(not out.get(5), u"でたらめな文字でも落ちない")

    # ④ 話数ごと無い番号
    out = yomu(u"3\t3-99-001\r\n")
    iu(not out.get(3), u"その話数が無くても落ちない")

    # ⑤ 1桁（紙の候補）── 候補が無いときの知らせ
    out = yomu(u"7\t4\r\n")
    iu(not out.get(7), u"紙の候補が無くても落ちない")

    # ⑥ まとめて（本人の差し替え.txt と同じ形）
    out = yomu(u"1\t3-12-070\r\n2\t3-12-044\r\n9\t3-11-131\r\n"
               u"16\t3-11-057\r\n")
    iu(out.get(1) == u"無職転生Ⅲ 第12話/070_bbb_x2.png"
       and out.get(16) == u"無職転生Ⅲ 第11話/057_aaa_x2.png"
       and not out.get(9),
       u"まとめて読んでも、合っているものだけ当たる（%d枚）" % len(out))

    import shutil
    shutil.rmtree(oku, ignore_errors=True)
    print(u"")
    if warui:
        print(u"× %d件 落ちました" % len(warui))
        return 1
    print(u"○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
