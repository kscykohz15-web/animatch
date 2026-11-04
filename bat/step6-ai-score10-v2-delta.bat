@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step6-ai-score10-v2-delta-%TS%.txt

echo ===== START step6-ai-score10-v2-delta %date% %time% ===== > "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

set DRY_RUN=false
set BATCH_LIMIT=100
set MAX_WORKS=300
set MIN_INTERVAL_MS=1200
set MODEL=gpt-4o-mini
set TEMPERATURE=0.35
set MIN_CONFIDENCE=0.3
set MIN_SPREAD=1.0
set RETRY_FLAT=true

call node scripts\step6-ai-score10-v2-delta.mjs >> "%LOG%" 2>&1

echo ===== END step6-ai-score10-v2-delta %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
