@echo off
REM Daily price poll, for Windows Task Scheduler.
REM
REM Exists because Task Scheduler throws stdout away: without a log, a task
REM that has been failing for three weeks looks exactly like one that has been
REM working, and book prices are the series that cannot be backfilled.
REM
REM Register it with the PowerShell in scripts/README-poll.md - the important
REM settings are -StartWhenAvailable (catch up after the machine was off) and
REM -AllowStartIfOnBatteries (or it silently skips every day on a laptop).

setlocal
cd /d "%~dp0.."

if not exist logs mkdir logs

for /f "tokens=1-3 delims=/ " %%a in ("%DATE%") do set STAMP=%%c-%%b-%%a
echo. >> logs\poll.log
echo ===== %DATE% %TIME% ===== >> logs\poll.log

node src\jobs\dailyPoll.js >> logs\poll.log 2>&1
set CODE=%ERRORLEVEL%

if %CODE% NEQ 0 (
  echo POLL FAILED with exit code %CODE% >> logs\poll.log
) else (
  echo poll ok >> logs\poll.log
)

endlocal & exit /b %CODE%
