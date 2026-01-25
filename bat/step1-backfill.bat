@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step1-backfill-%TS%.txt

echo ===== START step1-backfill %date% %time% ===== >> "%LOG%"

REM --- backfill（過去作追加：重複は無視 / stateで続きから） ---
set PER_PAGE=50
set MAX_PAGES=5
set ALLOW_UPDATE_EXISTING=0

call node scripts\sync-anilist-backfill-chunk.mjs >> "%LOG%" 2>&1

echo ===== END step1-backfill %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
