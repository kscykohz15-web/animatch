@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs
set LOG=logs\anilist-backfill-daily-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START anilist-backfill %date% %time% ===== >> %LOG%

REM 1日200件ずつ（お好みで調整）
set CHUNK=200
set PER_PAGE=50

call node scripts\sync-anilist-backfill-chunk.mjs >> %LOG% 2>&1

echo ===== END anilist-backfill %date% %time% ===== >> %LOG%
