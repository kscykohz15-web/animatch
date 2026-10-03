# -*- coding: utf-8 -*-
u"""できあがった動画を、あとから機械に採点させる道具。

    python miru_kekka.py

動画を作ると 確認用\一覧.txt（何秒に どの絵で 何をしゃべったか）が出ます。
この道具は、その一覧と 画像カタログ.txt を突き合わせて、
「この絵はセリフと合っていない」という場所だけを拾い出します。

できあがるのは 採点.txt の1枚だけ。
それをこちらに貼ってもらえれば、動画を見なくても直す場所が分かります。

■ 使い方
    python miru_kekka.py                      … いつもの場所を自動で探す
    python miru_kekka.py --ichiran 確認用\一覧.txt
    python miru_kekka.py --plan 画像プラン_老デウス.txt

■ 何を見ているか
    ① 同じ絵の使いすぎ      3回以上でたら印
    ② 話数ちがい            @@話数 に無いフォルダの絵
    ③ 人ちがい              セリフの人名が、絵の説明に無い
    ④ 手がかりなし          セリフと絵の説明に共通の言葉がゼロ
    ⑤ 使用不可              出してはいけない絵が混ざっていないか
"""
from __future__ import print_function
import argparse
import io
import os
import re
import sys
import codecs

if sys.version_info[0] >= 3:
    unicode = str

# 画面に出せない字があっても、けっして落ちないようにする。
# PowerShell から結果を受け取る形で呼ばれると、画面の文字コードが
# cp932 になり、罫線などの字で止まってしまうため。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def say(s):
    try:
        print(s)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        try:
            print(s.encode(enc, "replace").decode(enc, "replace"))
        except Exception:
            print(s.encode("ascii", "replace").decode("ascii", "replace"))
    except Exception:
        pass


LOG = []


def note(s):
    u"""採点の本文。ためておいて、最後にファイルへ書く。

    画面に出すのは、ファイルを書き終えたあと。
    こうしておけば、画面の文字コードで転んでも 採点.txt は必ず残る。
    """
    LOG.append(s)


def yomu(path):
    u"""BOM付きUTF-8もそのまま読む。"""
    with io.open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        return f.read()


CHARACTERS = [
    u"ルーデウス", u"ロキシー", u"エリス", u"シルフィエット", u"シルフィ",
    u"フィッツ", u"パウロ", u"ゼニス", u"リーリャ", u"アイシャ", u"ノルン",
    u"ルイジェルド", u"ギレーヌ", u"ナナホシ", u"ザノバ", u"クリフ",
    u"エリナリーゼ", u"ヒトガミ", u"オルステッド", u"アリエル", u"ルーク",
    u"キシリカ", u"ドワーフ", u"老デウス", u"ジュリ",
]
# 「老デウス」は絵の中では「老人」として写る。人ちがい判定では特別扱いする。
IIKAE = {
    u"老デウス": [u"老人", u"ルーデウス"],
    # 老デウスは年をとったルーデウス本人なので、どちらの絵でも間違いではない。
    u"ルーデウス": [u"老デウス", u"老人"],
    u"シルフィ": [u"シルフィエット"],
    u"フィッツ": [u"シルフィエット"],
    u"シルフィエット": [u"フィッツ"],
}

# セリフの言葉と、絵につく言葉のつなぎ。
# 「日記」と書いてあっても、絵には「本」としか書かれていない。
DOUGI = {
    u"日記": [u"本"],
    u"手紙": [u"本", u"手紙"],
    u"自室": [u"室内"],
    u"部屋": [u"室内"],
    u"家": [u"室内"],
    u"病": [u"悲しい", u"室内"],
    u"墓": [u"墓", u"悲しい"],
    u"クーデター": [u"戦闘", u"城"],
    u"炎": [u"魔法", u"戦闘", u"火"],
    u"魔法": [u"魔法", u"戦闘", u"本", u"室内"],
    u"研究": [u"本", u"室内"],
    u"焼き": [u"魔法", u"戦闘"],
    u"本": [u"本", u"室内"],
    u"王国": [u"城"],
    u"都": [u"街", u"城"],
}

