<!-- Generated from packages/core/src/errors.ts by `npm run gen:errors`. Do not edit. -->

# Error codes

When tScore shows a problem, the message ends with a code like **TS-DB-003**. Find the code
below to see what it means and what to do. In tScore, choose **What to do** on the message to
come straight here.

If a problem keeps happening, see [Troubleshooting](troubleshooting.md).

## General

### TS-APP-001

**Something went wrong.** tScore hit a problem it doesn't have a plain message for. Everything saved before it happened is still saved.

**What to do:** Try again. If it happens again, close tScore and open it again. If it keeps happening, tell the maintainers at <https://github.com/offdarecord/tScore/issues>: say what you were doing, give the code, and attach the log file: About → Show log folder opens it (it holds rider numbers, never names).

### TS-APP-002

**Something on the form is missing.** A box was left empty or a choice wasn't made, so nothing was saved.

**What to do:** The message says which box. Fill it in and try again.

### TS-APP-003

**No event is open.** The screen needed an open event, but none is open, or the event file doesn't hold one.

**What to do:** Choose **All events** and open the event again. If the event file itself has no event in it, it is damaged: restore it from a backup (see [Backups and restore](backups.md)).

### TS-APP-004

**That event isn't in the recent list.** The event was removed from the list on the home screen, or moved.

**What to do:** Choose **Open event file…** and find the event file (`event.sqlite`) in its folder.

### TS-APP-005

**Couldn't open the file.** Windows couldn't open the saved file (for example a results PDF) in its usual program.

**What to do:** The file is saved. Open it from its folder, or install a program for that kind of file (a PDF reader for PDFs).

### TS-APP-006

**Couldn't save the file.** Windows wouldn't let tScore write the file there (the folder may be read-only, full or gone).

**What to do:** Choose another folder, such as Documents, and save again.

### TS-APP-007

**That isn't a Test trial answer key.** Check a test trial needs the `answer-key.json` file from the Test trial kit, and the file chosen isn't one.

**What to do:** Choose `answer-key.json` from the unzipped Test trial kit (download it from the latest release).

## Event files

### TS-DB-001

**No tScore event in this folder.** The folder or file chosen isn't a tScore event.

**What to do:** Each event has its own folder with an `event.sqlite` file in it. Choose that file. Events are kept in `Documents\tScore` unless they were saved somewhere else.

### TS-DB-002

**Saved by a newer tScore.** The event was saved by a newer version of tScore. Opening it in this version could lose data, so tScore won't.

**What to do:** Update tScore on this laptop (see [Getting started](getting-started.md)), then open the event.

### TS-DB-003

**The event file is damaged.** The event file failed its check when it was opened, so tScore stopped before using it.

**What to do:** Restore the event from its latest backup (see [Backups and restore](backups.md)).

### TS-DB-004

**The folder for a new event must be empty.** A new event needs a folder of its own, and the one chosen already has files in it.

**What to do:** Choose a new, empty folder, or let tScore make one in `Documents\tScore`.

### TS-DB-005

**That copy of the event can't be opened.** The file saved to move an event to another laptop isn't complete or has been damaged (for example the USB stick was pulled out while it was saving), or it isn't a tScore event file.

