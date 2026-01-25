@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step5-ai-jptext-%TS%.txt

echo ===== START step5-ai-jptext %date% %time% ===== >> "%LOG%"

set LIMIT=120
set OFFSET=0
set MODEL=gpt-4o-mini
set DRY_RUN=0
set MIN_INTERVAL_MS=1200

call node scripts\step5-ai-generate-jptext.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

:end
echo ===== END step5-ai-jptext %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
