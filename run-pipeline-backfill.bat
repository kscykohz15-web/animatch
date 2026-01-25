@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\pipeline-seasonal-%TS%.txt

echo ===== START pipeline-seasonal %date% %time% ===== >> "%LOG%"

REM --- 1) AniList seasonal discover（作品追加：重複は無視） ---
call node scripts\sync-anilist-discover-seasonal.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 2) enqueue meta（MATCH/FACTS/OFFICIAL候補） ---
set LIMIT=5000
set OFFSET=0
set REGION=JP
call node scripts\enqueue-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 3) worker anilist meta（レート制限は強め） ---
set WORKER_ID=meta-seasonal
set LOOP_LIMIT=5000
set ANILIST_MIN_INTERVAL_MS=900
call node scripts\worker-anilist-meta.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

REM --- 4) 公式URLを確定（候補から best を選ぶ：B） ---
call node scripts\resolve-official-url.mjs >> "%LOG%" 2>&1
REM 失敗しても致命傷ではないので継続
REM if errorlevel 1 goto :end

REM --- 5) jpstyle v3（summary/themes/genre/description_long を空欄だけ埋める） ---
set MODE=FILL_EMPTY
set BATCH=60
set DRY_RUN=0
set MIN_INTERVAL_MS=450
call node scripts\generate-animeworks-jpstyle.mjs >> "%LOG%" 2>&1

REM --- 6) embedding enqueue + worker（A：フリーワード近似検索用） ---
set LIMIT=5000
set OFFSET=0
call node scripts\enqueue-embedding.mjs >> "%LOG%" 2>&1

set WORKER_ID=embed-seasonal
set LOOP_LIMIT=5000
set EMBED_MIN_INTERVAL_MS=200
call node scripts\worker-embedding.mjs >> "%LOG%" 2>&1

:end
echo ===== END pipeline-seasonal %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
