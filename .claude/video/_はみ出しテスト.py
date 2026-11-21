# -*- coding: utf-8 -*-
u"""スマホの幅で、掲示板が横に動かないか（仕上げ.py ㉟・出来上がった掲示板を見る）

    python _はみ出しテスト.py <board.html> [<board_osusume.html> …]

■ 本人の画面（2026-11-20・v201）

  > 二枚目の画像みたいに、スライドした時に右側にも動かせてしまうので直して

  iPhone で掲示板を指でなぞると、ページごと右へ動いた。原因は v201 で足した「作業フォルダの並び」の
  等幅の枠（pre）。折り返さないので長い行が 651px まで伸び、ページの幅が画面（390px）より広くなった。
  ほかの pre（採点の例・a-Shell の例）は枠の中で横に動く作り（overflow-x:auto）なので、ページは動かない。

■ 見ること
  出来上がった掲示板に、公開するときと同じ外側の枠（文字コード・画面幅の指定）を付け、
  iPhone 13（390px）と iPhone SE（375px）の幅で開いて
  ① 開いたまま ② 折りたたみ（details）を全部開いて
  ページの幅（scrollWidth）が画面の幅を超えないか。超えたら、はみ出している所（文字か箱）を名前で出す。
  ボードの保存（db など）は偽物を渡す（中身は空）。
"""
from __future__ import print_function
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

JS = r"""
const { chromium, devices } = require("playwright");
const files = JSON.parse(process.argv[2]);
(async () => {
  const br = await chromium.launch();
  const kekka = [];
  try {
    for (const dev of ["iPhone 13", "iPhone SE"]) {
      const ctx = await br.newContext({...devices[dev]});
      await ctx.addInitScript(() => {
        function docRef(p){ return {get: () => Promise.resolve({id: p.split("/").pop(), exists: false, data: () => null}),
          set: () => Promise.resolve(), delete: () => Promise.resolve(), update: () => Promise.resolve(),
          onSnapshot: () => () => {}}; }
        const M = {db: {doc: docRef, collection: () => ({get: () => Promise.resolve({docs: []}), onSnapshot: () => () => {}})},
          assets: {list: () => Promise.resolve({assets: [], usage: {}}), upload: () => Promise.reject(new Error("x")),
                   delete: () => Promise.resolve()},
          downloads: {save: () => Promise.resolve("saved")}};
        window.claude = {use: n => Promise.resolve(M[n] || null)};
      });
      for (const f of files) {
        const pg = await ctx.newPage();
        await pg.goto("file://" + f.path);
        await pg.waitForTimeout(1500);
        for (const jou of ["そのまま", "折りたたみを全部開く"]) {
          if (jou !== "そのまま") {
            await pg.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
            await pg.waitForTimeout(400);
          }
          const r = await pg.evaluate(() => {
            const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
            const doko = [];
            if (sw > W + 1) {
              function path(e){ const a = []; let p = e; while (p && p !== document.body && a.length < 4) {
                a.unshift(p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") +
                  (typeof p.className === "string" && p.className ? "." + p.className.split(" ")[0] : ""));
                p = p.parentElement; } return a.join(" > "); }
              function kakomi(e, jibun){ let p = jibun ? e : e.parentElement; while (p) { const o = getComputedStyle(p).overflowX;
                if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; p = p.parentElement; } return false; }
              for (const e of document.querySelectorAll("body *")) {
                const b = e.getBoundingClientRect();
                if ((b.width || b.height) && b.right > W + 1 && !kakomi(e) &&
                    !(e.parentElement && e.parentElement.getBoundingClientRect().right > W + 1))
                  doko.push("箱 " + path(e) + "（右端 " + Math.round(b.right) + "px）");
              }
              const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = tw.nextNode())) {
                if (!n.textContent.trim()) continue;
                const rg = document.createRange(); rg.selectNodeContents(n);
                const b = rg.getBoundingClientRect();
                if (b.width && b.right > W + 1 && !kakomi(n.parentElement, true))
                  doko.push("文字 " + path(n.parentElement) + "（右端 " + Math.round(b.right) + "px）「" +
                            n.textContent.trim().slice(0, 24).replace(/\s+/g, " ") + "」");
              }
            }
            return {W, sw, doko: doko.slice(0, 6)};
          });
          kekka.push({dev, f: f.name, jou, ...r});
        }
        await pg.close();
      }
      await ctx.close();
    }
  } catch (e) {
    console.log("NG|止まりました: " + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    await br.close();
  }
  console.log("KEKKA|" + JSON.stringify(kekka));
})();
"""


def main():
    hairu = [a for a in sys.argv[1:] if not a.startswith(u"--")]
    if not hairu:
        print(u"使い方: python _はみ出しテスト.py <board.html> [...]")
        return 2
    if not shutil.which("node") or subprocess.run(["node", "-e", "require('playwright')"],
                                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT).returncode:
        print(u"… node と Playwright が無いので、とばします")
        return 0
    tmp = tempfile.mkdtemp(prefix=u"hamidashi_")
    try:
        files = []
        for p in hairu:
            if not os.path.exists(p):
                print(u"× %s がありません" % p)
                return 1
            s = io.open(p, encoding="utf-8").read()
            # 公開するときに付く外側の枠と同じもの（無いと文字コードと画面の幅が決まらない）
            if not s.lstrip().lower().startswith(u"<!doctype"):
                s = (u'<!doctype html><html lang="ja"><head><meta charset="utf-8">'
                     u'<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'
                     + s + u"</body></html>")
            q = os.path.join(tmp, u"%d.html" % len(files))
            io.open(q, "w", encoding="utf-8").write(s)
            files.append({u"path": q, u"name": os.path.basename(p)})
        js = os.path.join(tmp, u"hamidashi.js")
        io.open(js, "w", encoding="utf-8").write(JS)
        r = subprocess.run(["node", js, json.dumps(files, ensure_ascii=False)], stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT)
        out = r.stdout.decode("utf-8", "replace")
        kekka = None
        for line in out.split(u"\n"):
            if line.startswith(u"KEKKA|"):
                kekka = json.loads(line[6:])
            elif line.startswith(u"NG|"):
                print(u"× " + line[3:])
        if kekka is None:
            print(out[-2000:])
            print(u"× 掲示板を開けませんでした")
            return 1
        warui = 0
        for k in kekka:
            ok = k[u"sw"] <= k[u"W"] + 1
            print(u"%s %s・%s・%s … ページの幅 %dpx ／ 画面 %dpx" % (u"○" if ok else u"×", k[u"f"], k[u"dev"],
                                                             k[u"jou"], k[u"sw"], k[u"W"]))
            if not ok:
                warui += 1
                for d in k[u"doko"]:
                    print(u"     はみ出し: " + d)
        if warui:
            print(u"× スマホでページが横に動きます（%d か所）。はみ出している所を折り返すか、枠の中で動かしてください" % warui)
            return 1
        print(u"○ スマホの幅で、どの掲示板も横に動きません")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
