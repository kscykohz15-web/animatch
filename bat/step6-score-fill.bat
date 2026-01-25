@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step6-score-fill-%TS%.txt

echo ===== START step6-score-fill %date% %time% ===== >> "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

set LIMIT=200
set OFFSET=0
set MODEL=gpt-4o-mini
set DRY_RUN=false
set MIN_INTERVAL_MS=1200
set FILL_ZERO=false

call node scripts\step6-score-fill.mjs >> "%LOG%" 2>&1

echo ===== END step6-score-fill %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
