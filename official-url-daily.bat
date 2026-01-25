@echo off
setlocal enabledelayedexpansion

cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs

set TS=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
set LOG=logs\official_url_%TS%.log

echo ===== START official-url %date% %time% ===== > "%LOG%"

REM 公式URL補完（あなたが採用する既存スクリプトに合わせてここを変更）
REM 例：node scripts\fill-official-url.mjs --limit=500
node scripts\fill-official-url.mjs --limit=500 >> "%LOG%" 2>&1

echo ===== END official-url %date% %time% ===== >> "%LOG%"
endlocal