# セリフと絵をつなぐ「手がかりになる言葉」。ここに無い言葉は数えない。
TEGAKARI = [
    u"夜", u"朝", u"昼", u"夕方", u"雨", u"雪", u"空", u"森", u"海", u"川",
    u"室内", u"屋外", u"街", u"村", u"城", u"家", u"部屋", u"宿",
    u"迷宮", u"洞窟", u"戦闘", u"剣", u"槍", u"魔法", u"杖", u"鎧", u"馬車",
    u"本", u"手紙", u"日記", u"食事", u"笑顔", u"涙", u"悲しい", u"驚き",
    u"会話", u"アップ", u"子供", u"大人", u"老人", u"赤ちゃん",
    u"結婚", u"家族", u"墓", u"血", u"炎", u"火", u"光る目", u"転移",
]


def load_person_rules(path):
    """人物ルール.txt を読む。  名前 <タブ> 必要なタグ"""
    out = []
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith(u"#") or u"\t" not in s:
            continue
        name, cond = s.split(u"\t", 1)
        name = name.strip()
        # 頭に - を付けると「その名前を取り消す」規則になる。
        # カタログに書き込まれてしまった誤りを、見直さずに消すため。
        kesu = name.startswith(u"-")
        if kesu:
            name = name[1:].strip()
        need, deny, anyof = [], [], []
        for w in cond.split():
            if w.startswith(u"!"):
                deny.append(w[1:])
            elif u"|" in w:
                anyof.append([x for x in w.split(u"|") if x])
            else:
                need.append(w)
        if name and (need or anyof):
            out.append((name, need, deny, anyof, kesu))
    return out


def apply_person_rules(tags, rules):
    """見た目のタグから人物名を足す。

    絵を見直さずに人物の判定をやり直せるようにするための仕組み。
    画像カタログ.txt には髪の色や年齢がそのまま入っているので、
    人物ルール.txt を直すだけで、1万枚の判定がやり直せる。
    """
    if not rules:
        return tags
    tsuita, keshita = 0, 0
    for k in tags:
        words = tags[k].split()
        w = set(words)
        add, rm = [], set()
        for name, need, deny, anyof, kesu in rules:
            if any(x not in w for x in need):
                continue
            if any(x in w for x in deny):
                continue
            if any(not (set(g) & w) for g in anyof):
                continue
            if kesu:
                rm.add(name)
            elif name not in w and name not in add:
                add.append(name)
        if rm:
            n0 = len(words)
            words = [x for x in words if x not in rm]
            if len(words) != n0:
                keshita += 1
            add = [x for x in add if x not in rm]
        if add:
            # 同じ絵に何人も付くと絞り込めないので、先頭2人まで
            words = add[:2] + words
            tsuita += 1
        tags[k] = u" ".join(words)
    if tsuita:
        say(u"人物ルール: %d枚に名前を付けました" % tsuita)
    if keshita:
        say(u"人物ルール: %d枚から、合わない名前を外しました" % keshita)
    return tags


def load_catalog(path):
    u"""目印 -> 説明 の辞書。"""
    tags = {}
    for line in yomu(path).split(u"\n"):
        line = line.rstrip(u"\r")
        if not line or line.lstrip().startswith(u"#"):
            continue
        if u"\t" not in line:
            continue
        k, v = line.split(u"\t", 1)
        tags[k.strip()] = v.strip()
    # 画像プランと同じ目で見るため、人物ルール.txt をここでも当てる。
    # （当てないと「絵に誰もいない」と誤って報告してしまう）
    rules = load_person_rules(u"人物ルール.txt")
    if rules:
        say(u"人物ルール.txt を %d行 使います" % len(rules))
    return apply_person_rules(tags, rules)


def cat_lookup(tags, name):
    u"""一覧.txt の「フォルダ/001_xxxx.jpg」から、カタログの説明を引く。

    カタログの目印は「無職転生 第1話/001_」のように後ろが切れていることが
    あるので、前方一致でも探す。
    """
    if name in tags:
        return tags[name]
    base = name
    # 拡張子を外した形でも試す
    stem = re.sub(u"\\.(jpg|jpeg|png|webp)$", u"", base, flags=re.I)
    if stem in tags:
        return tags[stem]
    # 前方一致（カタログ側の目印が短い）
    for k in tags:
        if stem.startswith(k) or k.startswith(stem):
            return tags[k]
    return None


