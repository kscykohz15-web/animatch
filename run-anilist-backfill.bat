@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\pipeline-backfill-%TS%.txt

echo ===== START pipeline-backfill %date% %time% ===== >> "%LOG%"

REM --- 1) AniList: backfill chunk（過去作の追加） ---
set CHUNK=200
set PER_PAGE=50
set ALLOW_UPDATE_EXISTING=0
call node scripts\sync-anilist-backfill-chunk.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 2) メタ埋め用キュー投入（未作成ならこの行は一旦コメントアウトOK） ---
call node scripts\enqueue-meta.mjs >> "%LOG%" 2>&1
REM if errorlevel 1 goto :end

REM --- 3) AniListメタ埋め worker ---
set WORKER_ID=anilist-meta-backfill
set LOOP_LIMIT=999999
call node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 4) 文章生成（大量なので分割推奨：BATCH小さめ） ---
set MODE=REGEN_PENDING
set BATCH=60
set DRY_RUN=0
call node scripts\generate-animeworks-jpstyle.mjs >> "%LOG%" 2>&1

:end
echo ===== END pipeline-backfill %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
