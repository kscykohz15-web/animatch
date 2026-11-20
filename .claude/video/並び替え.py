# -*- coding: utf-8 -*-
u"""作業フォルダを新しい並びへ引っ越す（はじめる.bat が毎回呼ぶ。2回目からは何もしない）。

    python 並び替え.py <作業フォルダ>

■ 本人の指定（2026-11-20）

  > zipファイル解凍後、はじめるbatの完了後、自動で生成されるファイルやフォルダがぐちゃぐちゃで
  > 見にくいです。…01_画像、02_動画のように、分けてください。ここで、動画、音声、はそれぞれ分け、
  > あとの勝手に生成されるフォルダたち（基本的に私の方で確認不要）なものは、99_確認不要 フォルダを
  > 生成し保存してください。

  <作業フォルダ>\\
    はじめる.bat
    01_台本\\      台本_字幕用.txt・台本_読み上げ用.txt（本人が直すのはこちら）
    02_音声\\      merged.wav・subtitle.srt
    03_動画\\      出来た動画
    04_確認用\\    入れ替え表.html・スマホ用\\・一覧.txt・ずれ.txt・分割版\\ …
    99_確認不要\\  道具・設定・その他（作業ファイル）・output（1行ずつの音声）・図表・効果音・BGM …

■ 決まり
  ・**消さない。** 移すだけ。行き先に同じ名前があれば、古いほうを 99_確認不要\\_前の並び\\<日時>\\ へ
  ・**知らないファイルには触らない**（本人が自分で置いた物かもしれない）。知っている名前と種類だけ動かす
  ・画像カタログ.txt / 話数マップ.txt は中身（タブのある行）の多いほうを残す。学んだ話数の入った
    画面表示.txt も残す（今までのメニューの Prepare と同じ決まり）
  ・開いていて動かせない物は、名前を出して次へ進む（止めない）
"""
from __future__ import print_function
import io
import os
import shutil
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DAIHON, OTO, DOUGA, KAKUNIN, FUYOU = u"01_台本", u"02_音声", u"03_動画", u"04_確認用", u"99_確認不要"
DAIHON_FILES = (u"台本_字幕用.txt", u"台本_読み上げ用.txt")
KOE_MOTO = (u"音声のもと.txt", u"声のもと.txt")
# 99_確認不要 へ丸ごと移すフォルダ
FUYOU_DIRS = (u"その他", u"output", u"図表", u"効果音", u"BGM", u"_前の設定", u"__pycache__")
# 99_確認不要 へ移すファイルの種類（いちばん上にある物だけ。はじめる.bat は残す）
FUYOU_EXT = (u".py", u".txt", u".tsv", u".ps1", u".png", u".json", u".ass", u".log", u".bat", u".wav")
NOKOSU = (u"はじめる.bat",)
SODATERU = (u"画像カタログ.txt", u"話数マップ.txt")     # 中身の多いほうを残す


