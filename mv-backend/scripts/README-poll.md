# Running the daily poll on Windows

A stopgap until the GitHub Actions workflow has its secrets and a hosted
database. Same script either way — `dailyPoll.js` knows nothing about its
scheduler.

**Why bother scheduling it at all:** ITAD backfills game price history on
demand, so a missed day costs nothing there. Google Books does not. Book prices
only exist from the day they are first recorded, so every day the poll does not
run is a permanent hole in that series — and the book price alerts are only as
good as the history behind them.

## Register the task

Run once, in an **Administrator** PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\yousu\Projects\Watchlist Platform\mv\mv-backend\scripts\register-poll-task.ps1"
```

That script is the block below. It checks it is elevated before it starts,
rather than failing with an access-denied at the last step, and re-running it
replaces the task, so running it twice is safe.

<details>
<summary>What it does</summary>

```powershell
$dir     = "C:\Users\yousu\Projects\Watchlist Platform\mv\mv-backend"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" `
             -Argument "/c `"$dir\scripts\poll-daily.cmd`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At 9:15am
$settings = New-ScheduledTaskSettingsSet `
             -StartWhenAvailable `
             -AllowStartIfOnBatteries `
             -DontStopIfGoingOnBatteries `
             -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# S4U: run whether or not anyone is logged on, without storing a password.
# This is also what keeps the console window off the screen - see below.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
             -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName "mv-daily-poll" -Description "Media Vault price poll" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal
```

</details>

### No console window

Registered without a principal, the task runs **interactively**: cmd.exe opens a
console in your session and it stays there for the ~1 minute the poll takes,
every morning.

`-LogonType S4U` runs it in a non-interactive session instead, so nothing
appears on screen. It needs no stored password, unlike the equivalent
"Run whether user is logged on or not" checkbox in the Task Scheduler UI.

Nothing is hidden that you cannot see: everything the run printed is in
`logs/poll.log`, which is the point of the wrapper.

### The settings that matter

`-StartWhenAvailable` is the important one. Without it a task whose scheduled
time passed while the machine was off is simply skipped — which on a desktop
that is not on at 09:15 means the poll never runs at all, quietly.

`-AllowStartIfOnBatteries` and `-DontStopIfGoingOnBatteries` override defaults
that skip or kill the task on battery power. On a laptop, leaving them off is
the difference between a poll that runs and one that runs only when plugged in.

## Checking it

The wrapper appends to `mv-backend/logs/poll.log` (gitignored) because Task
Scheduler discards stdout. A task that has been failing for three weeks looks
exactly like one that has been working, and that is precisely the failure this
project cannot afford.

```powershell
Get-Content "C:\Users\yousu\Projects\Watchlist Platform\mv\mv-backend\logs\poll.log" -Tail 20
Get-ScheduledTaskInfo -TaskName "mv-daily-poll"    # LastRunTime, LastTaskResult (0 = ok)
Start-ScheduledTask   -TaskName "mv-daily-poll"    # run it now, to test
```

A healthy line looks like:

```
{"at":"...","fetched":159,"inserted":158,"gamesPolled":25,...,"skipped":["kindle"],"errors":[]}
```

`inserted: 0` with a non-zero `fetched` is also healthy — it means the day's
quotes were already recorded and the unique constraint deduped them. Running
the poll twice in a day is safe.

`skipped: ["kindle"]` is expected: there is no Kindle RSS feed, documented in
the roadmap.

## Removing it, once deployed

```powershell
Unregister-ScheduledTask -TaskName "mv-daily-poll" -Confirm:$false
```

Do this when the Actions workflow takes over, not before — and remember the
history collected here lives in the **local** database. `npm run backup`
produces a dump; restore it into the hosted database rather than letting the
hosted one start empty and orphan the days already collected.
