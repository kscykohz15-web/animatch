# -*- coding: utf-8 -*-
u"""演出.txt の設定が、本人の編集のクセと合っているか計算する。

mane.py が本人の動画から測った数字と、同じものさしで比べます。
動画を作らずに出せるので、設定をいじって何度でも試せます。

  python 演出あわせ.py                 … いまの 演出.txt で
  python 演出あわせ.py 別の演出.txt    … 別の設定で
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

FPS = 30.0
SOKUDO = 6.46          # 実測の読み上げ速度（字/秒）

# mane.py が本人の5本(127分)から測った数字
HONNIN = {
    u"切り替わりの間隔(まんなか)": 2.20,
    u"パッと切る(2コマ以内)": 62.0,
    u"はっきり溶かす(5コマ以上)": 37.0,
    u"一瞬暗くなる": 27.0,
    u"効果音が鳴る": 65.0,
    u"効果音のずれ": 0.093,
}

KUMI = [
    (u"老デウス", u"画面表示_老デウス.txt", u"../final/老デウス_壮絶な人生年表_字幕用_最終版.txt"),
    (u"第1回", u"画面表示_第1回.txt", u"../final/第1回_人生年表_字幕用_最終版.txt"),
    (u"第6回", u"画面表示_第6回.txt", u"../final/第6回_ヒトガミの正体_字幕用_最終版.txt"),
    (u"第7回", u"画面表示_第7回.txt", u"../final/第7回_オルステッドの正体_字幕用_最終版.txt"),
]


def kumitate(script):
    u"""台本から、字幕1枚ずつと、その開始時刻を作る。

    読み上げ速度で割るので、本番の時刻表(音声から作るもの)とは
    少しずれるが、間隔の統計を見るには十分。
    """
    cues = []
    for dan in io.open(script, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        if dan.strip():
            cues.extend(M.kugiri(dan.strip()))
    rows, starts, t = [], [], 0.0
    for i, c in enumerate(cues):
        rows.append((0.0, u"え%04d" % i, c))     # 絵は毎回変わる前提
        starts.append(t)
        t += max(0.3, M.disp_len(c) / SOKUDO)
    return rows, starts, t


def hakaru(en_path):
    en = M.load_enshutsu(en_path)
    goukei = {u"cut": 0, u"fx": 0, u"anten": 0, u"se": 0,
              u"mijikai": 0, u"nagai": 0, u"byou": 0.0}
    aida = []
    for (nm, ov, sc) in KUMI:
        rows, starts, total = kumitate(os.path.join(HERE, sc))
        _credit, chaps = M.load_overlay(os.path.join(HERE, ov))
        kinds = M.kimeru_basho(rows, starts, chaps, en)
        n = len(rows) - 1                      # 切り替わりの数
        goukei[u"cut"] += n
        goukei[u"byou"] += total
        for i in range(1, len(rows)):
            aida.append(starts[i] - starts[i - 1])
        for i, k in kinds.items():
            spec = en["kubun"].get(k)
            if not spec:
                continue
            # 本番と同じ「尺より長いエフェクトはかけられない」を効かせる
            waku = max(0.3, starts[i] - starts[i - 1]) * 0.6
            d = min(spec["dur"], waku)
            koma = int(round(d * FPS))
            if spec["fx"] != u"なし":
                goukei[u"fx"] += 1
                if koma <= 2:
                    goukei[u"mijikai"] += 1
                elif koma >= 5:
                    goukei[u"nagai"] += 1
            if spec["fx"] == u"暗転":
                goukei[u"anten"] += 1
            if spec["se"] and spec["se"] != u"なし":
                goukei[u"se"] += 1
    aida.sort()
    cut = max(1, goukei[u"cut"])
    # エフェクトの付かない切り替わりは「0コマ＝パッと切る」に数える
    mijikai = goukei[u"mijikai"] + (cut - goukei[u"fx"])
    return {
        u"切り替わりの間隔(まんなか)": aida[len(aida) // 2] if aida else 0.0,
        u"パッと切る(2コマ以内)": 100.0 * mijikai / cut,
        u"はっきり溶かす(5コマ以上)": 100.0 * goukei[u"nagai"] / cut,
        u"一瞬暗くなる": 100.0 * goukei[u"anten"] / cut,
        u"効果音が鳴る": 100.0 * goukei[u"se"] / cut,
        u"効果音のずれ": en.get("sezure", 0.0),
    }, cut


def main():
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, u"演出.txt")
    kekka, cut = hakaru(p)
    print(u"\n%s で、台本4本(切り替わり %d か所)を計算した結果\n" % (os.path.basename(p), cut))
    print(u"  %-26s %8s %8s %7s" % (u"", u"いまの設定", u"本人の実測", u"ちがい"))
    warui = 0
    for k in (u"切り替わりの間隔(まんなか)", u"パッと切る(2コマ以内)",
              u"はっきり溶かす(5コマ以上)", u"一瞬暗くなる", u"効果音が鳴る",
              u"効果音のずれ"):
        a, b = kekka[k], HONNIN[k]
        tan = u"秒" if u"間隔" in k or u"ずれ" in k else u"%"
        sa = a - b
        # 秒のものは0.05秒、割合は8ポイントまで許す
        yurusu = 0.05 if tan == u"秒" else 8.0
        ok = abs(sa) <= yurusu
        # 切り替わりの間隔は 演出.txt ではなく字幕の切り方で決まるので、
        # ここでは知らせるだけにして、合否には数えない。
        if k != u"切り替わりの間隔(まんなか)":
            warui += not ok
        shirushi = u"○" if ok else (u"…" if k == u"切り替わりの間隔(まんなか)" else u"×")
        print(u"  %s %-24s %7.2f%s %7.2f%s %+7.2f"
              % (shirushi, k, a, tan, b, tan, sa))
    print(u"\n%s" % (u"合っています。" if not warui else u"%d つ離れています。" % warui))
    return 1 if warui else 0


if __name__ == "__main__":
    sys.exit(main())
