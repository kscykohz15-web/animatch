@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

REM ===== ログ保存先（logsフォルダ） =====
if not exist logs mkdir logs

REM 日付をファイル名に入れる（例：tmdb-weekly-2026-01-17.txt）
set LOG=logs\tmdb-weekly-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START %date% %time% ===== >> %LOG%

REM --- enqueue (weekly full) ---
set LIMIT=5000
set OFFSET=0
set ONLY_STALE=0
call node scripts\enqueue-tmdb-vod.mjs >> %LOG% 2>&1

REM --- worker ---
set WORKER_ID=tmdb-weekly
set LOOP_LIMIT=5000
set TMDB_FORCE=0
call node scripts\worker-tmdb-queue.mjs >> %LOG% 2>&1

echo ===== END %date% %time% ===== >> %LOG%
