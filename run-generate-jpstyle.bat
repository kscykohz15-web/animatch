@echo off
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs
set LOG=logs\generate-jpstyle-%date:~0,4%-%date:~5,2%-%date:~8,2%.txt

echo ===== START generate-jpstyle %date% %time% ===== >> %LOG%
set MODE=REGEN_PENDING
set BATCH=30
set DRY_RUN=0
node scripts\generate-animeworks-jpstyle.mjs >> %LOG% 2>&1
echo ===== END generate-jpstyle %date% %time% ===== >> %LOG%
