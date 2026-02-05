@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step1-backfill-1000-%TS%.txt

echo ===== START step1-backfill-1000 %date% %time% ===== >> "%LOG%"

REM ✅ 1回で新規1000本を目標に追加（重複は除外して数える）
set PER_PAGE=50
set TARGET_NEW=1000

REM ✅ 安全のため：最大で何ページまで見るか（重複が多いと必要になる）
set MAX_SCAN_PAGES=300

REM ✅ stateを使って続きからやる（おすすめ）
set USE_STATE=1

REM ✅ 1からやり直したい時だけON（state無視）
REM set START_PAGE=1

set ALLOW_UPDATE_EXISTING=0

call node scripts\sync-anilist-backfill-target.mjs >> "%LOG%" 2>&1

echo ===== END step1-backfill-1000 %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
