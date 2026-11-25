# Troubleshooting

When tScore shows a problem, the message ends with a code like **TS-DB-003**. Choose **What to
do** on the message, or look the code up on [Error codes](errors.md).

## Common problems

### A rider's number isn't found

Check the number on the card. If they entered on the day, add them with **Late entry…** on
**Riders**. If they ride a second class, they use their first number.

### A card won't save: "That card is already in"

That rider's lap is already entered: perhaps the wrong lap, or the card was typed twice. Choose
**Edit that card instead** to check it, or change the lap.

### The number of scores doesn't match

The class rides a different number of sections from the scores typed. Check every section is
typed, one score each. If the class's sections or laps are wrong, fix them in **Event setup**.

### The results look wrong

- Check the class's tab says **All cards are in**: provisional results can still move.
- Check penalties on **Manual entry** for the riders concerned.
- Check each rider's class and competition status on **Riders**.
- If results are final, nothing changes until you reopen them (see
  [Results](results.md#reopen-to-correct-something)).

### "Overdue" or lap times look wrong

They depend on the laptop's clock and the lap 1 start time. Check the laptop's date and time,
and the start time in **Event setup**.

### The entry list won't import

Use the export exactly as the entry system gives it: don't open and save it in Excel first. If
Excel has the file open, close Excel. The message names the problem; see
[Error codes](errors.md#importing-entries).

### Labels print in the wrong place

Print at **100% (actual size)** in Word, never "fit to page". Then set the printer alignment once
(see [Card labels](before-the-event.md#card-labels)).

### The USB stick isn't available

Plug it back in. Scoring carries on regardless; the next backup goes to the stick again.

### The event won't open

If tScore says the event file is damaged or isn't an event, use **Restore from backup…** (see
[Backups and restore](backups.md)). Your backups are in the event's `backups` folder and on the
USB stick.

### An event says "Can't find its folder"

The event's folder was moved, renamed or deleted, or it's on a USB stick that isn't plugged in.
If it was moved, use **Open event file…** to open it from where it is now. If it was deleted on
purpose, choose **Remove from list** (see
[Delete an old event](getting-started.md#delete-an-old-event)).

### tScore stops responding

Close it and open it again, then open the event from **Recent events**. Everything up to the last
change is saved. If that doesn't help, restart the laptop.

## Get help

tScore is free software looked after by volunteers. To report a problem or ask a question:

1. Note the error code, and what you were doing when it happened.
2. Find tScore's log for that day: in File Explorer, type `%APPDATA%\tScore\logs` in the address
   bar. The log has rider numbers, never names.
3. Open an issue at <https://github.com/offdarecord/tScore/issues> with the code, what happened,
   and the log file attached.

Never attach the event file or entry list to a public issue: they hold riders' names.
