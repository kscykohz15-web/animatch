# -*- coding: utf-8 -*-
u"""ずれ実測 ─ 字幕と声がずれていないかを、本人の動画で測る

**作った材料ではなく、本人の音声そのもので測ります。** これが本当の数字です。

■ 完成した動画の音では測れない（2026-10-06 に分かった）

はじめは完成した mp4 から音を取り出して測っていた。ところが

    声の始まり : 16 か所    ← 9分の動画で16か所しか見つからない

**BGM がずっと鳴っているので、無音がほとんど無い。**
そのせいで「102秒ずれている」というでたらめな数字が出た。
（こちらの検査用の材料に BGM を入れていなかったので気づけなかった）

■ いまのやり方

BGM の入っていない `merged.wav`（声だけ）を基準にする。

    ① merged.wav で、声が始まる瞬間をぜんぶ拾う（BGMが無いので正しく出る）
    ② 確認用/一覧.txt の字幕の時刻から、**章カードぶんの無音を引く**
       → merged.wav の中の時刻に戻る
    ③ その時刻に、本当に声の始まりがあるかを見る

章カードは 1枚 1.5秒 の無音なので、そのぶんだけ後ろがずれている。
引き算してから比べれば、カードが何枚あっても正しく測れる。

結果は画面と 確認用/ずれ.txt に残ります。
"""
from __future__ import print_function
import io
import os
import re
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

LEAD = 0.12          # 字幕は声の少し前に出す（設計どおり）
GOUKAKU = 0.45       # これを超えたら知らせる


def ff(args):
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return r.stdout.decode("utf-8", "replace")


def sagasu(*na):
    for n in na:
        if os.path.exists(n):
            return n
    return None


