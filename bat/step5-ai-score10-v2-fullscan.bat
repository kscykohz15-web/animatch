@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step5-ai-score10-v2-fullscan-%TS%.txt

echo ===== START step5-ai-score10-v2-fullscan %date% %time% ===== > "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

rem ---- まずは DRY_RUN=true で分布を確認してから false にする ----
set DRY_RUN=true
set FORCE=true
set BATCH_LIMIT=200
set MAX_WORKS=0
set MIN_INTERVAL_MS=1200
set MODEL=gpt-4o-mini
set TEMPERATURE=0.35
set MIN_CONFIDENCE=0.3
set MIN_SPREAD=1.0
set RETRY_FLAT=true
set LOCK_USER_RATED=true
set RESUME=true
rem set ANCHOR_LIMIT=30   rem トークンを減らしたい場合だけ指定

call node scripts\step5-ai-score10-v2-fullscan.mjs >> "%LOG%" 2>&1

echo ===== END step5-ai-score10-v2-fullscan %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
