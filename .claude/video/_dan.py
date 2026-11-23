# -*- coding: utf-8 -*-
u"""ずれ検査 を**1段ずつ**走らせる（長い background が落ちるため）

    python _dan.py <段(1-6)> [乱数の数]

ずれ検査.py の段の表と線をそのまま使う。線は1つも動かしていない。
"""
from __future__ import print_function
import importlib.util, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("zk", os.path.join(HERE, u"ずれ検査.py"))
zk = importlib.util.module_from_spec(spec); sys.modules["zk"] = zk
spec.loader.exec_module(zk)

DAN = [
    (True, 1.0, u"実測 54/54(本物と同じ)", zk.GOUKAKU_OOKII, zk.GOUKAKU_HEIKIN,
     zk.GOUKAKU_WARIAI, False, zk.GOUKAKU_NAKA, False, None, None),
    (True, 15.0 / 54.0, u"実測 15/54(測れない所が多いとき)", zk.HONBAN_OOKII,
     zk.HONBAN_HEIKIN, zk.HONBAN_WARIAI, False, zk.HONBAN_NAKA, False, None, None),
    (False, 1.0, u"実測なし(予備の道)", zk.YOBI_OOKII, zk.YOBI_HEIKIN,
     zk.YOBI_WARIAI, False, zk.YOBI_NAKA, False, None, None),
    (True, 1.0, u"きつい材料(偽の寄せ先あり)", zk.KITSUI_OOKII, zk.KITSUI_HEIKIN,
     zk.KITSUI_WARIAI, True, zk.KITSUI_NAKA, False, None, None),
    (True, 1.0, u"つなぎ目が狭い材料(錨の寄せ先ゼロ)", zk.SEMAI_OOKII, zk.SEMAI_HEIKIN,
     zk.SEMAI_WARIAI, True, zk.SEMAI_NAKA, True, zk.SEMAI_ANC_OOKII, zk.SEMAI_ANC_HEIKIN),
    (True, 1.0, u"本人の回と同じ形(切れはしの途中にも息継ぎ)", zk.HONMONO_OOKII,
     zk.HONMONO_HEIKIN, zk.HONMONO_WARIAI, False, zk.HONMONO_NAKA, False, None, None),
]

i = int(sys.argv[1]) - 1
kai = int(sys.argv[2]) if len(sys.argv) > 2 else 2
(tsukau, wari, nm, oo, he, wa, kitsui, nk, semai, anc_oo, anc_he) = DAN[i]
if zk.junbi() is None:
    sys.exit(1)
zk.jissoku_kirikae(tsukau, wari)
zk.KITSUI[0] = kitsui
zk.SEMAI[0] = semai
zk.HONMONO[0] = nm.startswith(u"本人の回と同じ形")
print(u"── %s ──" % nm)
r = zk.shirabe(kai, nm, oo, he, wa, nk, anc_oo, anc_he)
print(u"RESULT %d %s" % (r, nm))
sys.exit(r)
