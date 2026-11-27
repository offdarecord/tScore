# Before the event

Do these at home in the week before the event, in this order. Each step is a screen in the
**Before the event** list on the left.

## Event setup

Everything else (labels, cards, results) follows from this page. Make a new event with **New
event** on Home; change it later on **Event setup**.

**Event**

- **Event name**, and **Event code**: a short code made from the name. It goes in each card
  label's QR code, so set it before printing labels.
- **Club**, and the number of **Days**.
- **Scorecard**: the card your club uses.
- **First rider number**: where numbering starts when the entry list is imported.
- **Date** of each day, and when **Lap 1 starts**. Riders with their own start time keep it.
- **Type of trial**: a normal trial (lowest total wins) or a gate trial (highest total wins).
- **Overdue after (minutes)**: how long past their class's average lap a rider can be before
  [Progress](event-day.md#progress) shows them as overdue. Overdue never marks anyone DNF.

**Classes**

One row per class: its name, and its **Sections per lap** and **Laps** for each day. Tick **Junior class** for junior classes: the results you share can
show those riders' surnames as an initial (see
[Saving results to share](results.md#saving-results-to-share)).

- Set **Laps** to 0 for a class that isn't scored, such as minders. They are still entered, but
  get no labels or scores.
- **Add class** adds a row. A class with riders can't be removed or renamed: move its riders
  first.
- Once riders are in, the table shows how many riders and labels each class has.

Choose **Create event** (or **Save changes**). If something is missing, a red box lists each
problem, and the box concerned is marked.

### Sections and officials

Optional. Under **Sections and officials**, give each section a short name or place ("Creek bed")
and the observer or observers, for each day, and add other officials such as the Clerk of
Course. When any names are entered, the results PDF ends with **Thanks to our observers and
officials**, listing them. Untick **Thank the observers and officials…** to leave it out. The
names are kept in the event file and never written to tScore's log.

### Logos

Under **Logos** on **Event setup**, choose the event (or club) logo and add up to 8 sponsor
logos. The event logo goes beside the event name on the results PDF and the big screen; sponsor
logos go at the end of the PDF, under "Supported by", and along the bottom of the big screen.

Logos must be PNG or JPEG pictures, up to 1 MB each. They're kept in the event file, so backups
and a copy moved to another laptop have them too.

## Import the entry list

On **Riders**, choose **Import from entry list…** and pick the export from your entry system.
tScore reads **Entryplace** and **Ridernet** exports as they come; don't edit them in Excel
first. For any other source, copy the riders into a [tScore rider list](#tscore-rider-list)
first.

Nothing is saved until you choose **Import**. The import screen asks only what tScore can't
decide itself:

- **Classes.** Most class names match automatically (**Show matches** lists them). For a name
  that isn't one of the event's classes, choose which class those riders ride, or **Leave these
  riders out**. Tick **Keep for future events** to remember the answer.
- **Entered more than once.** Often a double entry nobody cleaned up; sometimes a rider really
  does ride a second class. Choose **Only** one class, or the class **with** a second class.
- **Rider numbers.** tScore numbers riders in class order, then by surname, from the **First
  rider number**. If the file has its own numbers and they're all usable, it keeps them.

The side panel shows what came from the file, and what was **Not imported**: dates of birth,
addresses, phone numbers, medical and emergency details stay in the entry system.

> [!TIP]
> If more entries arrive, import the new export again. Riders already in the event are left as
> they are, and only the new ones are added, with new numbers.

### tScore rider list

For an entry system tScore doesn't read, or a list typed up by hand. It's a spreadsheet saved
as **CSV UTF-8**, with one rider per row and these headings in the first row, in any order:

| Heading              | Needed?  | Example      | Notes                                              |
| -------------------- | -------- | ------------ | -------------------------------------------------- |
| `Given name`         | Required | Avery        |                                                    |
| `Family name`        | Required | Stone        |                                                    |
| `Class`              | Required | Trial 4 Plus | The event's class name                             |
| `Club`               | Optional | Example MCC  |                                                    |
| `Licence`            | Optional | 123456       | Spots a rider entered twice, and on a later import |
| `Number`             | Optional | 42           | Kept when every rider has a different number       |
| `Competition status` | Optional | NC           | `NC` = non-competitive, `NA` = No award            |
| `Machine`            | Optional | Beta Evo 300 | Make and model                                     |

For example:

```csv
Given name,Family name,Class,Club,Licence,Number,Competition status,Machine
Avery,Stone,Trial 1,Example MCC,100001,,,Beta Evo 300
Drew,Field,Trial 2,Sample Trials Club,100004,,NC,Sherco ST 300
```

The easy way: on **Riders**, choose **Save a sample rider list…**. It saves a list of ten
invented riders in the default classes, with no internet needed. Open it in Excel, replace the
riders with yours, then **File → Save As** and choose **CSV UTF-8 (Comma delimited)**. Plain
"CSV" can garble names with accents.

The [full rider-list reference](https://github.com/offdarecord/tScore/blob/main/docs/interop/rider-list.md)
on GitHub has the details.

## Riders

**Riders** lists everyone entered. Type in **Find** to search by number or name.

- **Change** a rider's name, club, machine, class, **Second class**, **Competition status** or
  **Riding status** (DNS or DNF). Every change is logged.
- **Late entry…** adds a rider. They get the next free number; numbers already given never
  change, and numbers of riders who withdraw are never reused.
- If a rider rides a second class, use **Change** and set **Second class**: they keep one
  number. Don't add them again.

**Competition status**

| Status                   | On the results                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| **Competitive**          | Placed in their class.                                                 |
| **No award** (NA)        | Scored and ranked among themselves after the class, never placed.      |
| **Non-competitive** (NC) | Listed after the class with their counts only; scores are never shown. |

After a name change or late entry, tScore says which labels to print or reprint.

## Card labels

One sticky label per rider for each lap their class rides. It goes on the card's header, above
the grid, so the desk can see whose card it is and which lap.

1. Choose **Which labels**: **Every rider**, **Only labels not printed yet** (late entries and
   laps added since the last print), or **One rider (reprint)**.
2. Choose the **Layout**, and **Start at label** to use up a sheet that's already started.
3. Keep **QR code on each label** ticked: the scan desk will read the rider and lap from it.
4. **Leave out minders** is ticked: minders aren't scored. Untick it to print their labels too.
5. Choose **Save Word document…**, then **Open in Word**, and print at **100% (actual size)** on
   the label sheets.

The preview shows each sheet. Dashed outlines show the label edges and don't print; grey labels
are skipped.

**Printer alignment (once per printer).** Choose **Save alignment test page…**, print it on
plain paper, hold it against a label sheet up to the light, and measure how far the outlines
are off. Type that in **Move right (mm)** and **Move down (mm)** and **Save offset**. It's saved
for this laptop.

## Pre-event check

Run **Pre-event check** when you arrive at the venue, before the first card comes in. It
checks:

- **Event setup** is complete, with the days, classes and lap 1 start time.
- **Riders** are entered, all in classes the setup has.
- **Card labels** are all printed.
- **Clock**: the laptop's date is an event day. Check its time too: lap times and "overdue"
  depend on it.
- **Backups**: a second copy is chosen, and the USB stick is plugged in.

Each item is ticked, marked **Look at this** or **Fix this**, with a button to the screen that
fixes it. Choose **Check again** after fixing.
