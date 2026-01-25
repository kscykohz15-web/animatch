@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs
if not exist bat mkdir bat

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step1-discover-%TS%.txt

echo ===== START step1-discover %date% %time% ===== >> "%LOG%"

REM ---- 今期/来期（例：2026 WINTER + SPRING） ----
set YEAR=2026
set SEASONS=WINTER,SPRING
set PER_PAGE=50
set MAX_PAGES=5
set ALLOW_UPDATE_EXISTING=0

call node scripts\sync-anilist-discover-seasonal.mjs >> "%LOG%" 2>&1

echo ===== END step1-discover %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
