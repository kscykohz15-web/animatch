@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

REM ===== ログ保存先（logsフォルダ） =====
if not exist logs mkdir logs

REM 日付をファイル名に入れる（例：official4-weekly-2026-01-17.txt）
set LOG=logs\official4-weekly-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START official4 %date% %time% ===== >> %LOG%

REM ===== enqueue（怪しい/未充足だけを週次で投入） =====
set LIMIT=999999
set OFFSET=0
set ONLY_MISSING=1
set STALE_DAYS=7
set PROTECT_MANUAL=1

call node scripts\enqueue-official-vod-4.mjs >> %LOG% 2>&1
if errorlevel 1 goto :end

REM ===== worker（キューを処理） =====
set HEADLESS=true
set WORKER_ID=official4-weekly
set LOOP_LIMIT=999999

call node scripts\worker-official-vod-4-queue.mjs >> %LOG% 2>&1

:end
echo ===== END official4 %date% %time% ===== >> %LOG%
