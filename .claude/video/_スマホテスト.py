# -*- coding: utf-8 -*-
u"""スマホで見る・絵を選ぶ（仕上げ.py ㉝）

■ 本人の指定（2026-11-19）

  > スマホからでも画像の変更依頼ができるように、制作ボード側から、説明に登場する作品の
  > 画像一覧と、生成した動画が見えるようにしたいです。

  絵と動画は本人のパソコンにしか無い。動画を作ると 確認用/スマホ用/ ができ（make_slideshow）、
  パソコンでボードを開いて上げる → スマホで見て選ぶ → パソコンで irekae.txt を保存 →
  メニューの 2 が取り込む。ボードの置き場（assets）と控え（db）は本物では確かめられないので、
  同じ形の偽物を手元のサーバーに立て、**ボードの中の本物の JS と見た目**をそのまま動かす。

■ 見ること
  ① make_slideshow が スマホ用 を作る（一覧.json・作品ごとの紙・いまの絵の紙・章ごとの動画）
  ② パソコン: 「スマホ用を上げる」でフォルダのファイルを渡すと、ぜんぶ上がり sumaho/<id> に控える
  ③ スマホ: 上げるボタンは出ない・開くと章の動画と字幕の一覧・字幕を押すとその作品の絵の一覧
  ④ スマホ: 絵を押すと選ばれ、sumaho_erabi/<id> に残る（題字の行は文ぜんぶに付く）
  ⑤ パソコン: irekae.txt を保存すると、メニューの取り込み（irekae_gyou / irekae_dare）がそのまま読める
  ⑥ 小さい絵の位置（紙の中のマス）が正しい
  ⑦ 上げ直すと、前に上げた同じ動画のファイルは消える
  ⑧ 動画を見ながら選ぶ（2026-11-20 本人の指定「動画を見ながら入れ替え候補の画像を見て選択できる」）
     再生している所の字幕に印・上の帯に「いま No.○」／動画は上に貼りつく／「この字幕の絵を替える」で
     止まって、その字幕の作品の絵が**動画の下に**並ぶ（動画を隠さない）／押すと選ばれ、動画の所に大きく
     重なる・一覧は閉じない（選び直せる）／選んでも動画を作り直さない（頭に戻らない）／
     「閉じて続きを見る」で止めた所から再生
     ／開いてもページが横に動かない
  ⑨ 絵を変える画面（2026-11-20 本人の指定「画像の変更のときは、上半分は動画の画像を見えるようにし、横に
     スライドすることで次の画像と前の画像が見えるようにし、下半分には候補の画像…一時保存できるボタン…
     最終的に修正するボタン…制作パックにその内容が更新され」）
     上半分＝その字幕の所で止めた動画・下半分＝候補・いちばん下＝一時保存と修正を決定／スライドで前後の字幕
     （動画もその所へ）・章をまたいでも続く／押した絵が上に重なる・選び直し／一時保存はその場で残る／
     修正を決定は2回押しで sumaho_kettei に残る／決定のあと「いまの絵に戻す」にした所は次の決定で「-」
  ⑩ 決定した中身を、make_slideshow の取り込みがそのまま 差し替え.txt に入れる。同じ中身は二度入れない
     （パックを落とし直すと新しい日時で届くため）
"""
from __future__ import print_function
import io, json, os, re, shutil, subprocess, sys, threading, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, u"_スマホテスト作業")
FF = shutil.which("ffmpeg")
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