JIKOKU = [u""]


def load_ichiran(path):
    u"""番号 開始 尺 画像 セリフ の表を読む。"""
    hashira = {}      # 見出しの行から覚える「どの列が何か」
    rows = []
    for line in yomu(path).split(u"\n"):
        line = line.rstrip(u"\r")
        if not line:
            continue
        if line.startswith(u"# 時刻表の作り方:"):
            JIKOKU[0] = line.split(u":", 1)[1].strip()
            continue
        if line.startswith(u"#"):
            continue
        parts = line.split(u"\t")
        if len(parts) < 5:
            continue
        if parts[0].strip() in (u"番号",):
            # 見出しの行から、どの列が何かを覚える。
            # 列を足したときに、位置決め打ちだと黙って別の列を読みます
            # （「絵の話数」を足したとき、セリフの代わりに話数を読みかけた）。
            for i2, nm in enumerate(parts):
                hashira[nm.strip()] = i2
            continue
        def hiku(nm, kitei):
            i2 = hashira.get(nm, kitei)
            return parts[i2] if i2 < len(parts) else u""
        no, hajime, shaku = parts[0], parts[1], parts[2]
        gazou = hiku(u"画像", 3)
        serifu = hiku(u"セリフ", len(parts) - 1)
        daihon = hiku(u"台本の話数", -1)
        try:
            shaku_f = float(shaku)
        except ValueError:
            continue
        rows.append({
            u"no": no.strip(),
            u"start": hajime.strip(),
            u"sec": shaku_f,
            u"img": gazou.strip(),
            u"text": serifu.strip(),
            u"daihon": [x.strip() for x in daihon.split(u"/") if x.strip()],
        })
    return rows


def load_plan_tebiki(path):
    u"""画像プランにファイル名で直接書かれた絵を集める。

    それは人が見て選んだ絵なので、話数ちがい・使用不可で責めない。
    """
    out = set()
    if not path or not os.path.exists(path):
        return out
    for line in yomu(path).split(u"\n"):
        line = line.strip()
        if not line or line.startswith(u"#") or line.startswith(u"@@"):
            continue
        if u"\t" not in line:
            continue
        for f in line.split(u"\t", 1)[1].split(u","):
            f = f.strip()
            if f and not f.startswith(u"#") and not f.startswith(u"@"):
                out.add(f)
    return out


def load_plan_episodes(path):
    u"""画像プランの @@話数 行から、使ってよいフォルダを拾う。"""
    if not path or not os.path.exists(path):
        return []
    for line in yomu(path).split(u"\n"):
        line = line.strip()
        if line.startswith(u"@@話数"):
            rest = line.split(u"\t", 1)
            if len(rest) < 2:
                rest = line.split(None, 1)
            if len(rest) < 2:
                continue
            return [x.strip() for x in rest[1].split(u",") if x.strip()]
    return []


def folder_of(img):
    if u"/" in img:
        return img.rsplit(u"/", 1)[0]
    if u"\\" in img:
        return img.rsplit(u"\\", 1)[0]
    return u""


def is_zuhyou(img):
    base = img.rsplit(u"/", 1)[-1].rsplit(u"\\", 1)[-1]
    return base.startswith(u"図_") or base.startswith(u"図表_")


def chars_in(text):
    out = []
    for c in CHARACTERS:
        if c in text and c not in out:
            out.append(c)
    # シルフィエット を拾ったら シルフィ は重複なので落とす
    if u"シルフィエット" in out and u"シルフィ" in out:
        out.remove(u"シルフィ")
    return out


def tegakari_in(text):
    out = [w for w in TEGAKARI if w in text]
    for k in DOUGI:
        if k in text and k not in out:
            out.append(k)
    return out


# 時間帯の言葉。絵に時間帯が1つも書かれていないときは、
# 「合っていない」ではなく「分からない」なので、責めない。
JIKAN = [u"夜", u"朝", u"昼", u"夕方"]