def mmss(t):
    return u"%d:%02d" % (int(t // 60), int(t % 60))


def main():
    koe = sagasu(os.path.join(u"音声", u"merged.wav"), u"merged.wav")
    ich = sagasu(os.path.join(u"確認用", u"一覧.txt"))
    if not koe or not ich:
        print(u"× merged.wav か 確認用/一覧.txt が見つかりません。測れません。")
        return 0
    ffmpeg = u"ffmpeg"

    # ── ① 声が始まる瞬間と、無音の区間（BGMの無い merged.wav で拾う）
    log = ff([ffmpeg, "-hide_banner", "-nostats", "-i", koe,
              "-af", "silencedetect=noise=-35dB:d=0.12", "-f", "null", "-"])
    hajimari = [0.0]
    muon = []                       # (無音の始まり, 無音の終わり)
    st0 = None
    for m in re.finditer(r"silence_(start|end):\s*(-?[0-9.]+)", log):
        if m.group(1) == "start":
            st0 = float(m.group(2))
        elif st0 is not None:
            e0 = float(m.group(2))
            muon.append((st0, e0))
            hajimari.append(e0)
            st0 = None
    hajimari.sort()
    muon.sort()

    def shaberi_chuu(t):
        u"""その時刻は、声の途中か。途中なら「どれだけ入り込んでいるか」を返す。

        ■ なぜこれを見るのか（2026-10-09・本人の言葉から）

        本人はこう言った。
          「喋っている途中で、次の字幕と画像に切り替わる」

        ＝ 切り替わりが**声の真ん中**に落ちている。
        それまでは「いちばん近い声の始まり」との差を測っていたが、
        **近くにたまたま別の声の始まりがあれば小さく出てしまう。**
        数字が小さく出る側に嘘をつく作りだった。

        声の途中かどうかは、取りちがえようがない。
        無音の中に入っていれば ○、声の中に入っていれば ×。
        """
        for (a1, b1) in muon:
            if a1 - 0.02 <= t <= b1 + 0.02:
                return 0.0          # 無音の中。正しい切り替わり
        # 声の中。その声の始まりからどれだけ入り込んでいるか
        mae = [b1 for (a1, b1) in muon if b1 <= t]
        return (t - max(mae)) if mae else t

    # ── ② 一覧.txt を読む。章カードは img が @@ で始まる
    #
    # ■ 開始の列は「0:02」という分:秒。秒の数ではない（2026-10-06）
    #   float() で読もうとして全部が落ち、1枚も比べられていなかった。
    #   列の名前は見出しの行から取る（列が増えても狂わないように）。
    # ■ 時刻は「尺」を足していって作る。開始は秒までしか無いので使えない。
    hashira, rows, t = {}, [], 0.0
    for line in io.open(ich, encoding="utf-8-sig", errors="replace").read() \
            .replace(u"\r\n", u"\n").split(u"\n"):
        if not line.strip() or line.startswith(u"#"):
            continue
        c = line.split(u"\t")
        if c[0].strip() == u"番号":
            for i, nm in enumerate(c):
                hashira[nm.strip()] = i
            continue
        if len(c) < 5:
            continue
        try:
            no, du = int(c[0]), float(c[2])
        except ValueError:
            continue

        def hiku(nm, kitei):
            i = hashira.get(nm, kitei)
            return c[i].strip() if 0 <= i < len(c) else u""
        rows.append((no, t, du, hiku(u"画像", 3), hiku(u"セリフ", len(c) - 1)))
        t += du

    if not rows:
        print(u"× 一覧.txt を読めませんでした。")
        return 0

    # 章カードぶんの無音を引いて、merged.wav の中の時刻に戻す
    mato, card_byou = [], 0.0
    for (no, st, du, img, tx) in rows:
        if img.startswith(u"@@"):
            card_byou += du
            continue
        if not tx:
            continue
        mato.append((st - card_byou + LEAD, st, tx))   # 字幕は声の LEAD 秒前

    # ■ 「いちばん近い声の始まり」で探すのをやめた（2026-10-09）
    #
    # 1枚ずつ独立に近いものを探していた。そのため、
    # **本当は1秒早く出ている字幕でも、たまたま近くに別の声の始まりがあれば
    # 「ずれ小」と出てしまう。** 数字が小さく出る側に嘘をつく作りだった。
    #
    # 字幕も声の始まりも、どちらも時間順に並んでいる。
    # **順番を守って対応づければ**、取りちがえようがない。
    # （検査用の材料では同じ欠陥を背番号で直したが、
    #   本物を測るこちらに残っていた）
    #
    # 1枚うしろへずらすのに罰を置き、全体でいちばん無理のない対応を選ぶ。
    n_s, n_h = len(mato), len(hajimari)
    INF = float("inf")
    # dp[i][j] = 字幕 i までを、声の始まり j までで説明したときの合計
    dp = [[INF] * (n_h + 1) for _ in range(n_s + 1)]
    kara = [[None] * (n_h + 1) for _ in range(n_s + 1)]
    for j in range(n_h + 1):
        dp[0][j] = 0.0
    for i in range(1, n_s + 1):
        moto = mato[i - 1][0]
        for j in range(1, n_h + 1):
            # 声の始まり j-1 を字幕 i に当てる
            v = dp[i - 1][j - 1] + abs(hajimari[j - 1] - moto)
            k = (i - 1, j - 1)
            # 声の始まり j-1 は、どの字幕にも当てない（息継ぎなどで余るぶん）
            if dp[i][j - 1] < v:
                v, k = dp[i][j - 1], (i, j - 1)
            dp[i][j] = v
            kara[i][j] = k
    zure = []
    i, j = n_s, n_h
    while i > 0:
        pi, pj = kara[i][j]
        if pi == i - 1:
            moto, st, tx = mato[i - 1]
            c = hajimari[j - 1]
            zure.append((abs(c - moto), st, moto, c, tx))
        i, j = pi, pj

    n = len(zure)
    if not n:
        print(u"× 比べられる字幕がありませんでした。")
        return 0

    # ── 測れているかどうか、まず自分で確かめる
    #
    # 声の始まりが字幕の数よりずっと少ないときは、拾えていない。
    # **測れていないのに数字を出すほうが、害が大きい。**
    print(u"声だけの音声   : %s" % koe)
    print(u"声の始まり     : %d か所" % len(hajimari))
    print(u"比べた字幕     : %d枚" % n)
    if len(hajimari) < n * 0.5:
        print(u"")
        print(u"⚠ 声の始まりが少なすぎて、正しく測れていません。")
        print(u"   （無音がほとんど無い音声か、音量が小さすぎる可能性）")
        print(u"   この数字は当てになりません。チャットでご相談ください。")
        return 0

    zure.sort(reverse=True)
    heikin = sum(z[0] for z in zure) / n
    waru = [z for z in zure if z[0] > GOUKAKU]
    print(u"いちばん大きいずれ : %.2f秒" % zure[0][0])
    print(u"平均のずれ         : %.2f秒" % heikin)
    print(u"%.2f秒を超えたもの : %d枚 (%.0f%%)"
          % (GOUKAKU, len(waru), 100.0 * len(waru) / n))

    # ── 声の途中で切り替わっていないか（本人が見ているのはこれ）
    naka = []
    for (d, st, moto, c, tx) in zure:
        fukasa = shaberi_chuu(moto)
        if fukasa > 0.15:
            naka.append((fukasa, st, tx))
    naka.sort(reverse=True)
    print(u"")
    if naka:
        print(u"⚠ 声の途中で切り替わっている字幕 : %d枚 / %d枚 (%.0f%%)"
              % (len(naka), n, 100.0 * len(naka) / n))
        print(u"   （喋っている最中に次の字幕と絵へ変わります）")
        for (f, st, tx) in naka[:12]:
            print(u"   %s  声の %.2f秒 中で切り替え   %s" % (mmss(st), f, tx[:26]))
    else:
        print(u"○ 切り替わりはすべて、声の切れ目（無音）で起きています")

    gyou = [u"# 字幕と声のずれ（BGMの無い merged.wav を基準に測ったもの）",
            u"# 章カードぶんの無音は引いてあります。",
            u"",
            u"いちばん大きいずれ\t%.2f秒" % zure[0][0],
            u"平均のずれ\t%.2f秒" % heikin,
            u"%.2f秒を超えたもの\t%d枚 / %d枚" % (GOUKAKU, len(waru), n),
            u"声の途中で切り替わり\t%d枚 / %d枚" % (len(naka), n),
            u"", u"動画の時刻\tずれ\t字幕"]
    for (d, st, moto, c, tx) in zure[:40]:
        gyou.append(u"%s\t%.2f秒\t%s" % (mmss(st), d, tx))
    try:
        if not os.path.isdir(u"確認用"):
            os.makedirs(u"確認用")
        io.open(os.path.join(u"確認用", u"ずれ.txt"), "w",
                encoding="utf-8", newline="\r\n").write(u"\r\n".join(gyou) + u"\r\n")
    except Exception:
        pass

    # ── ③ 字幕の切り替わりと、絵の切り替わりが同じ時刻か
    #
    # 本人の指摘（2026-10-06）：
    #   「字幕と音声はあっているが、字幕の切り替わりと画像の切り替わりが
    #     ずれている」
    # 焼き込んだ字幕(burn.ass)の時刻と、絵が切り替わる時刻を直に比べる。
    # ここが合っていれば、絵と字幕は同じコマで切り替わっている。
    ass = os.path.join(u"その他", u"_work", u"burn.ass")
    if os.path.exists(ass):
        ev = []
        for line in io.open(ass, encoding="utf-8", errors="replace").read().split(u"\n"):
            if not line.startswith(u"Dialogue: 0,"):
                continue          # 0 = 本文の字幕（引用・章・カードは別の番号）
            c = line.split(u",", 9)
            if len(c) < 10:
                continue
            h, m2, sec = c[1].strip().split(u":")
            ev.append(int(h) * 3600 + int(m2) * 60 + float(sec))
        ev.sort()
        # 絵の切り替わりは**コマ単位で積み上げる**。
        # 一覧.txt の尺は 0.01秒に丸めてあるので、秒のまま足すと
        # 30枚で1コマぶん ずれて、それを「本当のずれ」と読みちがえる。
        FPS = 30.0
        e_hon, f = [], 0
        for r in rows:
            if not r[3].startswith(u"@@") and r[4].strip():
                e_hon.append(f / FPS)
            f += int(round(r[2] * FPS))
        if ev and len(ev) == len(e_hon):
            sa = [abs(a - b) for a, b in zip(ev, e_hon)]
            print(u"")
            print(u"字幕と絵の切り替わり : いちばん大きいずれ %.3f秒 / 平均 %.3f秒"
                  % (max(sa), sum(sa) / len(sa)))
            if max(sa) > 0.05:
                warui2 = sorted(zip(sa, ev, e_hon), reverse=True)[:5]
                print(u"⚠ 字幕と絵が同じ時刻に切り替わっていません。")
                for (d, a1, b1) in warui2:
                    print(u"   %s  字幕 %.3f / 絵 %.3f  ずれ %.3f秒"
                          % (mmss(a1), a1, b1, d))
            else:
                print(u"  ○ 同じコマで切り替わっています（%d枚）" % len(ev))
        elif ev:
            print(u"")
            print(u"字幕 %d枚 と 本文の行 %d行 の数が合いません（比べられません）"
                  % (len(ev), len(e_hon)))

    print(u"")
    if waru:
        print(u"⚠ %.2f秒を超えてずれている所が %d枚 あります。" % (GOUKAKU, len(waru)))
        for (d, st, moto, c, tx) in waru[:8]:
            print(u"  %s  %.2f秒ずれ   %s" % (mmss(st), d, tx[:24]))
        print(u"  この時刻と文をチャットに貼ってください。")
    else:
        print(u"○ %.2f秒を超えてずれている所はありません。" % GOUKAKU)
    print(u"  くわしくは 確認用/ずれ.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