# ── ① 材料
def zairyou(ms):
    from PIL import Image, ImageDraw
    e = os.path.join(SAGYOU, u"絵")
    imgpath = {}
    files = {u"あか組！": [], u"あお組": []}
    for n, (fol, kazu) in enumerate(((u"あか組！", 6), (u"あお組", 5))):
        os.makedirs(os.path.join(e, fol))
        for j in range(kazu):
            fn = u"%04d.png" % (j + 1)
            im = Image.new("RGB", (640, 360), (40 + n * 120, 30 * j, 200 - n * 80))
            ImageDraw.Draw(im).rectangle([20 + j * 60, 40, 80 + j * 60, 300], fill=(255, 255, 255))
            im.save(os.path.join(e, fol, fn))
            files[fol].append(fn)
            imgpath[fol + u"/" + fn] = os.path.join(e, fol, fn)
    Image.new("RGB", (300, 400), (250, 250, 250)).save(os.path.join(e, u"あか組！", u"1.jpg"))
    files[u"あか組！"].insert(0, u"1.jpg")
    imgpath[u"あか組！/1.jpg"] = os.path.join(e, u"あか組！", u"1.jpg")
    fol = [u"あか組！", u"あお組", u"べつの作品"]
    D = {u"title": u"01_ためし", u"made": u"2026-11-19 12:00", u"root": u"",
         u"fol": fol, u"files": [files[u"あか組！"], files[u"あお組"], [u"0001.png"]],
         u"chap": [[0, 1], [0], [1], []],
         u"rows": [
             {u"n": [1], u"t": u"0:00", u"tx": u"どうもこんにちわ、かさです。", u"txs": [u"どうもこんにちわ、かさです。"],
              u"curKey": u"あか組！/0001.png", u"kind": u"e", u"te": False, u"c": 0},
             {u"n": [2], u"t": u"0:03", u"tx": u"今回の動画の内容は、二つです。", u"txs": [u"今回の動画の内容は、二つです。"],
              u"curKey": u"あお組/0001.png", u"kind": u"e", u"te": False, u"c": 0},
             {u"n": [3, 4], u"t": u"0:06", u"tx": u"最初にご紹介する作品は、あか組！、制作はこうしゃ。",
              u"txs": [u"最初にご紹介する作品は、あか組！", u"、制作はこうしゃ。"],
              u"curKey": u"あか組！/1.jpg", u"kind": u"daiji", u"te": False, u"c": 1},
             {u"n": [5], u"t": u"0:10", u"tx": u"本作は漫画が原作となっています。", u"txs": [u"本作は漫画が原作となっています。"],
              u"curKey": u"あか組！/0002.png", u"kind": u"e", u"te": False, u"c": 1},
             {u"n": [6], u"t": u"0:14", u"tx": u"物語は、赤い所から始まります。", u"txs": [u"物語は、赤い所から始まります。"],
              u"curKey": u"あか組！/0003.png", u"kind": u"e", u"te": False, u"c": 1},
             {u"n": [7], u"t": u"0:18", u"tx": u"続いての作品は、あお組、制作はおつしゃ。", u"txs": [u"続いての作品は、あお組、制作はおつしゃ。"],
              u"curKey": u"あお組/0002.png", u"kind": u"e", u"te": False, u"c": 2},
             {u"n": [8], u"t": u"0:22", u"tx": u"本作はゲームが原作です。", u"txs": [u"本作はゲームが原作です。"],
              u"curKey": u"", u"kind": u"muji", u"te": False, u"c": 3},
             {u"n": [9], u"t": u"0:26", u"tx": u"今回の動画は以上となります。", u"txs": [u"今回の動画は以上となります。"],
              u"curKey": u"あお組/0003.png", u"kind": u"e", u"te": False, u"c": 0},
         ]}
    for r in D[u"rows"]:
        m_, s_ = r[u"t"].split(u":")
        r[u"s"] = int(m_) * 60 + int(s_) + 0.4
    final = os.path.join(SAGYOU, u"完成.mp4")
    subprocess.run([FF, "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=32",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=32", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", final], check=True)
    spans = [(0.0, 6.0, u"－"), (6.0, 17.0, u"あか組！\\N2014年冬"), (17.0, 25.0, u"あお組\\N2010年夏"),
             (25.0, 30.0, u"おわりに")]
    ms.HERE = SAGYOU
    r = ms.sumaho_tsukuru(D, imgpath, final, 2.0, spans)
    return D, r


# ── ボードの本物の部品で、確かめる1枚を組む
def kumitate():
    src = io.open(os.path.join(HERE, u"board.src.html"), encoding="utf-8").read()
    css = re.search(u"<style>([\\s\\S]*?)</style>", src).group(1)
    sec = re.search(u'  <section data-board="osusume" id="sumaho">[\\s\\S]*?\\n  </section>\\n', src).group(0)
    i = src.index(u"/*@@ONLY:osusume@@*/")
    j = src.index(u"/*@@END@@*/", i)
    block = src[i + len(u"/*@@ONLY:osusume@@*/"):j]

    def fn(name):
        return re.search(u"  function %s\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n" % name, src).group(0)
    helpers = u"".join(fn(n) for n in (u"fileName", u"bangouName", u"dbody", u"dbodies"))
    mock = u"""
window.__saved = null;
(function(){
  function enc(p){ return encodeURIComponent(p); }
  // 本物の控え（db）は読み取り専用で返る（iPhone で「Attempted to assign to readonly property.」になった）。同じにする
  function kooru(o){ if(o && typeof o === "object"){ Object.freeze(o); Object.keys(o).forEach(function(k){ kooru(o[k]); }); } return o; }
  function docRef(p){
    return {
      get: function(){ return fetch("/_db/doc?p=" + enc(p)).then(function(r){ return r.json(); }).then(function(j){
        return {id: p.split("/").pop(), exists: j !== null, data: function(){ return kooru(j); }}; }); },
      set: function(d){ return fetch("/_db/doc?p=" + enc(p), {method: "POST", body: JSON.stringify(d)}).then(function(){}); },
      delete: function(){ return fetch("/_db/doc?p=" + enc(p), {method: "DELETE"}).then(function(){}); }
    };
  }
  var M = {
    db: {doc: docRef, collection: function(p){ return {get: function(){
      return fetch("/_db/col?p=" + enc(p)).then(function(r){ return r.json(); }).then(function(a){
        return {docs: a.map(function(o){ return {id: o.id, exists: true, data: function(){ return kooru(o.data); }}; })}; }); }}; }},
    assets: {
      upload: function(b, o){ return fetch("/_up?type=" + enc((o && o.type) || b.type), {method: "POST", body: b}).then(function(r){ return r.json(); }); },
      delete: function(id){ return fetch("/_blob/" + id, {method: "DELETE"}).then(function(){ return {deleted: true}; }); },
      list: function(){ return Promise.resolve({assets: [], usage: {files: 0, bytes: 0, maxFiles: 1000, maxBytes: 1e9}}); }
    },
    downloads: {save: function(req){ window.__saved = req; return Promise.resolve("saved"); }}
  };
  window.claude = {use: function(n){ return Promise.resolve(M[n] || null); }};
})();
"""
    html = (u"<!doctype html><html lang=ja><head><meta charset=utf-8>"
            u"<meta name=viewport content='width=device-width,initial-scale=1'><title>スマホのためし</title>"
            u"<style>" + css + u"</style><script>" + mock + u"</script></head><body><main>" + sec +
            u"</main><script>(function(){\nvar SCRIPTS = {test01: {name: \"ためし\", no: \"01\"}};\n"
            u"function $(id){ return document.getElementById(id); }\n"
            u"function el(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; "
            u"if(txt !== undefined) e.textContent = txt; return e; }\n" + helpers + block + u"\n})();</script></body></html>")
    return html


