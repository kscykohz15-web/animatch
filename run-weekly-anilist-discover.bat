@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch

if not exist logs mkdir logs
set LOG=logs\anilist-discover-weekly-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START anilist-discover %date% %time% ===== >> %LOG%

call node scripts\sync-anilist-discover-seasonal.mjs >> %LOG% 2>&1

echo ===== END anilist-discover %date% %time% ===== >> %LOG%
