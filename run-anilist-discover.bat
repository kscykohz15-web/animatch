@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\pipeline-discover-%TS%.txt

echo ===== START pipeline-discover %date% %time% ===== >> "%LOG%"

REM --- 1) AniList: seasonal discover（作品を追加） ---
set ALLOW_UPDATE_EXISTING=0
call node scripts\sync-anilist-discover-seasonal.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 2) メタ埋め用キュー投入（未作成ならこの行は一旦コメントアウトOK） ---
call node scripts\enqueue-meta.mjs >> "%LOG%" 2>&1
REM if errorlevel 1 goto :end

REM --- 3) AniListメタ埋め worker（話数/年/画像/制作会社/原作種別/公式URL候補） ---
set WORKER_ID=anilist-meta-discover
set LOOP_LIMIT=5000
call node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 4) 文章生成（あなた文体：summary/genre/themes） ---
set MODE=REGEN_PENDING
set BATCH=200
set DRY_RUN=0
call node scripts\generate-animeworks-jpstyle.mjs >> "%LOG%" 2>&1

:end
echo ===== END pipeline-discover %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
