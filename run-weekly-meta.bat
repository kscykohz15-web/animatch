@echo off
setlocal enabledelayedexpansion

cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\weekly-meta-%TS%.log

echo ===== START weekly-meta %date% %time% =====>> "%LOG%"

REM --- 1) タイトル自動追加（今期分の例：2026冬） ---
set YEAR=2026
set SEASON=WINTER
set PER_PAGE=50
set MAX_PAGES=5
node scripts\sync-anilist-discover-titles.mjs >> "%LOG%" 2>&1

REM --- 2) メタ埋めworker（キューを処理） ---
set WORKER_ID=anilist-meta-weekly
set LOOP_LIMIT=5000
node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1

echo ===== END weekly-meta %date% %time% =====>> "%LOG%"
echo Log: %LOG%
endlocal
