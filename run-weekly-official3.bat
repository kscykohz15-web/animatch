@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

REM ===== ログ保存先（logsフォルダ） =====
if not exist logs mkdir logs

REM 日付をファイル名に入れる（例：official3-weekly-2026-01-17.txt）
set LOG=logs\official3-weekly-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START %date% %time% ===== >> %LOG%
echo [env] LIMIT=%LIMIT% OFFSET=%OFFSET% ONLY_MISSING=%ONLY_MISSING% STALE_DAYS=%STALE_DAYS% >> %LOG%

REM 1) enqueue（週次）
set LIMIT=5000
set OFFSET=0
set ONLY_MISSING=0
set STALE_DAYS=7
call node scripts\enqueue-official-vod-3.mjs >> %LOG% 2>&1

REM 2) worker（十分回す）
set HEADLESS=true
set WORKER_ID=official3-weekly
set LOOP_LIMIT=5000
set UNKNOWN_AS_FALSE=1
call node scripts\worker-official-vod-3-queue.mjs >> %LOG% 2>&1

echo ===== END %date% %time% ===== >> %LOG%