def tegakari_ok(w, tags):
    u"""セリフの手がかり w が、絵の説明(tags)で満たされているか。"""
    if w in tags:
        return True
    if w in JIKAN and not any(x in tags for x in JIKAN):
        return True                       # 絵に時間帯の記載が無い
    return any(x in tags for x in DOUGI.get(w, []))


def youi(path):
    u"""書き出し先のフォルダが無ければ作る。"""
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        try:
            os.makedirs(d)
        except OSError:
            pass
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ichiran", default=None, help=u"確認用/一覧.txt")
    ap.add_argument("--catalog", default=u"画像カタログ.txt")
    ap.add_argument("--plan", default=None, help=u"画像プラン_*.txt")
    ap.add_argument("--out", default=os.path.join(u"確認用", u"採点.txt"))
    ap.add_argument("--kurikaeshi", type=int, default=3, help=u"何回以上で使いすぎとするか")
    a = ap.parse_args()

    # ---- 一覧.txt を探す
    ich = a.ichiran
    if not ich:
        for c in [os.path.join(u"確認用", u"一覧.txt"), u"一覧.txt",
                  os.path.join(u"動画", u"分割版", u"一覧.txt"),
                  os.path.join(u"出力", u"確認用", u"一覧.txt")]:
            if os.path.exists(c):
                ich = c
                break
    if not ich or not os.path.exists(ich):
        say(u"× 一覧.txt が見つかりません。")
        say(u"  動画を作るとき「2 動画 + 1枚ずつの確認用」を選ぶと出ます。")
        say(u"  場所が違うときは  --ichiran <パス>  で教えてください。")
        return 1

    if not os.path.exists(a.catalog):
        say(u"× %s が見つかりません。" % a.catalog)
        return 1

    # ---- プランを探す
    plan = a.plan
    if not plan:
        cands = [f for f in os.listdir(u".") if f.startswith(u"画像プラン") and f.endswith(u".txt")
                 and u"旧" not in f]
        if cands:
            plan = sorted(cands)[0]

    rows = load_ichiran(ich)
    tags = load_catalog(a.catalog)
    kyoka = load_plan_episodes(plan)
    tebiki = load_plan_tebiki(plan)

    note(u"=== 動画の採点 ===")
    note(u"一覧      : %s  (%d か所)" % (ich, len(rows)))
    note(u"カタログ  : %s  (%d枚ぶんの説明)" % (a.catalog, len(tags)))
    note(u"プラン    : %s" % (plan or u"（無し）"))
    if JIKOKU[0]:
        note(u"時刻表    : %s" % JIKOKU[0])
        if JIKOKU[0].startswith(u"③"):
            note(u"")
            note(u"  ⚠⚠ 字幕と音声がずれています。絵の問題ではありません。")
            note(u"     台本を直したのに音声が古いままです。1 で音声を作り直してください。")
            note(u"")
    if tebiki:
        note(u"手で選んだ絵: %d枚 （採点の対象から外します）" % len(tebiki))
    if kyoka:
        note(u"使ってよい話数: %s" % u", ".join(kyoka))
    note(u"")

    if not rows:
        say(u"× 一覧.txt の中身が読めませんでした。")
        return 1

    # ---- ① 同じ絵の使いすぎ
    tsukai = {}
    for r in rows:
        tsukai.setdefault(r[u"img"], []).append(r[u"no"])
    sugi = [(len(v), k, v) for k, v in tsukai.items() if len(v) >= a.kurikaeshi]
    sugi.sort(reverse=True)

    # ---- 1か所ずつ調べる
    # 対象話数の中に、その人の絵が1枚でもあるか。
    nai_hito = set()
    nai_tsukatta = {}
    if kyoka:
        aru = set()
        for k, d in tags.items():
            fol = folder_of(k)
            if fol and fol in kyoka:
                for c in CHARACTERS:
                    if c in d:
                        aru.add(c)
        for c in CHARACTERS:
            if c not in aru:
                nai_hito.add(c)

    warui = []      # (重さ, 番号, 種類, 説明)
    mikoshi = []    # 絵で表せる言葉が無いセリフ
    nashi = 0       # カタログに無い
    for r in rows:
        img = r[u"img"]
        tx = r[u"text"]
        # 章タイトルのカード(@@card00 など)は、こちらが作った絵なので採点しない。
        # カタログに載っているはずがなく、11か所ぜんぶ「説明がありません」と
        # 出て、直しようのない指摘で埋まっていた。
        if img.startswith(u"@@"):
            continue
        desc = cat_lookup(tags, img) if not is_zuhyou(img) else u"（図表スライド）"
        riyuu = []
        omosa = 0

        if desc is None:
            nashi += 1
            riyuu.append(u"カタログにこの絵の説明がありません")
            omosa += 2
            desc = u""

        # 画像プランにファイル名で直接書いた絵は、人が選んだもの。
        # 話数や使用不可で責めない（本人の指定が上）。
        erabi = img in tebiki

        # ⑤ 使用不可
        if u"使用不可" in desc.split() and not erabi:
            riyuu.append(u"【使用不可】の絵が出てしまっています")
            omosa += 10

        # ② 話数ちがい
        #
        # その行の章が「アニメの何話か」で見る。一覧.txt の「台本の話数」の列。
        # 前は画像プランのいちばん最初の @@話数 だけを「使ってよい話数」として
        # 全行に当てていた。章ごとに話数を変えるようにしたとたん、
        # 2話目以降の章が全部ちがい扱いになり、170か所・39点になった。
        # （実際に台本と食いちがっていたのは 278行のうち14行だけ）
        yurusu = r.get(u"daihon") or kyoka
        fol = folder_of(img)
        if yurusu and fol and not is_zuhyou(img) and not erabi:
            if fol not in yurusu:
                riyuu.append(u"話数ちがい（この章は %s の話）" % u" / ".join(yurusu))
                omosa += 6

        # ③ 人ちがい
        hito = chars_in(tx)
        if hito and desc and not is_zuhyou(img) and not erabi:
            w = set(desc.split())
            atta = []
            for c in hito:
                kouho = [c] + IIKAE.get(c, [])
                if any(x in w for x in kouho):
                    atta.append(c)
            if not atta:
                # 対象話数に1枚も絵が無い人は、責めても直しようがない。
                inai = [c for c in hito if c in nai_hito]
                hokano = [c for c in CHARACTERS if c in w]
                if len(inai) == len(hito):
                    for c in inai:
                        nai_tsukatta.setdefault(c, []).append(r[u"no"])
                elif hokano:
                    riyuu.append(u"人ちがい: セリフは【%s】／絵は【%s】"
                                 % (u"・".join(hito), u"・".join(hokano[:3])))
                    omosa += 8
                else:
                    riyuu.append(u"人ちがい: セリフは【%s】／絵にその人はいません"
                                 % u"・".join(hito))
                    omosa += 5

        # ④ 情景ちがい / 手がかりなし
        muchi = False
        if desc and not is_zuhyou(img) and not riyuu and not erabi:
            w = set(desc.split())
            mochi = tegakari_in(tx)          # セリフ側にある「絵で表せる言葉」
            kyoutsuu = [x for x in mochi if tegakari_ok(x, w)]
            if hito:
                pass                          # 人が合っているならそれでよい
            elif mochi and not kyoutsuu:
                riyuu.append(u"情景ちがい: セリフは【%s】／絵は【%s】"
                             % (u"・".join(mochi[:4]),
                                u"・".join([x for x in TEGAKARI if x in w][:4]) or u"不明"))
                omosa += 4
            elif not mochi:
                # 絵で表せる言葉が1つも無いセリフ。割り当ての失敗ではない。
                # ここは話数さえ合っていればよく、直すなら台本かプラン。
                muchi = True

        # ① 使いすぎ（印だけ。重さは軽く）
        n = len(tsukai.get(img, []))
        if n >= a.kurikaeshi:
            riyuu.append(u"同じ絵を%d回使っています" % n)
            omosa += 1

        if muchi:
            mikoshi.append(r)
        if riyuu:
            warui.append((omosa, r, riyuu, desc))

    # ---- まとめ
    warui.sort(key=lambda x: (-x[0], x[1][u"no"]))
    ten = 100
    if rows:
        warui_n = len([x for x in warui if x[0] >= 3])
        ten = int(round(100.0 * (len(rows) - warui_n) / len(rows)))
    hidoi = [x for x in warui if x[0] >= 5]
    chuu = [x for x in warui if 3 <= x[0] < 5]
    note(u"── 結果 ──")
    note(u"ちゃんと合っていそう     : %d か所" % (len(rows) - len(warui)))
    note(u"ひどい (人・話数ちがい)  : %d か所" % len(hidoi))
    note(u"中くらい (情景ちがい)    : %d か所" % len(chuu))
    note(u"使いすぎだけ             : %d か所" % (len(warui) - len(hidoi) - len(chuu)))
    note(u"絵で表せる言葉が無い     : %d か所 （台本しだい。割り当ての失敗ではない）"
         % len(mikoshi))
    note(u"おおよその点数           : %d 点 / 100" % ten)
    if nashi:
        note(u"※ カタログに説明が無い絵が %d か所ありました（採点できていません）" % nashi)
    note(u"")

    if sugi:
        note(u"── ① 同じ絵の使いすぎ（%d回以上） ──" % a.kurikaeshi)
        for n, k, v in sugi[:20]:
            note(u"  %2d回  %s" % (n, k))
            note(u"        番号: %s" % u", ".join(v))
        note(u"")

    if nai_tsukatta:
        note(u"── 対象話数に絵が無い人 ──")
        note(u"（この人たちは、今回の話数には一度も写っていません。")
        note(u"  別の話数を許すか、図表に置きかえるか、台本から外すかの 3つです）")
        for c in sorted(nai_tsukatta):
            note(u"  %-10s 番号: %s" % (c, u", ".join(nai_tsukatta[c])))
        note(u"")

    if mikoshi:
        note(u"── 絵で表せる言葉が無いセリフ ──")
        note(u"（人の名前も、場所や時間の言葉も入っていない所。"
             u"ここは話数さえ合っていれば大きな失敗にはなりません）")
        note(u"  番号: %s" % u", ".join(r[u"no"] for r in mikoshi))
        note(u"")

    note(u"── あやしい場所（ひどい順） ──")
    if not warui:
        note(u"  ありません。")
    for omosa, r, riyuu, desc in warui:
        note(u"[%s] %s  %.2f秒  (重さ%d)" % (r[u"no"], r[u"start"], r[u"sec"], omosa))
        note(u"  セリフ: %s" % r[u"text"])
        note(u"  絵    : %s" % r[u"img"])
        note(u"  絵の中: %s" % (desc if desc else u"（不明）"))
        for x in riyuu:
            note(u"  → %s" % x)
        note(u"")

    # ---- 直し方の下ごしらえ（そのままプランに貼れる形）
    note(u"── そのまま 画像プラン に貼れる下書き ──")
    note(u"# ↓ここから下を 画像プラン_*.txt の @@話数 のすぐ下に貼ると、")
    note(u"#   その場所だけ絵を指定し直せます（絵は自分で選び直してください）")
    dashita = set()
    for omosa, r, riyuu, desc in warui:
        if omosa < 5:
            continue
        atama = r[u"text"]
        atama = re.split(u"[、。！？]", atama)[0]
        atama = atama[:18]
        if not atama or atama in dashita:
            continue
        dashita.add(atama)
        hito = chars_in(r[u"text"])
        if hito:
            c = hito[0]
            sagashi = IIKAE.get(c, [c])[0]
            note(u"%s\t#%s, #%s" % (atama, sagashi, c))
        else:
            note(u"%s\t#" % atama)
    note(u"")
    note(u"=== ここまで ===")

    with io.open(youi(a.out), "w", encoding="utf-8") as f:
        f.write(u"\n".join(LOG))
        f.write(u"\n")
    # ここまで来ればファイルは残っている。画面表示は、落ちても構わない。
    for line in LOG:
        say(line)
    say(u"")
    say(u"-> %s に書き出しました。このファイルを貼ってください。" % a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