# ── 偽のボードの置き場（assets）と控え（db）
def server(html):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import urlparse, parse_qs
    BLOB, DB = {}, {}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body=b"", ctype="application/json", extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path == "/":
                return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            if u.path.startswith("/_blob/"):
                b = BLOB.get(u.path[7:])
                if not b:
                    return self._send(404, b"")
                data, ct = b
                rg = self.headers.get("Range")
                if rg:
                    m = re.match(r"bytes=(\d*)-(\d*)", rg)
                    a0 = int(m.group(1) or 0)
                    b0 = int(m.group(2)) if m.group(2) else len(data) - 1
                    return self._send(206, data[a0:b0 + 1], ct, {"Content-Range": "bytes %d-%d/%d" % (a0, b0, len(data)),
                                                                   "Accept-Ranges": "bytes"})
                return self._send(200, data, ct, {"Accept-Ranges": "bytes"})
            if u.path == "/_db/doc":
                return self._send(200, json.dumps(DB.get(q["p"][0])).encode("utf-8"))
            if u.path == "/_db/col":
                p = q["p"][0] + "/"
                out = [{"id": k[len(p):], "data": v} for k, v in DB.items()
                       if k.startswith(p) and "/" not in k[len(p):]]
                return self._send(200, json.dumps(out).encode("utf-8"))
            return self._send(404, b"")

        def do_POST(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n)
            if u.path == "/_up":
                i = uuid.uuid4().hex
                ct = q.get("type", ["application/octet-stream"])[0]
                BLOB[i] = (body, ct)
                return self._send(200, json.dumps({"id": i, "url": "/_blob/" + i, "sizeBytes": len(body),
                                                   "contentType": ct}).encode("utf-8"))
            if u.path == "/_db/doc":
                DB[q["p"][0]] = json.loads(body.decode("utf-8"))
                return self._send(200, b"{}")
            return self._send(404, b"")

        def do_DELETE(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path.startswith("/_blob/"):
                BLOB.pop(u.path[7:], None)
                return self._send(200, b"{}")
            if u.path == "/_db/doc":
                DB.pop(q["p"][0], None)
                return self._send(200, b"{}")
            return self._send(404, b"")

    sv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=sv.serve_forever, daemon=True).start()
    return sv, BLOB, DB


