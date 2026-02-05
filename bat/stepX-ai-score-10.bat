@echo off
chcp 65001 >nul

cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\stepX-ai-score-10-%TS%.txt

echo ===== START stepX-ai-score-10 %date% %time% ===== > "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

REM ---- 設定（必要に応じて変えてOK） ----
set LIMIT=200
set OFFSET=0
set ONLY_MISSING=true
set FORCE=false
set DRY_RUN=false
set MIN_INTERVAL_MS=1200
set MODEL=gpt-4o-mini
set MAX_TEXT_CHARS=1600
set RETRY_MAX=6

call node scripts\fill-ai-scores-10.mjs >> "%LOG%" 2>&1
set ERR=%ERRORLEVEL%

echo ===== END stepX-ai-score-10 %date% %time% ===== >> "%LOG%"
echo ExitCode: %ERR% >> "%LOG%"
echo Log: %LOG%

exit /b %ERR%
