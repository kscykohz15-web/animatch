@echo off
chcp 65001 >nul
cd /d C:\Users\kouhe\Desktop\animatch-work\animatch
if not exist logs mkdir logs

set TS=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TS=%TS: =0%
set LOG=logs\report-score-distribution-%TS%.txt

set TOP_N=20

call node scripts\report-score-distribution.mjs > "%LOG%" 2>&1

echo Log: %LOG%
type "%LOG%"
