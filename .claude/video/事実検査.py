# -*- coding: utf-8 -*-
u"""台本の「続編のところ」と「言い方」が事実と合っているかを見る（2周目の添削）。

    python3 -I 事実検査.py <台本_字幕用.txt> ...

■ なぜ要るか（2026-11-08・本人の添削）
  `放送情報検査.py` は**第一期の**年・季・話数・制作・原作しか見ていなかった。
  だから次の4つが黙って通っていた：
    ・100カノ … 台本「第二期まで」／本当は**第三期まで**（2026年夏）
    ・僕ヤバ  … 台本「第二期まで」／本当は**劇場版が公開され、第三期も決定**
    ・着せ恋  … 第二期の年が書いていない（2025年夏）
    ・かぐや様 … 台本「第三期と劇場版まで」／**劇場版は公開されていない**
                （「ファーストキッスは終わらない」はテレビスペシャル。
                  劇場での先行上映はあったが、劇場版ではない）
  **「放送情報.txt にある＝確かめた」ではない。確かめていたのは第一期だけだった。**

■ 見るもの（×は落とす／!は注意）
  × ② 劇場版   … 「劇場版」と書いているのに、**公開済みの**劇場版が無い
                 （年が ？ のもの、これから公開のものは数えない。
                   かぐや様の「完結編」はまだ公開されていない）
  × ③ 言い方   … 劇場版を「放送」と書いている（劇場版は「公開」）
  × ④ 完結済み … 「完結済み」と書いているのに続きがある
  × ⑤ 置き忘れ … 「第N期まで」と言っているのに、**題名に第(N+1)期がある**
                 （100カノが第二期までのままだった）。期の数は数えない ──
                 分割クールもテレビスペシャルも TV に数えられるので、
                 数えると偽の落ちしか出ない。題名で見れば当たる
  ! ⑥ 総集編   … その劇場版は総集編（SUMMARY）。「新作」のように書いていないか
  ! ⑦ 最上級   … 「いちばん新しい」に「今回ご紹介する」などの限定が付いているか
  × ⑧ 並び順   … 「古い順に並べてあります」と言っているのに古い順でない
  × ⑨ つなぎ   … 「翌年」「同じ年」「N年あいて」が放送情報と合っていない
  × ⑩ いちばん  … 同じ**軸**の「いちばん」を二作品が名乗っている
                 （どちらかが嘘になる。軸は「いちばん」の前にある）

  **「第N期まで」と TVの本数 は引き算しない。** 分割クールが別の1本に
  数えられるので（Re:ゼロは TV 7本）、偽の落ちしか出なかった。
  代わりに⑤で「あとに出たもの」を出し、人が読む。

■ 機械で見られないもの
  人物の立場・あらすじの中身は、ここでは見られない。
  最後に「目で見る所」として作品名を並べるので、そこは人が読む。
"""
import io
import os
import re
import sys

V = os.path.join(os.path.dirname(os.path.abspath(__file__)), u"")
ZOKU = V + u"続編情報.txt"
HOSO = V + u"放送情報.txt"

KISETSU = {u"冬": 1, u"春": 2, u"夏": 3, u"秋": 4}

TSUNAGI = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")

KANSUJI = {u"一": 1, u"二": 2, u"三": 3, u"四": 4, u"五": 5,
           u"六": 6, u"七": 7, u"八": 8, u"九": 9, u"十": 10}


def say(m):
    try:
        print(m)
    except Exception:
        print(m.encode("utf-8", "replace"))


def yomu_zokuhen():
    out = {}
    if not os.path.isfile(ZOKU):
        return out
    for ln in io.open(ZOKU, encoding="utf-8-sig"):
        t = ln.rstrip(u"\n").replace(u"\r", u"")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) < 3:
            continue
        try:
            tv = int(c[1])
        except ValueError:
            continue
        hon = []
        for x in c[2].split(u"｜"):
            y = x.split(u":")
            if len(y) >= 5:
                hon.append({u"形式": y[0], u"時": y[1], u"話": y[2],
                            u"続柄": y[3], u"題": u":".join(y[4:])})
            elif len(y) >= 4:   # 古い書式（続柄なし）
                hon.append({u"形式": y[0], u"時": y[1], u"話": y[2],
                            u"続柄": u"－", u"題": u":".join(y[3:])})
        out[c[0]] = {u"tv": tv, u"本": hon}
    return out


def yomu_hoso():
    u"""作品名 → (年, 季)。並び順とつなぎの年を見るため。"""
    out = {}
    if not os.path.isfile(HOSO):
        return out
    for ln in io.open(HOSO, encoding="utf-8-sig"):
        t = ln.rstrip(u"\n").replace(u"\r", u"")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 4:
            out[c[0]] = (c[1], c[2])
    return out


