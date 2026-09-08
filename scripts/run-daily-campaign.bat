@echo off
REM Daily re-engagement campaign runner (local automation via Windows Task Scheduler).
REM Adjust the CSV path and the --limit numbers to taste.
REM Test once by double-clicking this file BEFORE scheduling it.

cd /d "C:\Users\user\Desktop\betindia_sdk\dashboard"

echo [%date% %time%] Running win-back batch...
node --env-file=.env.local --experimental-strip-types scripts/send-campaign.mjs "C:\Users\user\Desktop\users.csv" --audience=winback --limit=100 --send

echo [%date% %time%] Running first-deposit batch...
node --env-file=.env.local --experimental-strip-types scripts/send-campaign.mjs "C:\Users\user\Desktop\users.csv" --audience=first_deposit --limit=500 --send

echo [%date% %time%] Done.
