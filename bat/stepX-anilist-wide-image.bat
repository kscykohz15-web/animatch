@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs

set LOG=logs\anilist-wide-image-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START %date% %time% ===== >> %LOG%

set LIMIT=5000
set OFFSET=0
set ONLY_MISSING=true
set FORCE=false
set MIN_INTERVAL_MS=900

call node scripts\fill-anilist-wide-image.mjs >> %LOG% 2>&1

echo ===== END %date% %time% ===== >> %LOG%
