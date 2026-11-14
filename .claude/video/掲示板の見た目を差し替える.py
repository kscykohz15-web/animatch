# -*- coding: utf-8 -*-
u"""公開中の掲示板のHTMLの <style>…</style> を丸ごと入れ替え、パック版も上げる。

    python3 -I 掲示板の見た目を差し替える.py <新しいstyle.css> <版> <HTML> ...

■ なぜ入れ替えだけで出すのか（メモリ 69-3）
  いまの渡し方は「公開中の掲示板を読んで、変えたブロックだけ差し替える」。
  台本も絵も掲示板の中に入っているので、作り直すと中身が消える。
  **見た目だけ直すときは、見た目だけ差し替える。**

■ 1つめの <style> はこちらの物ではない（2026-11-07・事故った）
  公開された掲示板のHTMLには <style> が**2つ**ある。
  1つめは Artifact の側が付ける包みの分で、2つめがこちらの掲示板の分。
  s.find("<style>") で1つめを置きかえたせいで、**見た目が1つも変わらず**
  「直したのに紫のまま」と1往復むだにした。
  見分けるのは中身で、こちらの分には **--ground:** が入っている。
  だから「--ground: が入っている <style>」だけを狙う。入っていなければ止まる。

■ 新しい css はどこから取るか
  見た目の大もとは **board.src.html の中の <style>** です（別に css を持つと二重管理
  になる）。渡すときはそこから切り出す：

    python3 -I -c "import io,re;s=io.open('.claude/video/board.src.html',encoding='utf-8').read();
    a=s.find('<style>');b=s.find('</style>',a)+8;io.open('新しい.css','w',encoding='utf-8').write(s[a:b])"

  （board.src.html の <style> は1つだけなので、こちらは1個めでよい）
"""
import io
import re
import sys

css = io.open(sys.argv[1], encoding="utf-8").read().rstrip(u"\n")
ban = sys.argv[2]
assert css.startswith(u"<style>") and css.endswith(u"</style>"), u"css は <style> で包んで渡す"
assert u"--ground:" in css, u"新しい css に --ground: がありません"

for p in sys.argv[3:]:
    s = io.open(p, encoding="utf-8", errors="replace").read()

    # <style> を頭から全部見て、--ground: が入っているものだけを選ぶ
    ba = []
    i = 0
    while True:
        a = s.find(u"<style>", i)
        if a < 0:
            break
        b = s.find(u"</style>", a)
        assert b > a, p
        ba.append((a, b + len(u"</style>")))
        i = b
    erabu = [(a, b) for (a, b) in ba if u"--ground:" in s[a:b]]
    assert len(erabu) == 1, \
        u"%s … <style> は %d個、--ground: が入っているのは %d個（1個でないので止めます）" \
        % (p, len(ba), len(erabu))
    a, b = erabu[0]
    nanbanme = [x[0] for x in ba].index(a) + 1

    atarashii = s[:a] + css + s[b:]
    n = len(re.findall(u'var PACK_VERSION = "v\\d+";', atarashii))
    assert n == 1, (p, n)
    atarashii = re.sub(u'var PACK_VERSION = "v\\d+";',
                       u'var PACK_VERSION = "%s";' % ban, atarashii)
    io.open(p, "w", encoding="utf-8", newline="").write(atarashii)
    print(u"○ %s … %d個の <style> のうち %d個め（--ground: のある方）を入れ替え、"
          u"パック版を %s にしました（%d→%d文字）"
          % (p.split(u"/")[-1], len(ba), nanbanme, ban, len(s), len(atarashii)))
