@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\seed-user-ratings-v2-%TS%.txt

echo ===== START seed-user-ratings-v2 %date% %time% ===== > "%LOG%"

rem ---- まず DRY_RUN=true でマッチング結果を確認する ----
set DRY_RUN=true
set USE_STRICT_AOT=true

call node scripts\seed-user-ratings-v2.mjs >> "%LOG%" 2>&1

echo ===== END seed-user-ratings-v2 %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
