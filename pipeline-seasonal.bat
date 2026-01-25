@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\pipeline-seasonal-%TS%.log

echo ===== START pipeline-seasonal %date% %time% =====>> "%LOG%"

REM 1) 作品追加（安全版）
set YEAR=2026
set SEASON=WINTER
set PER_PAGE=50
set MAX_PAGES=5
node scripts\sync-anilist-discover-seasonal-safe.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM 2) メタキュー投入
set LIMIT=5000
set OFFSET=0
node scripts\enqueue-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

set ANILIST_MIN_INTERVAL_MS=900

REM 3) メタ埋めworker
set WORKER_ID=meta-seasonal
set LOOP_LIMIT=5000
node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM 4) 文章生成（空欄のみ）
set MODE=FILL_EMPTY
set BATCH=40
set DRY_RUN=0
node scripts\generate-animeworks-jpstyle.mjs >> "%LOG%" 2>&1

:end
echo ===== END pipeline-seasonal %date% %time% =====>> "%LOG%"
echo Log: %LOG%
