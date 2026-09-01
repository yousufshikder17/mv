# Registers the daily price poll with Windows Task Scheduler.
#
# A script rather than a block to paste: the registration is six statements
# with line continuations, and pasting that into a console is how you end up at
# a >> prompt with an unterminated quote wondering what happened.
#
# Run from an ADMINISTRATOR PowerShell:
#   powershell -ExecutionPolicy Bypass -File "<path to this file>"
#
# Safe to re-run - it replaces any existing task of the same name.

$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'poll-daily.cmd'

if (-not (Test-Path $wrapper)) {
    throw "Cannot find $wrapper"
}

# Elevation is required to register a task that runs whether or not anyone is
# logged on. Checked up front, because the failure otherwise arrives as an
# opaque access-denied at the last step.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    throw 'Run this from an Administrator PowerShell.'
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' `
    -Argument ('/c "{0}"' -f $wrapper) -WorkingDirectory $backend

$trigger = New-ScheduledTaskTrigger -Daily -At 9:15am

# -StartWhenAvailable is the one that matters: without it, a run whose time
# passed while the machine was off is skipped outright rather than caught up.
# The battery flags override defaults that skip or kill the task on battery.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# S4U runs it in a non-interactive session, so no console window appears for
# the ~1 minute the poll takes. Needs no stored password.
$principal = New-ScheduledTaskPrincipal `
    -UserId ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType S4U -RunLevel Limited

if (Get-ScheduledTask -TaskName 'mv-daily-poll' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'mv-daily-poll' -Confirm:$false
    Write-Host 'Replaced the existing task.'
}

Register-ScheduledTask -TaskName 'mv-daily-poll' `
    -Description 'Media Vault daily price poll' `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

$task = Get-ScheduledTask -TaskName 'mv-daily-poll'
Write-Host ''
Write-Host 'Registered mv-daily-poll'
Write-Host ("  runs      : daily at 09:15")
Write-Host ("  logon type: {0}   (S4U = no console window)" -f $task.Principal.LogonType)
Write-Host ("  log       : {0}" -f (Join-Path $backend 'logs\poll.log'))
Write-Host ''
Write-Host 'Test it now with:'
Write-Host '  Start-ScheduledTask -TaskName "mv-daily-poll"'
Write-Host 'then wait a minute and check:'
Write-Host '  Get-ScheduledTaskInfo -TaskName "mv-daily-poll"'