BROWSER_JS = r"""
const { chromium, devices } = require("playwright");
const [url, pathsJson, outDir, nAka] = process.argv.slice(2);
const paths = JSON.parse(pathsJson);
function ok(c, m){ console.log((c ? "OK|" : "NG|") + m); }
async function db(page, p){ return page.evaluate(q => fetch("/_db/doc?p=" + encodeURIComponent(q)).then(r => r.json()), p); }
(async () => {
  const br = await chromium.launch();
  try {
    // ── ② パソコン
    const pc = await br.newContext({viewport: {width: 1280, height: 900}});
    const pg = await pc.newPage();
    await pg.goto(url);
    await pg.waitForFunction(() => document.getElementById("smnote").textContent.indexOf("スマホ用を上げる") >= 0, null, {timeout: 10000});
    ok(await pg.isVisible("#smupbtn"), "② パソコンでは「スマホ用を上げる」が出る");
    await pg.setInputFiles("#smupin", require("path").dirname(paths[0]));
    await pg.waitForFunction(() => document.getElementById("smnote").textContent.indexOf("上げました") >= 0, null, {timeout: 60000});
    const d1 = await db(pg, "sumaho/test01");
    ok(d1 && d1.json && Object.keys(d1.files || {}).length === paths.length - 1,
       "② 全部上がり sumaho/test01 に控える（" + Object.keys((d1 && d1.files) || {}).length + "個＋一覧）");
    // ⑦ 上げ直す（前のぶんは消える。数は Python 側で見る）
    await pg.setInputFiles("#smupin", require("path").dirname(paths[0]));
    await pg.waitForFunction(() => document.getElementById("smnote").textContent.indexOf("上げました") >= 0, null, {timeout: 60000});
    await pg.waitForTimeout(300);
    const d2 = await db(pg, "sumaho/test01");
    ok(d2 && d2.json !== d1.json, "⑦ 上げ直すと、控えが新しいぶんに替わる");

    // ── ③④ スマホ
    const ph = await br.newContext({...devices["iPhone 13"]});
    const pp = await ph.newPage();
    await pp.goto(url);
    await pp.waitForSelector(".smcard button");
    ok(!(await pp.isVisible("#smupbtn")), "③ スマホでは「スマホ用を上げる」は出ない");
    ok((await pp.locator(".smcard button:has-text('消す')").count()) === 0, "③ スマホでは「消す」も出ない");
    await pp.click(".smcard button:has-text('開く')");
    await pp.waitForSelector("#smvid");
    const tabs = await pp.locator(".smtabs button").allInnerTexts();
    ok(JSON.stringify(tabs) === JSON.stringify(["はじめに", "あか組！", "あお組", "おわりに"]), "③ 章のボタンが4つ（" + tabs.join("・") + "）");
    await pp.waitForFunction(() => document.getElementById("smvid").readyState >= 1, null, {timeout: 15000});
    ok(true, "③ 章の動画が読み込める");
    await pp.screenshot({path: outDir + "/_スマホ_はじめに.png"});
    await pp.click(".smtabs button:has-text('あか組！')");
    await pp.waitForSelector(".smrow:has-text('本作は漫画')");
    const rows = await pp.locator(".smrow").allInnerTexts();
    ok(rows.some(x => x.indexOf("本作は漫画") >= 0) && !rows.some(x => x.indexOf("どうもこんにちわ") >= 0),
       "③ あか組！の章を押すと、その章の字幕だけが並ぶ（" + rows.length + "行）");
    const bg = await pp.locator(".smrow:has-text('本作は漫画') .smth").evaluate(e => getComputedStyle(e).backgroundImage);
    const okImg = await pp.evaluate(u => fetch(u.replace(/^url\("?|"?\)$/g, "")).then(r => r.ok), bg);
    ok(okImg, "③ 字幕のいまの絵（いまの絵の紙）が読める");
    // ── ⑧ 動画を見ながら（見る画面）
    await pp.evaluate(() => { document.getElementById("smvid").__shirushi = 1; document.body.style.paddingBottom = "1600px"; });
    await pp.waitForFunction(() => document.getElementById("smvid").readyState >= 1, null, {timeout: 15000});
    await pp.evaluate(() => { document.getElementById("smvid").currentTime = 8.6; });
    await pp.waitForFunction(() => { const e = document.querySelector(".smrow.now"); return e && e.textContent.indexOf("物語は") >= 0; }, null, {timeout: 8000});
    ok((await pp.textContent("#smnowt")).indexOf("物語は") >= 0, "⑧ 動画の位置に合わせて、いまの字幕（物語は…）に印が付き、上の帯にも出る");
    await pp.evaluate(() => { document.getElementById("smvid").currentTime = 4.6; });
    await pp.waitForFunction(() => { const e = document.querySelector(".smrow.now"); return e && e.textContent.indexOf("本作は漫画") >= 0; }, null, {timeout: 8000});
    ok((await pp.locator(".smrow.now").count()) === 1, "⑧ 戻すと、印も戻る（本作は漫画…・印は1つだけ）");
    const kuttsuki = await pp.evaluate(() => {
      const v = document.getElementById("smview");
      window.scrollTo(0, v.getBoundingClientRect().top + window.scrollY + 260);
      return document.getElementById("smstick").getBoundingClientRect().top;
    });
    ok(Math.abs(kuttsuki) < 2, "⑧ 下へ動かしても、動画と帯は上に貼りついたまま（" + Math.round(kuttsuki) + "px）");

    // ── ⑨ 絵を変える画面
    async function sumaho(){ return pp.evaluate(() => fetch("/_db/doc?p=" + encodeURIComponent("sumaho_erabi/test01")).then(r => r.json())); }
    async function kettei(){ return pp.evaluate(() => fetch("/_db/doc?p=" + encodeURIComponent("sumaho_kettei/test01")).then(r => r.json())); }
    async function no(t){ await pp.waitForFunction(x => (document.getElementById("smhkno").textContent || "").indexOf(x) >= 0, t, {timeout: 6000}); }
    async function vt(t){ return pp.waitForFunction(x => Math.abs(document.getElementById("smhkvid").currentTime - x) < 0.35, t, {timeout: 8000}).then(() => true).catch(() => false); }
    async function slide(dx){
      await pp.evaluate(d => {
        const s = document.getElementById("smhkstage"), b = s.getBoundingClientRect();
        const y = b.top + b.height / 2, x0 = b.left + b.width / 2 - d / 2;
        const t0 = new Touch({identifier: 7, target: s, clientX: x0, clientY: y});
        const t1 = new Touch({identifier: 7, target: s, clientX: x0 + d, clientY: y + 4});
        s.dispatchEvent(new TouchEvent("touchstart", {touches: [t0], changedTouches: [t0], bubbles: true}));
        s.dispatchEvent(new TouchEvent("touchend", {touches: [], changedTouches: [t1], bubbles: true}));
      }, dx);
    }
    await pp.click("#smnowbtn");
    await pp.waitForSelector("#smhk:not([hidden])");
    ok(await pp.evaluate(() => document.getElementById("smvid").paused), "⑨ 「この字幕の絵を替える」で、見る動画は止まり、絵を変える画面が開く");
    await no("No.5");
    const g = await pp.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect();
      const top = document.querySelector(".smhktop").getBoundingClientRect(), bar = document.querySelector(".smhkbar").getBoundingClientRect();
      return {h: window.innerHeight, st: r("smhkstage").top, sb: r("smhkstage").bottom, tb: top.bottom, bt: r("smhkbody").top, bb: r("smhkbody").bottom, bar: bar.top, barb: bar.bottom}; });
    // 下のボタンは画面の下に貼りつく（候補の終わりはその裏に入り、ページを下へ動かすと出てくる）
    ok(g.st >= 0 && g.tb >= g.h * 0.35 && g.tb <= g.h * 0.6 && Math.abs(g.bt - g.tb) <= 2 && g.bar >= g.tb && g.bb >= g.bar - 2 && Math.abs(g.barb - g.h) <= 2,
       "⑨ 上半分に動画の絵・下半分に候補・いちばん下に一時保存と修正を決定（上 0〜" + Math.round(g.tb) + " ／ 候補 " + Math.round(g.bt) + "〜" + Math.round(g.bb) + " ／ ボタン " + Math.round(g.bar) + "〜" + Math.round(g.barb) + "）");
    ok(await vt(5.0), "⑨ 上半分は、その字幕（No.5）の所で止めた動画（5.0秒）");
    const nTh = await pp.locator("#smhkbody .smgrid .smth").count();
    ok(nTh === parseInt(nAka, 10), "③ その作品（あか組！）の絵が全部並ぶ（" + nTh + "枚）");
    ok((await pp.locator("#smhkbody .smth .smlab:has-text('公式画像')").count()) === 1, "③ 「1」には「公式画像」の印");
    ok((await pp.locator("#smhkbody .smth.cur .smlab:has-text('いま')").count()) === 1, "③ いまの絵に「いま」の印");
    // 候補はボタン（2026-11-20・本人の iPhone で、押す処理を付けただけの箱が押せなかった）。開いてもページを固定しない
    ok(await pp.evaluate(() => Array.from(document.querySelectorAll("#smhkbody .smgrid .smth")).every(e => e.tagName === "BUTTON" && e.type === "button")),
       "⑨ 候補の絵はどれもボタン（iPhone で押せる形）・押すのは指（tap）で確かめる");
    ok(await pp.evaluate(() => getComputedStyle(document.documentElement).overflow !== "hidden" && getComputedStyle(document.body).overflow !== "hidden"),
       "⑨ 絵を変える画面を開いても、ページ全体を固定しない（iPhone で押した位置がずれないように）");
    // v204 でも iPhone で押せなかった（2026-11-20・本人）。かぶせる窓（fixed）の中の、中だけスクロールする欄に候補があった。
    // ページの中にふつうに置き、上半分と下のボタンは貼りつく形（sticky）にした
    ok(await pp.evaluate(() => { const p = getComputedStyle(document.getElementById("smhk")), b = getComputedStyle(document.getElementById("smhkbody"));
      return p.position !== "fixed" && b.overflowY !== "auto" && b.overflowY !== "scroll" && document.getElementById("smview").hidden; }),
       "⑨ 絵を変える画面は、かぶせる窓でも中だけスクロールする欄でもなく、ページの中に置く（見る画面は隠す）");
    await pp.screenshot({path: outDir + "/_スマホ_絵を変える.png"});
    await slide(-220);
    await no("No.6");
    ok(await vt(9.0), "⑨ 左へスライドすると次の字幕（No.6）・動画もその所（9.0秒）");
    await slide(220);
    await no("No.5");
    ok(true, "⑨ 右へスライドすると前の字幕（No.5）に戻る");
    ok((await pp.textContent("#smhkima")) === "いま" && (await pp.locator("#smhkover").count()) === 0,
       "⑨ 選ぶ前は、上の動画の絵に「いま」の印");
    // iPhone（Claude アプリの中の WebKit）は、光らせても click を出さないことがある（2026-11-21・本人）。
    // 指の合図（触れる・離す）だけを送り、click は送らない
    async function yubi(k, ugoku){
      return pp.evaluate(([k, ugoku]) => {
        const b = Array.from(document.querySelectorAll("#smhkbody .smth")).find(e => e.dataset.k === k), r = b.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const t0 = new Touch({identifier: 9, target: b, clientX: x, clientY: y});
        const t1 = new Touch({identifier: 9, target: b, clientX: x, clientY: y + ugoku});
        b.dispatchEvent(new TouchEvent("touchstart", {touches: [t0], changedTouches: [t0], bubbles: true, cancelable: true}));
        if (ugoku) b.dispatchEvent(new TouchEvent("touchmove", {touches: [t1], changedTouches: [t1], bubbles: true, cancelable: true}));
        b.dispatchEvent(new TouchEvent("touchend", {touches: [], changedTouches: [t1], bubbles: true, cancelable: true}));
        return {sel: (document.querySelector("#smhkbody .smth.sel") || {dataset: {}}).dataset.k || null,
                msg: document.getElementById("smhkmsg").textContent};
      }, [k, ugoku]);
    }
    const y1 = await yubi("あか組！/0003.png", 0);
    ok(y1.sel === "あか組！/0003.png" && y1.msg.indexOf("押しました") >= 0 && (await pp.locator("#smhkover").count()) === 1,
       "⑨ click が来なくても、指を離した瞬間に選ばれ、帯に「押しました」と出る（" + y1.msg + "）");
    const y2 = await yubi("あか組！/0004.png", 30);
    ok(y2.sel === "あか組！/0003.png", "⑨ 指が動いたとき（スクロール）は選ばない");
    await pp.tap("#smhkbody .smth[title='あか組！/0006.png']");
    const gok = await pp.textContent("#smhkgo");
    ok(gok.indexOf("触れた→離した") >= 0 && gok.indexOf("0006.png") >= 0,
       "⑨ 帯に、ページに届いた指の合図をそのまま出す（" + gok + "）");
    await pp.tap("#smhkbody .smth[title='あか組！/0006.png']");
    await pp.waitForSelector("#smhkover");
    const ue = await pp.evaluate(() => { window.scrollBy(0, 150); return Math.round(document.querySelector(".smhktop").getBoundingClientRect().top); });
    ok(Math.abs(ue) <= 2, "⑨ 候補をページごと下へ動かしても、上の動画の絵は貼りついたまま（" + ue + "px）");
    await pp.tap("#smhkbody .smth[title='あか組！/0005.png']");
    await pp.waitForFunction(() => { const s = document.querySelector("#smhkbody .smth.sel"); return s && s.title === "あか組！/0005.png"; }, null, {timeout: 3000});
    const kasane = await pp.evaluate(() => { const a = document.getElementById("smhkover"), b = document.querySelector("#smhkbody .smth.sel");
      return !!(a && b) && getComputedStyle(a).backgroundImage === getComputedStyle(b).backgroundImage
        && getComputedStyle(a).backgroundPosition === getComputedStyle(b).backgroundPosition; });
    ok(kasane && (await pp.locator("#smhkbody .smth.sel").count()) === 1, "⑨ 押した絵が上に大きく重なり、選び直せる（「変更後」は1枚だけ）");
    // 本人の指定（2026-11-20）:「いま」に対して「変更後」のように選んだ画像が表示されて欲しい
    ok((await pp.textContent("#smhkbody .smth.sel .smlab")) === "変更後" && (await pp.textContent("#smhkover .smlab")) === "変更後"
       && (await pp.locator("#smhkima").count()) === 0 && (await pp.locator("#smhkbody .smth.cur .smlab:has-text('いま')").count()) === 1,
       "⑨ 選んだ絵は候補でも上の絵でも「変更後」、いまの絵は「いま」のまま");
    await pp.screenshot({path: outDir + "/_スマホ_絵を変える_選んだ.png"});
    await pp.click("#smhktsugi");
    await no("No.6");
    ok((await pp.locator("#smhkover").count()) === 0, "⑨ 次の字幕（まだ選んでいない）では、重ねた絵が消えて動画の絵になる");
    const src1 = await pp.evaluate(() => document.getElementById("smhkvid").src);
    await pp.click("#smhktsugi");
    await no("No.7");
    const ao = await pp.locator("#smhkbody .smgrid .smth").count();
    const src2 = await pp.evaluate(() => document.getElementById("smhkvid").src);
    // あお組の章の動画は 19.0秒（本編 17.0＋オープニング 2.0）から。No.7 は 18.4＋2.0＋0.6 → 2.0秒
    ok(ao === 5 && src2 !== src1 && (await vt(2.0)), "⑨ 章をまたいでも続けて見られる（No.7・候補は あお組 の " + ao + "枚・動画も あお組 の章の所）");
    for (const x of [1, 2, 3]) await pp.click("#smhkmae");
    await no("No.3・4");
    await pp.tap("#smhkbody .smth[title='あか組！/0004.png']");
    await pp.click("#smhkhozon");
    await pp.waitForFunction(() => (document.getElementById("smhkmsg").textContent || "").indexOf("一時保存しました") >= 0, null, {timeout: 5000});
    const e1 = await sumaho();
    ok(e1 && e1.picks && e1.picks["5"] === "あか組！/0005.png" && e1.picks["3"] === "あか組！/0004.png" && e1.picks["4"] === "あか組！/0004.png",
       "⑨ 一時保存で、その場で残る（5・3・4番）");
    ok((await pp.textContent("#smhkst")).indexOf("一時保存") >= 0, "⑨ 下の帯に一時保存の時刻が出る");
    await pp.click("#smhkkettei");
    ok((await pp.textContent("#smhkkettei")).indexOf("もう一度押すと決定") >= 0 && !(await kettei()), "⑨ 修正を決定は1回目では決めない（もう一度押すと決定）");
    await pp.click("#smhkkettei");
    await pp.waitForFunction(() => (document.getElementById("smhkmsg").textContent || "").indexOf("決定しました") >= 0, null, {timeout: 5000});
    const k1 = await kettei();
    ok(k1 && k1.n === 3 && k1.text.indexOf("#@title\t01_ためし") >= 0 && k1.text.indexOf("5\tあか組！/0005.png\t") >= 0,
       "⑨ 2回押すと決定し、sumaho_kettei に入れ替えの形で残る（" + (k1 && k1.n) + " か所）");
    ok((await pp.textContent("#smhkst")).indexOf("決定済み") >= 0, "⑨ 下の帯に「決定済み」");
    const yoko = await pp.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(yoko[0] <= yoko[1] + 1, "⑨ 絵を変える画面でも、ページが横に動かない（" + yoko[0] + " ／ " + yoko[1] + "px）");
    await pp.click("#smhkclose");
    await pp.waitForSelector("#smhk", {state: "hidden"});
    await pp.waitForSelector(".smrow.picked:has-text('本作は漫画')");
    await pp.waitForSelector(".smrow.picked:has-text('最初にご紹介')");
    ok(await pp.evaluate(() => document.getElementById("smvid").__shirushi === 1), "⑨ 閉じると見る画面に戻り（動画は作り直さない）、選んだ所に印");
    // 決定のあとで「いまの絵に戻す」→ 次の決定で「-」が入る
    await pp.evaluate(() => Array.from(document.querySelectorAll(".smrow")).find(e => e.textContent.indexOf("本作は漫画") >= 0).click());
    await no("No.5");
    await pp.click("#smhkmodo");
    ok((await pp.textContent("#smhkst")).indexOf("決定のあとに選び直した所") >= 0, "⑨ 決定のあとで変えると「もう一度「修正を決定」」と出る");
    await pp.click("#smhkkettei"); await pp.click("#smhkkettei");
    await pp.waitForFunction(() => (document.getElementById("smhkmsg").textContent || "").indexOf("決定しました") >= 0, null, {timeout: 5000});
    const k2 = await kettei();
    ok(k2 && k2.text.indexOf("5\t-\t") >= 0 && k2.n === 2, "⑨ 決定のあと「いまの絵に戻す」にした所は、次の決定で「-」（機械に戻す）が入る");
    await pp.tap("#smhkbody .smth[title='あか組！/0005.png']");
    await pp.click("#smhkkettei"); await pp.click("#smhkkettei");
    await pp.waitForFunction(() => (document.getElementById("smhkmsg").textContent || "").indexOf("決定しました（3") >= 0, null, {timeout: 5000});
    console.log("KETTEI|" + JSON.stringify(await kettei()));
    await pp.click("#smhkclose");
    await pp.waitForSelector("#smhk", {state: "hidden"});
    await pp.waitForTimeout(1200);
    ok(!(await pp.isVisible("button:has-text('irekae.txt を保存')")), "③ スマホでは「irekae.txt を保存」は出ない");
    await pp.screenshot({path: outDir + "/_スマホ_選んだあと.png", fullPage: true});
    // 開き直しても、選んだ絵は残っている
    await pp.reload();
    await pp.waitForSelector(".smcard button");
    await pp.click(".smcard button:has-text('開く')");
    await pp.waitForSelector("#smvid");
    await pp.click(".smtabs button:has-text('あか組！')");
    await pp.waitForSelector(".smrow.picked:has-text('本作は漫画')", {timeout: 5000});
    ok(true, "④ 開き直しても、選んだ絵が残っている");
    // 開き直したあと（選んだ絵を控えから読んだあと）も選べる。控えは読み取り専用で返る（v208 まで iPhone で止まっていた）
    await pp.evaluate(() => Array.from(document.querySelectorAll(".smrow")).find(e => e.textContent.indexOf("物語は") >= 0).click());
    await pp.waitForSelector("#smhk:not([hidden])");
    await pp.tap("#smhkbody .smth[title='あか組！/0006.png']");
    const ag = await pp.evaluate(() => ({sel: (document.querySelector("#smhkbody .smth.sel") || {dataset: {}}).dataset.k || null,
      msg: document.getElementById("smhkmsg").textContent}));
    ok(ag.sel === "あか組！/0006.png" && ag.msg.indexOf("止まりました") < 0,
       "④ 開き直して控えから選んだ絵を読んだあとも、選び直せる（控えは読み取り専用で返る・" + ag.msg + "）");
    await pp.tap("#smhkmodo");
    await pp.tap("#smhkclose");
    await pp.waitForSelector("#smhk", {state: "hidden"});
    await pp.waitForTimeout(1200);

    // ── ⑤ パソコンで保存
    await pg.reload();
    await pg.waitForSelector(".smcard button");
    await pg.click(".smcard button:has-text('開く')");
    await pg.waitForSelector("button:has-text('irekae.txt を保存')");
    // パソコンのクリックでも選べる（指の合図の仕組みを入れても、click の道は残す）
    await pg.click(".smtabs button:has-text('あか組！')");
    await pg.click(".smrow:has-text('物語は')");
    await pg.waitForSelector("#smhk:not([hidden])");
    await pg.click("#smhkbody .smth[title='あか組！/0006.png']");
    const pcs = await pg.evaluate(() => (document.querySelector("#smhkbody .smth.sel") || {dataset: {}}).dataset.k || null);
    await pg.click("#smhkmodo");
    const pcm = await pg.evaluate(() => document.querySelectorAll("#smhkbody .smth.sel").length);
    ok(pcs === "あか組！/0006.png" && pcm === 0, "⑨ パソコンのクリックでも選べて、「いまの絵に戻す」で外せる");
    await pg.click("#smhkclose");
    await pg.waitForSelector("#smhk", {state: "hidden"});
    await pg.waitForTimeout(1200);
    await pg.click("button:has-text('irekae.txt を保存')");
    await pg.waitForFunction(() => window.__saved !== null, null, {timeout: 5000});
    console.log("SAVED|" + JSON.stringify(await pg.evaluate(() => window.__saved)));
  } catch (e) {
    console.log("NG|ブラウザの確かめで止まりました: " + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    await br.close();
  }
})();
"""


