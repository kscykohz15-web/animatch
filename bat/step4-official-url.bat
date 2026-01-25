@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step4-official-url-%TS%.txt

echo ===== START step4-official-url %date% %time% ===== >> "%LOG%"

REM 公式URL確定（あなたの既存スクリプトを実行）
set LIMIT=5000
set OFFSET=0
call node scripts\fill-official-url.mjs >> "%LOG%" 2>&1
if errorlevel 1 goto :end

:end
echo ===== END step4-official-url %date% %time% ===== >> "%LOG%"
echo Log: %LOG%
