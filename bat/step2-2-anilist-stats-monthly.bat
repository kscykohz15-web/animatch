@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step2-2-anilist-stats-%TS%.txt

echo ===== START step2-2-anilist-stats %date% %time% ===== >> "%LOG%"

set LIMIT=800
set OFFSET=0
set ONLY_NEW=1
set MIN_INTERVAL_MS=900

call node scripts\refresh-anilist-stats-monthly.mjs >> "%LOG%" 2>&1

echo ===== END step2-2-anilist-stats %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
