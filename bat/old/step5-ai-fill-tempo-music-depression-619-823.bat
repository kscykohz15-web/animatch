@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step5-fill-tempo-music-depression-%TS%.txt

echo ===== START %date% %time% ===== > "%LOG%"

set ID_FROM=619
set ID_TO=823
set LIMIT=500
set DRY_RUN=true
set MIN_INTERVAL_MS=1200
set MODEL=gpt-4o-mini

call node scripts\step5-ai-fill-tempo-music-depression-range.mjs >> "%LOG%" 2>&1

echo ===== END %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