class Hikkoshi(object):
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.fuyou = os.path.join(self.root, FUYOU)
        self.bk = os.path.join(self.fuyou, u"_前の並び", time.strftime(u"%Y%m%d_%H%M%S"))
        self.ugoita, self.taihi, self.dame = [], [], []

    # ── 小さな道具
    def _taihi(self, p, rel, tsuke=u""):
        u"""p を _前の並び\\<日時>\\rel へ退避する。tsuke は名前の後ろ（拡張子の前）に付ける印。"""
        if tsuke:
            b0, e0 = os.path.splitext(rel)
            rel = b0 + tsuke + e0
        dst = os.path.join(self.bk, rel)
        if not os.path.isdir(os.path.dirname(dst)):
            os.makedirs(os.path.dirname(dst))
        if os.path.exists(dst):
            base, ext = os.path.splitext(dst)
            dst = u"%s_%d%s" % (base, int(time.time() * 1000) % 100000, ext)
        shutil.move(p, dst)
        self.taihi.append(rel)

    def _ugokasu(self, src, dst, rel=None):
        u"""src を dst へ。dst があればフォルダは中身を重ね、ファイルは古いほう（src）を退避する。"""
        rel = rel or os.path.relpath(src, self.root)
        try:
            if os.path.isdir(src) and not os.path.islink(src):
                if not os.path.exists(dst):
                    if not os.path.isdir(os.path.dirname(dst)):
                        os.makedirs(os.path.dirname(dst))
                    shutil.move(src, dst)
                    self.ugoita.append(rel)
                    return
                for n in sorted(os.listdir(src)):
                    self._ugokasu(os.path.join(src, n), os.path.join(dst, n), os.path.join(rel, n))
                try:
                    os.rmdir(src)           # 空になったときだけ消える
                except OSError:
                    pass
                return
            if not os.path.exists(dst):
                if not os.path.isdir(os.path.dirname(dst)):
                    os.makedirs(os.path.dirname(dst))
                shutil.move(src, dst)
                self.ugoita.append(rel)
                return
            name = os.path.basename(dst)
            if name in SODATERU and self._gyou(src) > self._gyou(dst):
                self._taihi(dst, rel, u"（新しいほう）")
                shutil.move(src, dst)
                self.ugoita.append(rel)
                return
            if name == u"画面表示.txt" and self._mananda(src) and not self._mananda(dst):
                self._taihi(dst, rel, u"（新しいほう）")
                shutil.move(src, dst)
                self.ugoita.append(rel)
                return
            self._taihi(src, rel)
        except (OSError, IOError, shutil.Error) as e:
            self.dame.append(u"%s（%s）" % (rel, e))

    @staticmethod
    def _yomu(p):
        try:
            return io.open(p, encoding="utf-8-sig", errors="replace").read()
        except Exception:
            return u""

    def _gyou(self, p):
        return sum(1 for l in self._yomu(p).split(u"\n") if u"\t" in l)

    def _mananda(self, p):
        return u"学んだ話数が入っています" in self._yomu(p)

    # ── 本体
    def hashiru(self):
        r = self.root
        for d in (DAIHON, OTO, DOUGA, KAKUNIN, FUYOU):
            p = os.path.join(r, d)
            if not os.path.isdir(p):
                os.makedirs(p)
        f = self.fuyou
        # 音声: 声の控え（音声のもと・声のもと）は 99\\その他、ほかは 02_音声
        oto = os.path.join(r, u"音声")
        if os.path.isdir(oto):
            for n in KOE_MOTO:
                if os.path.exists(os.path.join(oto, n)):
                    self._ugokasu(os.path.join(oto, n), os.path.join(f, u"その他", n))
            self._ugokasu(oto, os.path.join(r, OTO))
        # 動画: 分割版（1枚ずつの確認用）は 04_確認用、ほかは 03_動画
        dg = os.path.join(r, u"動画")
        if os.path.isdir(os.path.join(dg, u"分割版")):
            self._ugokasu(os.path.join(dg, u"分割版"), os.path.join(r, KAKUNIN, u"分割版"))
        if os.path.isdir(dg):
            self._ugokasu(dg, os.path.join(r, DOUGA))
        if os.path.isdir(os.path.join(r, u"確認用")):
            self._ugokasu(os.path.join(r, u"確認用"), os.path.join(r, KAKUNIN))
        for d in FUYOU_DIRS:
            if os.path.isdir(os.path.join(r, d)):
                self._ugokasu(os.path.join(r, d), os.path.join(f, d))
        if os.path.isdir(os.path.join(r, u"_work")):
            self._ugokasu(os.path.join(r, u"_work"), os.path.join(f, u"その他", u"_work"))
        for n in sorted(os.listdir(r)):
            p = os.path.join(r, n)
            if os.path.isdir(p):
                if n.startswith(u"ショート_"):
                    self._ugokasu(p, os.path.join(f, n))
                continue
            if n in NOKOSU:
                continue
            if n in DAIHON_FILES:
                self._ugokasu(p, os.path.join(r, DAIHON, n))
            elif n in (u"merged.wav", u"subtitle.srt"):
                self._ugokasu(p, os.path.join(r, OTO, n))
            elif n in KOE_MOTO:
                self._ugokasu(p, os.path.join(f, u"その他", n))
            elif n.lower().endswith(u".mp4"):
                self._ugokasu(p, os.path.join(r, DOUGA, n))
            elif os.path.splitext(n)[1].lower() in FUYOU_EXT:
                self._ugokasu(p, os.path.join(f, n))
        return self

    def hokoku(self):
        if self.ugoita:
            print(u"  作業フォルダを新しい並び（01_台本・02_音声・03_動画・04_確認用・99_確認不要）に"
                  u"しました: %d か所を引っ越し" % len(self.ugoita))
        if self.taihi:
            print(u"  同じ名前が先にあったので、古いほう %d 個は 99_確認不要\\_前の並び に残しました"
                  u"（消していません）" % len(self.taihi))
        for d in self.dame[:8]:
            print(u"  ⚠ 動かせませんでした（開いていませんか）: %s" % d)


def main():
    if len(sys.argv) < 2:
        print(u"使い方: python 並び替え.py <作業フォルダ>")
        return 2
    root = sys.argv[1]
    if not os.path.isdir(root):
        os.makedirs(root)
    h = Hikkoshi(root).hashiru()
    h.hokoku()
    return 0 if not h.dame else 1


if __name__ == "__main__":
    sys.exit(main())