# ■ 説明の流れが変わった（2026-11-10・本人の指定）
#
#   前  最初にご紹介する作品は、ニセコイ
#       本作は2014年の冬に放送された全20話の作品で、第二期まで放送されています。
#       制作はシャフト、週刊少年ジャンプ連載の漫画が原作となっています。
#
#   後  最初にご紹介する作品は、ニセコイ、制作はシャフト。
#       本作は週刊少年ジャンプ連載の漫画が原作となっており、2014年の冬に
#       放送が開始された全20話の作品です。第二期まで放送されています。
#
#   **制作会社が作品名の行へ移った。** 作品名を取るときは、うしろの
#   「、制作は◯◯。」を外す。外さないと作品名が
#   「ニセコイ、制作はシャフト。」になって、どの表にも当たらない。
def sakuhinmei(t):
    u"""作品名の行から、作品名だけを取る。"""
    return re.sub(u"、制作は[^、。]*。?$", u"", t.strip()).strip()


def dan(path):
    return [x.strip() for x in
            io.open(path, encoding="utf-8-sig").read().replace("\r\n", "\n").split("\n")
            if x.strip()]


KOTOSHI = 2026


IMA = (2026, 11)          # いまの年と月。年が変わったら直す


def deta_ka(t):
    u"""「2026秋」がもう始まっているか。冬=1月・春=4月・夏=7月・秋=10月。"""
    y = toshi(t)
    if not y:
        return False
    tsuki = {u"冬": 1, u"春": 4, u"夏": 7, u"秋": 10}
    m = 1
    for k, v in tsuki.items():
        if k in t:
            m = v
    return (y, m) <= IMA


def toshi(t):
    u"""「2025夏」→2025。「？」→None。"""
    m = re.match(u"(19|20)[0-9]{2}", t or u"")
    return int(m.group(0)) if m else None


def hoso_hiku(hoso, na):
    if na in hoso:
        return hoso[na]
    k = [x for x in hoso if na.startswith(x) or x.startswith(na)]
    return hoso[k[0]] if len(k) == 1 else (u"？", u"？")


