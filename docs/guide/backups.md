# Backups and restore

## What tScore does for you

- **Saving.** Every change is saved the moment it's made. There is no Save button, and nothing
  is lost if the laptop goes flat or tScore closes.
- **Automatic backups.** Within five minutes of a change, and when the event closes, tScore
  copies the event into the event's `backups` folder. The newest 20 are kept.
- **A second copy.** If you choose a USB stick or another drive, every backup is copied there
  too, so a dead or stolen laptop doesn't take the event with it.

You can see all of this in **Saving and backup** on the **Event setup** screen.

## Choose a second copy

1. Plug in a USB stick.
2. On **Event setup**, under **Saving and backup**, choose **Choose second copy…** and pick a
   folder on the stick. tScore makes a backup there straight away.
3. Leave the stick in for the whole event.

The second copy belongs to the laptop, not the event: it stays set for your next event.
**Change second copy…** picks another place, and **No second copy** turns it off.

If the stick is taken out, the [Pre-event check](before-the-event.md#pre-event-check) and the
**Saving and backup** box say so. Scoring still works, but there's no second copy until it's
back.

**Back up now** makes a backup at once, for example just before you change something big.

## Restore an event from a backup

Use this if the event file is damaged, the laptop has died, or you need to go back to an
earlier point.

1. On Home, choose **Restore from backup…**.
2. Pick a backup: from the event's `backups` folder, or from the USB stick. Backups are named by
   the time they were made.
3. tScore opens it as a **new event folder** named "… restored …". Nothing existing is changed
   or overwritten.

Check the restored event (Riders, Progress and Results), then carry on scoring in it. Any cards
entered after that backup was made need entering again.

> [!TIP]
> On a new laptop: install tScore, plug in the USB stick, and use **Restore from backup…** with
> the newest backup on the stick.

## Move an event to another laptop

Use this when scoring has to carry on somewhere else: the desk laptop is failing, or another
person is taking over.

1. On **Event setup**, under **Saving and backup**, choose **Save a copy for another laptop…**
   and save the file to a USB stick. It holds the whole event, with its card photos, in one
   `.tscore` file. tScore checks the file once it's saved.
2. On the other laptop, choose **Open event file…** on Home and pick the `.tscore` file.
   tScore checks the copy is complete and undamaged, then opens it as a new event folder.
   Nothing already on that laptop is changed.
3. Carry on scoring **on that laptop only**. Cards entered on the first laptop after the copy
   was saved won't be in it.

Backups and saved results aren't in the file: the other laptop makes its own.