**What to do:** On the first laptop, choose **Save a copy for another laptop…** again, wait for "Saved and checked", then open the new copy (see [Move an event to another laptop](backups.md#move-an-event-to-another-laptop)).

### TS-DB-006

**Type the event code to delete it.** Deleting an event needs its code typed in, so nobody deletes the wrong one by accident. What was typed doesn't match.

**What to do:** Type the code shown in the message (for example `ECT`), then choose **Delete** again.

### TS-DB-007

**That event can't be tidied while it's open.** Card scans can't be removed, and an event can't be deleted, while it's the open event.

**What to do:** Close the event (**← All events**), then use **Manage events** on the home screen.

### TS-DB-008

**That folder isn't one of this laptop's events.** Manage events only tidies event folders it lists: ones in `Documents\tScore` or on the recent list. The folder may have been moved or deleted since the list was shown.

**What to do:** Close **Manage events** and open it again to refresh the list.

## Event setup

### TS-SET-001

**The event setup isn't valid.** Something in Event setup is missing or contradicts something else, so it wasn't saved.

**What to do:** Each problem is marked on the Event setup screen. Fix those, then save again.

### TS-SET-002

**That class has riders.** A class can't be removed or renamed while riders are entered in it.

**What to do:** On **Riders**, move its riders to another class first, then change the class.

### TS-SET-003

**Cards already use that lap or section.** A lap or section can't be taken away from a class while a card already in has scores for it.

**What to do:** Check the setup is right. If the card is wrong, correct it on **Manual entry** first, then change the setup.

### TS-SET-004

**A day has no date.** Every day of the event needs a date before results can be worked out.

**What to do:** Set the date for each day in **Event setup**.

### TS-SET-005

**That picture can't be a logo.** Logos must be PNG or JPEG pictures.

**What to do:** Save the logo as a PNG or JPEG (most image programs can), then choose it again.

### TS-SET-006

**That logo is too big.** Logos can be up to 1 MB each, so backups and the results PDF stay small.

**What to do:** Save a smaller copy (about 1000 pixels wide is plenty for print), then choose it again.

### TS-SET-007

**Too many sponsor logos.** The results have room for up to 8 sponsor logos.

**What to do:** Remove one before adding another.

## Riders

### TS-RID-001

**That rider number is taken.** Each number belongs to one rider for the whole event, and this one is already in use.

**What to do:** Use another number. **Late entry…** shows the next free one.

### TS-RID-002

**No rider with that number.** There's no rider entered with the number given.

**What to do:** Check the number on the card or list. If they are new, add them on **Riders** with **Late entry…**.

### TS-RID-003

**A rider detail is missing or too long.** A rider needs a first name or a surname, and names, clubs and machines have a length limit.

**What to do:** The message says which detail. Shorten or fill it in, then save again.

### TS-RID-004

**No class with that name.** The class given isn't one of the event's classes.

**What to do:** Choose a class from the list, or add the class in **Event setup** first.

### TS-RID-005

**A rider must be in one or two classes.** Each rider rides one class, and can also enter a second class with the same number.

**What to do:** Choose one class, or two at most.

## Importing entries

### TS-IMP-001

**Not a spreadsheet.** An entry list must be an Excel workbook (.xlsx or .xls) or a CSV file.

**What to do:** Download the entry list again from the entry system as Excel or CSV, and choose that file.

### TS-IMP-002

**That file couldn't be found.** The file was moved, renamed or deleted after it was chosen, or is on a USB stick that was taken out.

**What to do:** Choose the file again from where it is now.

### TS-IMP-003

**That file is too big to be an entry list.** The file is far bigger than any entry list, so it is probably the wrong file.

**What to do:** Check you chose the entry list export, not another file.

### TS-IMP-004

**That file couldn't be read.** tScore couldn't read the file as a spreadsheet. Often it is still open in Excel.

**What to do:** If the file is open in Excel, save it, close Excel and try again. Otherwise download it again.

### TS-IMP-005

**tScore doesn't recognise this file.** The spreadsheet isn't an Entryplace or Ridernet export, or a list in the tScore rider-list format.

**What to do:** Download the riders export from the entry system again, unchanged. For any other list, copy it into the tScore rider-list format (see [Before the event](before-the-event.md#import-the-entry-list)).

### TS-IMP-006

**That is a different export.** tScore recognised the file, but it is another report from the entry system, not the riders export.

**What to do:** The message names the file to choose instead. Download that one and import it.

### TS-IMP-007

**A column is missing.** The entry list is missing a column tScore needs: first name, surname or class.

**What to do:** Download the export again without removing columns. Don't edit it in Excel before importing.

### TS-IMP-008

**Some choices still need a decision.** Some class names or double entries in the list haven't been decided yet.

**What to do:** Work through the items marked on the import screen, then choose **Import** again.

### TS-IMP-009

**Choose the entry list again.** tScore no longer has the list that was being imported, for example after switching events.

**What to do:** On **Riders**, choose **Import from entry list…** and pick the file again.

## Cards and scores

### TS-CARD-001

**That card is already in.** A card for this rider, day and lap has already been entered.

**What to do:** Check the rider number and lap on the card. To change the scores, open the card and edit it instead.

### TS-CARD-002

**No card yet.** There's no card in for this rider, day and lap, so there is nothing to change.

**What to do:** Enter the card first.

### TS-CARD-003

**The number of scores doesn't match.** The card has a different number of scores from the sections the rider's class rides.

**What to do:** Check every section has a score. If the class's sections are wrong, fix them in **Event setup**.

### TS-CARD-004

**That isn't a score.** A section has a value the event's scoring doesn't allow.

**What to do:** The message lists the scores allowed. Correct that section.

### TS-CARD-005

**The rider's class doesn't ride that day.** The day given isn't one the rider's class rides.

**What to do:** Check the day on the card, and the class's days in **Event setup**.

### TS-CARD-006

**No such lap.** The lap given is more than the rider's class rides that day.

**What to do:** Check the lap on the card, and the class's laps in **Event setup**.

### TS-CARD-007

**That section isn't on this card.** The section given is more than the rider's class rides.

**What to do:** Check the section number.

### TS-CARD-008

**That isn't a time.** A time couldn't be understood.

**What to do:** Type the time as hours and minutes, for example 09:30.

### TS-CARD-009

**That isn't a card profile tScore can use.** The file chosen isn't a `.tscore-card` file, or it's damaged or incomplete, or it was changed after it was saved. The message says what's wrong with it. Nothing was imported.

**What to do:** Ask whoever sent it to share the card type again from tScore (**Card types**, then **Share…** on its menu) and send the new file. Open it straight from the email or USB stick, without changing it.

### TS-CARD-010

**That card type is built into tScore.** The file is for a card type that already comes with tScore. A built-in card type is never replaced by a file, so nothing was imported.

**What to do:** Nothing to do: choose the built-in card type. If its readings look wrong, tell the maintainers.

## Results and penalties

### TS-RES-001

**Results are final.** Results have been marked final, so nothing that changes them can be saved.

**What to do:** To correct something, reopen the results on **Results** with a reason, make the change, then mark them final again (see [Results](results.md#reopen-to-correct-something)).

### TS-RES-002

**The results aren't final.** This needs final results, and they are still provisional.

**What to do:** Mark the results final on **Results** first.

### TS-RES-003

**No results yet.** There are no results to mark final, because no cards are in.

**What to do:** Enter the cards first.

### TS-RES-004

**Say why.** Reopening final results needs a reason, so the record shows why they changed.

**What to do:** Type the reason, then choose **Reopen results** again.

### TS-RES-005

**The results changed.** Something changed the results while this was being done, for example on another screen.

**What to do:** Look at the results again, then try again.

### TS-RES-006

**No such revision.** That version of the final results doesn't exist.

**What to do:** Choose a revision from the list on **Results**.

### TS-RES-007

**That penalty is not in force.** The penalty was already removed.

**What to do:** Nothing to do. The list of penalties shows the ones in force.

### TS-RES-008

**Say what the penalty is for.** A penalty with the reason "Other" needs a note, so the results can say what it was for.

**What to do:** Type a short note, then add the penalty again.

## Card labels

### TS-LBL-001

**No labels to print.** With the settings chosen, there are no riders to print labels for.

**What to do:** Check the riders are entered and the classes or numbers chosen include them.

## Series points

### TS-SER-001

**The series needs a name.** A series is saved under its name, so it needs one.

**What to do:** Type a name, for example "Winter Series 2027", then save again.

### TS-SER-002

**That series isn't on this laptop any more.** The series file was deleted or moved while the screen was open.

**What to do:** Go back to **Series points** and choose it again, or make it again.
