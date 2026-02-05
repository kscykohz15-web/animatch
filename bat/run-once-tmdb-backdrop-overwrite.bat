@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

REM ===== ログ保存先 =====
if not exist logs mkdir logs
set LOG=logs\tmdb-backdrop-overwrite-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START %date% %time% ===== >> %LOG%

REM ✅ 今回だけ「上書き」する設定
set LIMIT=5000
set OFFSET=0
set ONLY_MISSING=false
set FORCE=true
set TMDB_IMG_SIZE=w1280

call node scripts\fill-tmdb-backdrop-16x9.mjs >> %LOG% 2>&1

echo ===== END %date% %time% ===== >> %LOG%
echo Done. Log: %LOG%