def saidai_ki(h):
    u"""台本が触れている期のうち、いちばん大きいもの。"""
    saidai = 0
    for m in re.finditer(u"第([一二三四五六七八九十0-9]+)期", h):
        t = m.group(1)
        n = int(t) if t.isdigit() else KANSUJI.get(t, 0)
        saidai = max(saidai, n)
    return saidai


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        say(u"使い方: python 事実検査.py <台本_字幕用.txt> ...")
        return 1
    zoku = yomu_zokuhen()
    hoso = yomu_hoso()
    if not zoku:
        say(u"続編情報.txt がありません。先に 続編を引く.py を回してください。")
        return 1

    ochita = 0
    for path in sys.argv[1:]:
        if path.startswith(u"--"):
            continue
        p = dan(path)
        warui, chui, me = [], [], []
        mita = 0
        for i, x in enumerate(p):
            m = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
            if not m:
                continue
            na = sakuhinmei(m.group(1))
            if i + 1 >= len(p) or not p[i + 1].startswith(u"本作は"):
                continue
            h = p[i + 1]
            mita += 1
            me.append(na)

            key = na if na in zoku else None
            if key is None:
                kouho = [k for k in zoku if na.startswith(k) or k.startswith(na)]
                key = kouho[0] if len(kouho) == 1 else None
            if key is None:
                chui.append(u"%s … 続編情報.txt に行がありません（引けていない）" % na)
                continue
            z = zoku[key]
            eiga = [b for b in z[u"本"] if b[u"形式"] == u"MOVIE"]
            tv = z[u"tv"]

            iu_eiga = bool(re.search(u"劇場版|映画", h))

            # ③ 劇場版を「放送」と書いていないか
            if re.search(u"(劇場版|映画)(も|まで|が|は)?[^。]{0,8}放送", h):
                warui.append(u"%s … 劇場版を「放送」と書いています（劇場版は「公開」）" % na)

            # ② 劇場版があると書いているのに、公開済みのものが無い
            deta_eiga = [b for b in eiga if toshi(b[u"時"]) and toshi(b[u"時"]) <= KOTOSHI]
            if iu_eiga and not deta_eiga:
                mada = u"／".join(u"%s %s" % (b[u"形式"], b[u"時"]) for b in eiga)
                naka = u"／".join(u"%s %s" % (b[u"形式"], b[u"時"]) for b in z[u"本"][1:]) or u"なし"
                warui.append(u"%s … 「劇場版」と書いていますが、公開済みの劇場版はありません"
                             u"（%s／第一期のあと: %s）"
                             % (na, u"まだ公開されていない劇場版: " + mada if mada else u"劇場版そのものが無い",
                                naka))

            # ここから「本編の並び」だけを見る。
            #   続柄が「－」のものが本編（SEQUEL をたどって出てきたもの）。
            #   SIDE_STORY・SPIN_OFF・SUMMARY は本編ではないので、
            #   これを続編と数えると偽の落ちが出る（Angel Beats! の特別篇、
            #   四畳半の「夜は短し歩けよ乙女」、タコピーの総集編で実際に出た）。
            honpen = [b for b in z[u"本"] if b[u"続柄"] == u"－"]

            # ④ 本編の続きがあるのに「完結済み」
            if u"完結済み" in h and len(honpen) > 1:
                naka = u"／".join(u"%s %s %s" % (b[u"形式"], b[u"時"], b[u"題"][:22])
                                 for b in honpen[1:])
                warui.append(u"%s … 「完結済み」と書いていますが本編の続きがあります（%s）"
                             % (na, naka))

            # ⑤ 「第N期まで」と言っているのに、第(N+1)期が出ている
            #    （100カノが「第二期まで」のまま第三期を落としていた）
            #
            #    **期の数は数えない。** 分割クールが別の1本に数えられ（Re:ゼロは
            #    TV 7本）、テレビスペシャルも TV に入るので（かぐや様の
            #    ファーストキッス）、数えると偽の落ちしか出ない。
            #    代わりに**題名の中に次の期があるか**を見る。これは当たる。
            #    また「第一期が放送され、続編も放送されています」は開いた言い方で、
            #    あとに何本出ても嘘にならないので、「◯期まで」だけを見る。
            # いちばん大きい期を取る。「第一期が放送され、…第三期まで」のように
            # 先に第一期が出てくるので、最初の一致を取ると 1 になってしまう
            iu_made = saidai_ki(h) if u"期まで" in h else 0
            if iu_made:
                tsugi = iu_made + 1
                KAN2 = {2: u"二", 3: u"三", 4: u"四", 5: u"五", 6: u"六", 7: u"七"}
                sagasu = [u"第%d期" % tsugi, u"第%s期" % KAN2.get(tsugi, u"？"),
                          u"Season %d" % tsugi, u"Season%d" % tsugi,
                          u"%dnd season" % tsugi, u"%drd season" % tsugi,
                          u"%dth season" % tsugi, u"シーズン%d" % tsugi]
                # まだ放送されていないものは数えない（2027年の第3期を
                # 「落ちている」と言われても、いまは落ちていない）
                deta = [b for b in honpen[1:]
                        if any(x.lower() in b[u"題"].lower() for x in sagasu)
                        and deta_ka(b[u"時"])]
                if deta:
                    warui.append(u"%s … 台本は「第%d期まで」ですが、第%d期が出ています: %s"
                                % (na, iu_made, tsugi,
                                   u"／".join(u"%s %s %s" % (b[u"形式"], b[u"時"], b[u"題"][:26])
                                             for b in deta[:3])))

            # ⑥ 台本が劇場版と言っていて、それが総集編のとき
            if iu_eiga and u"総集編" not in h:
                for b in deta_eiga:
                    if b[u"続柄"] == u"SUMMARY":
                        chui.append(u"%s … その劇場版は総集編です（%s %s）。"
                                    u"「新作」と読めないか見てください"
                                    % (na, b[u"時"], b[u"題"][:24]))

        # ⑩ 同じ軸の「いちばん」を二作品が名乗っていないか
        #   1本の動画で「テンポはこの並びでいちばん速い」が2回出ていた
        #   （To LOVEる と かぐや様・2026-11-09）。どちらかが嘘になる。
        #
        #   ■ 最初は「いちばん」の**後ろ**の語で束ねた。**偽の落ちが8件出た。**
        #     「世界観にはいちばん高い点を付けています」と
        #     「作画はこの並びでいちばん高い点を付けています」が
        #     同じ「いちばん高い点を付けてい」で束ねられた ── 軸が違うので別の話。
        #     **軸は「いちばん」の前にある。** 軸ごとに束ねる。
        JIKU = (u"シナリオ", u"作画", u"世界観", u"心", u"テンポ", u"音楽")
        ichiban = {}
        ima = u""
        for x in p:
            m3 = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
            if m3:
                ima = sakuhinmei(m3.group(1))
                continue
            if not ima:
                continue
            for bun in re.findall(u"[^。]+。", x):
                if u"いちばん" not in bun:
                    continue
                # 「いちばん」の直前 30字の中にある軸を取る。
                # 「〜は平凡ですが」の側の軸は数えない（そちらは最低の話）
                i = bun.index(u"いちばん")
                mae = bun[max(0, i - 30):i]
                mae = re.sub(u".*(平凡ですが|低いほうですが|弱くて平凡ですが)", u"", mae)
                for j in JIKU:
                    if j in mae:
                        ichiban.setdefault(j, set()).add(ima)
        for ko in JIKU:
            dare = sorted(ichiban.get(ko, set()))
            if len(dare) > 1:
                warui.append(u"言い方 … 「%s がいちばん」を %d作品が名乗っています（%s）"
                             % (ko, len(dare), u" / ".join(x[:18] for x in dare)))

        # ⑦ 「いちばん新しい」に限定が付いているか
        for x in p:
            for m in re.finditer(u"[^。]*(いちばん新しい|最も新しい|一番新しい|最新作)[^。]*。", x):
                bun = m.group(0)
                if not re.search(u"今回|この並び|ご紹介する|20作品|この中", bun):
                    chui.append(u"言い方 … 「%s」に限定が付いていません"
                                u"（「今回ご紹介する20作品の中で」を足す）" % bun.strip()[:40])

        # ⑧⑨ 並び順と、つなぎの「翌年」「同じ年」「N年あいて」
        #   ※ 「同じ年に二本並びます」は**次の二本**が同じ年という意味。
        #      前の作品と同じ年、ではない。ここを読み違えて偽の落ちを3件出した
        #      （2026-11-08・台本のほうが正しかった）。
        #   ※ 「同じ夏を何度も繰り返す作品」のような**中身の季節**も拾わない。
        nami = []
        for i, x in enumerate(p):
            m = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
            if m:
                nami.append((sakuhinmei(m.group(1)), x[:m.start()].strip()))
        if u"古い順" in u"".join(p[:8]):
            for i in range(1, len(nami)):
                y1, k1 = hoso_hiku(hoso, nami[i - 1][0])
                y2, k2 = hoso_hiku(hoso, nami[i][0])
                if not (y1.isdigit() and y2.isdigit()):
                    continue
                if (int(y2), KISETSU.get(k2, 0)) < (int(y1), KISETSU.get(k1, 0)):
                    warui.append(u"並び … %s（%s年%s）のあとに %s（%s年%s）が来ています"
                                 u"（古い順と言っているのに）"
                                 % (nami[i - 1][0], y1, k1, nami[i][0], y2, k2))
        for i in range(1, len(nami)):
            na1, _ = nami[i - 1]
            na2, tsu = nami[i]
            y1, _k1 = hoso_hiku(hoso, na1)
            y2, _k2 = hoso_hiku(hoso, na2)
            if not (y1.isdigit() and y2.isdigit()):
                continue
            a1, a2 = int(y1), int(y2)
            if u"翌年" in tsu and a2 != a1 + 1:
                warui.append(u"つなぎ … 「翌年」ですが %s(%s年) → %s(%s年) です"
                             % (na1, y1, na2, y2))
            # 「同じ年に二本」は次の二本の話なので除く
            if re.search(u"同じ年(?!に[一二三四五六七八九0-9]+本)", tsu) and a2 != a1:
                warui.append(u"つなぎ … 「同じ年」ですが %s(%s年) → %s(%s年) です"
                             % (na1, y1, na2, y2))
            m3 = re.search(u"([一二三四五六七八九十]+|[0-9]+)年(?:飛んで|後|あいて|あと)", tsu)
            if m3:
                n = int(m3.group(1)) if m3.group(1).isdigit() else KANSUJI.get(m3.group(1), 0)
                # 季で半年ずれるので1年までは許す（1995秋→2006春を「十年あいて」と
                # 言うのは自然。きっちり引くと11年で落ちた・2026-11-08）
                if n and abs((a2 - a1) - n) > 1:
                    warui.append(u"つなぎ … 「%s年」ですが %s(%s年) → %s(%s年) は %d年です"
                                 % (m3.group(1), na1, y1, na2, y2, a2 - a1))

        na = os.path.basename(path).replace(u"_字幕用_最終版.txt", u"")
        say(u"── %s（作品 %d本）" % (na, mita))
        for w in warui:
            say(u"  × %s" % w)
        for c in chui:
            say(u"  ! %s" % c)
        if not warui:
            say(u"  ○ 続編の言い方は、調べたものと合っています"
                + (u"（注意 %d件）" % len(chui) if chui else u""))
        else:
            ochita += 1
    say(u"")
    say(u"落ちた台本 %d／%d本" % (ochita, len([x for x in sys.argv[1:] if not x.startswith(u"--")])))
    return 1 if ochita else 0


if __name__ == "__main__":
    sys.exit(main())
