@echo off
setlocal enabledelayedexpansion

cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step2-match-%TS%.txt

echo ===== START step2-match %date% %time% ===== >> "%LOG%"

REM 1) anilist_id が空の作品だけ ANILIST_MATCH を投入
set LIMIT=10000
set OFFSET=0
set REGION=JP
call node scripts\enqueue-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM 2) worker（MATCHのみ処理）
set WORKER_ID=step2-match
set LOOP_LIMIT=5000
set ANILIST_MIN_INTERVAL_MS=900
call node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1

:end
echo ===== END step2-match %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
endlocal
