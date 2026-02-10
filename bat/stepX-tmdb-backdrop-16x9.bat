@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set "LOG=logs\tmdb-backdrop-16x9-%TS%.txt"

echo ===== START %date% %time% =====> "%LOG%"

set "BATCH=1000"
set "OFFSET=8000"

:LOOP
set "LIMIT=%BATCH%"
set "ONLY_MISSING=true"
set "FORCE=false"
set "MIN_INTERVAL_MS=350"
set "TMDB_IMG_SIZE=w1280"

echo --- batch offset=!OFFSET! limit=!LIMIT! --- >> "%LOG%"
call node scripts\fill-tmdb-backdrop-16x9.mjs >> "%LOG%" 2>&1

rem ここは手動停止でもOK（CTRL+C）
set /a OFFSET+=BATCH
goto LOOP
