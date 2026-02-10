@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step5-ai-score10-delta-%TS%.txt

echo ===== START step6-ai-score10-delta %date% %time% ===== > "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

set BATCH_LIMIT=100
set MAX_WORKS=300
set DRY_RUN=true
set MIN_INTERVAL_MS=1200
set MODEL=gpt-4o-mini

call node scripts\step6-ai-score10-delta.mjs >> "%LOG%" 2>&1

echo ===== END step6-ai-score10-delta %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