def main():
    if not FF:
        print(u"ffmpeg が無いので、とばします。")
        return 0
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(u"Pillow が無いので、とばします。")
        return 0
    if not shutil.which("node") or subprocess.run(["node", "-e", "require('playwright')"],
                                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT).returncode:
        print(u"node と Playwright が無いので、とばします。")
        return 0
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(SAGYOU)
    ms = mod(os.path.join(HERE, u"make_slideshow.py"), u"ms_sumaho")
    D, r = zairyou(ms)
    sm = os.path.join(SAGYOU, u"確認用", u"スマホ用")
    names = sorted(os.listdir(sm)) if os.path.isdir(sm) else []
    J = json.load(io.open(os.path.join(sm, u"ichiran.json"), encoding="utf-8")) if u"ichiran.json" in names else {}
    iu(bool(r) and u"ichiran.json" in names, u"① スマホ用ができる（%s）" % u" ".join(names))
    iu(len(J.get(u"clips", [])) == 4 and all(os.path.getsize(os.path.join(sm, c[u"file"])) < 19 * 1048576
                                             for c in J.get(u"clips", [])),
       u"① 章ごとの動画が4本（はじめに・あか組！・あお組・おわりに）、どれも 19MiB 未満")
    iu(J.get(u"clips", [{}])[0].get(u"title") == u"はじめに" and J[u"clips"][1][u"st"] == 8.0,
       u"① 1本目は「はじめに」（オープニング込み）、2本目はオープニングのぶん後ろから（8.0秒）")
    iu(len(J.get(u"fol", [])) == 2 and u"べつの作品" not in J.get(u"fol", []),
       u"① 紙にするのは章が指している作品だけ（べつの作品は入れない）")
    iu(J.get(u"u_pos", {}).get(u"あか組！/0002.png") is not None and u"あか組！/1.jpg" in J.get(u"kou", []),
       u"① いまの絵だけの紙がある・「1」は公式画像として印が付く")
    # ⑥ 紙の中のマスが正しい（あお組/0003.png は あお組の紙の3番目＝0から数えて2）
    from PIL import Image
    p = J[u"pos"][u"あお組/0003.png"]
    sh = J[u"sheets"][p[0]]
    kami = Image.open(os.path.join(sm, sh[u"file"])).convert("RGB")
    cw, ch = J[u"cell"]
    masu = kami.crop(((p[1] % J[u"cols"]) * cw, (p[1] // J[u"cols"]) * ch,
                      (p[1] % J[u"cols"] + 1) * cw, (p[1] // J[u"cols"] + 1) * ch)).resize((8, 8))
    moto = Image.open(os.path.join(SAGYOU, u"絵", u"あお組", u"0003.png")).convert("RGB").resize((240, 135)).resize((8, 8))
    sa = sum(abs(a - b) for a, b in zip(bytearray(masu.tobytes()), bytearray(moto.tobytes()))) / 192.0
    iu(sa < 25, u"⑥ 紙の中のマスに、その絵が入っている（差 %.1f）" % sa)

    sv, BLOB, DB = server(kumitate())
    url = "http://127.0.0.1:%d/" % sv.server_address[1]
    paths = [os.path.join(sm, n) for n in names]
    js = os.path.join(SAGYOU, u"_ブラウザ.js")
    io.open(js, "w", encoding="utf-8").write(BROWSER_JS)
    r = subprocess.run(["node", js, url, json.dumps(paths), SAGYOU, str(len(D[u"files"][0]))],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, NODE_PATH=os.environ.get("NODE_PATH", "")))
    out = r.stdout.decode("utf-8", "replace")
    sav, kettei = None, None
    for line in out.split(u"\n"):
        if line.startswith(u"OK|") or line.startswith(u"NG|"):
            iu(line.startswith(u"OK|"), line[3:])
        elif line.startswith(u"SAVED|"):
            sav = json.loads(line[6:])
        elif line.startswith(u"KETTEI|"):
            kettei = json.loads(line[7:])
    if r.returncode != 0 or sav is None:
        print(out[-3000:])
        iu(False, u"ブラウザの確かめが最後まで走る")
        sv.shutdown()
        return 1
    d = DB.get(u"sumaho/test01") or {}
    iu(d.get(u"json") in BLOB and len(d.get(u"files", {})) == len(names) - 1
       and len(BLOB) == len(names),
       u"⑦ 上げ直したあと、置き場に残っているのは新しいぶんだけ（%d個）" % len(BLOB))
    pk = (DB.get(u"sumaho_erabi/test01") or {}).get(u"picks", {})
    iu(pk.get(u"5") == u"あか組！/0005.png", u"④ 選んだ絵が sumaho_erabi/test01 に残る（5番 → %s）" % pk.get(u"5"))
    iu(pk.get(u"3") == u"あか組！/0004.png" and pk.get(u"4") == u"あか組！/0004.png",
       u"④ 題字の行（3・4番）は、文ぜんぶに付く")
    sv.shutdown()
    tp = os.path.join(SAGYOU, u"irekae.txt")
    io.open(tp, "w", encoding="utf-8", newline=u"").write(sav[u"data"])
    g = ms.irekae_gyou(tp)
    iu(sav[u"filename"] == u"irekae.txt" and ms.irekae_dare(tp) == u"01_ためし",
       u"⑤ irekae.txt の #@title が動画のフォルダ名（%s）" % ms.irekae_dare(tp))
    iu(sorted(g) == [(3, u"あか組！/0004.png", u"最初にご紹介する作品は、あか組！"),
                     (4, u"あか組！/0004.png", u"、制作はこうしゃ。"),
                     (5, u"あか組！/0005.png", u"本作は漫画が原作となっています。")],
       u"⑤ メニューの取り込みが、番号・絵・字幕の文をそのまま読める（%s）" % g)
    # ⑩ 決めた中身（パックの 99_確認不要/その他/irekae_sumaho.txt で届く）を取り込みに通す
    iu(bool(kettei) and kettei.get(u"title") == u"01_ためし" and kettei.get(u"n") == 3,
       u"⑩ 最後の決定が残っている（%s か所）" % (kettei or {}).get(u"n"))
    if kettei:
        w = os.path.join(SAGYOU, u"_取り込み")
        os.makedirs(os.path.join(w, u"その他"))
        kp = os.path.join(w, u"その他", u"irekae_sumaho.txt")
        io.open(kp, "w", encoding="utf-8-sig", newline=u"").write(kettei[u"text"])
        ms.HERE, ms.DOUGA_NA = w, u"01_ためし"
        n1 = ms.irekae_torikomu()
        sa = io.open(os.path.join(w, ms.SASHIKAE), encoding="utf-8-sig").read()
        iu(n1 == 3 and u"5\tあか組！/0005.png\t本作は漫画が原作となっています。" in sa
           and u"3\tあか組！/0004.png\t最初にご紹介する作品は、あか組！" in sa,
           u"⑩ スマホで決めた絵を、はじめる.bat → 2 の取り込みが 差し替え.txt に入れる（%d か所）" % n1)
        n2 = ms.irekae_torikomu()
        os.utime(kp, (os.path.getatime(kp), os.path.getmtime(kp) + 120))
        n3 = ms.irekae_torikomu()
        iu(n2 == 0 and n3 == 0, u"⑩ もう一度動かしても・同じ中身が新しい日時で届いても、二度は入れない（%d・%d）" % (n2, n3))
        io.open(kp, "w", encoding="utf-8-sig", newline=u"").write(
            kettei[u"text"].replace(u"あか組！/0005.png", u"あか組！/0006.png"))
        n4 = ms.irekae_torikomu()
        sa2 = io.open(os.path.join(w, ms.SASHIKAE), encoding="utf-8-sig").read()
        iu(n4 >= 1 and u"5\tあか組！/0006.png" in sa2 and u"5\tあか組！/0005.png" not in sa2,
           u"⑩ 決め直した中身は入り、同じ字幕の前の決定は消える")
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
    if u"--nokosu" not in sys.argv:
        shutil.rmtree(SAGYOU, ignore_errors=True)
