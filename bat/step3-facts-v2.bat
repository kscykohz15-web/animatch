@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step3-facts-%TS%.txt

echo ===== START step3-facts-v3 %date% %time% ===== > "%LOG%"
echo RUNNING: %~f0 >> "%LOG%"

REM --- Step3: AniList FACTS（DBの anilist_id 前提 / nullだけ埋める）---
set LIMIT=1000
set OFFSET=0
set FORCE=0
set ANILIST_MIN_INTERVAL_MS=1200
set ANILIST_RETRY_MAX=10

call node scripts\step3-anilist-facts.mjs >> "%LOG%" 2>&1
set ERR=%ERRORLEVEL%

echo ===== END step3-facts-v3 %date% %time% ===== >> "%LOG%"
echo Log: %LOG%

exit /b %ERR%
