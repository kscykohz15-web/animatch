@echo off
chcp 65001 >nul
setlocal

set ROOT=C:\Users\kouhe\Desktop\animatch-work\animatch
cd /d "%ROOT%"

if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\step7-vod-%TS%.txt

echo ===== START step7-vod %date% %time% =====>>"%LOG%"

echo --- RUN: run-weekly-official3.bat --- >>"%LOG%"
call "%ROOT%\run-weekly-official3.bat" >>"%LOG%" 2>&1

echo --- RUN: run-weekly-tmdb.bat --- >>"%LOG%"
call "%ROOT%\run-weekly-tmdb.bat" >>"%LOG%" 2>&1

echo --- RUN: run-weekly-official4.bat --- >>"%LOG%"
call "%ROOT%\run-weekly-official4.bat" >>"%LOG%" 2>&1

echo ===== END step7-vod %date% %time% =====>>"%LOG%"
echo Log: %LOG%

endlocal
