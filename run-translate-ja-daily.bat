@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs
set LOG=logs\translate-ja-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START translate-ja %date% %time% ===== >> %LOG%

REM 既存データも含めて走査（初回だけ START_ID=0 を付けてもOK）
set TRANSLATE_BATCH=30
set DRY_RUN=0

call node scripts\translate-animeworks-ja.mjs >> %LOG% 2>&1

echo ===== END translate-ja %date% %time% ===== >> %LOG%
