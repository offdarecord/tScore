# A tour of tScore

What tScore looks like at each step of a club trial. The pictures use an invented event: the
riders, clubs and scores are made up. They're made by `npm run screenshots` from the real app,
so they show the current version.

## Before the event

### Event setup

Name, date and the classes with their sections and laps. Help sits under each box. Changes are
saved as they're made, with automatic backups.

![Event setup: event name, date, start time, and a table of classes with sections and laps](media/event-setup.png)

### Import the entry list

Export the entry list from Ridernet or Entryplace and import it. tScore recognises the file,
shows what it found and asks only about anything unclear. It keeps only what scoring needs.

![Import review: thirteen riders found in four classes, with an Import button](media/import-review.png)

### Riders

Everyone entered, by class and number, with late entries and name or machine changes at the desk.

![The rider list for the demo event, by class, with numbers and clubs](media/riders.png)

### Card labels

Print a label for every rider's card for every lap, with a QR code the scanner reads, on standard
label sheets (Word document, so any printer works).

![Card labels: a label sheet preview with rider name, class, lap and a QR code on each label](media/card-labels.png)

### Pre-event check

One screen that says whether the event is ready: classes, riders, labels, backups.

![Pre-event check: a list of checks marked OK or Look at this](media/pre-event-check.png)

## On the day

### Manual entry

Type a card in with the keyboard alone: number, Enter, the scores as one string of digits,
Enter. The card drawing fills in as you type, to hold against the card in your hand.

![Manual entry: rider 3 with five scores typed and a drawing of the card filling in beside it](media/manual-entry.png)

### Progress

Which cards are in for every rider and lap, and who is overdue.

![Progress: cards in, overdue riders and those still on course, with a grid of riders and laps](media/progress.png)

### Still on course

Who hasn't brought their last card in, for the Clerk of Course at the end of the day.

![Still on course: riders out on the course with their last card in](media/still-on-course.png)

## Results

Results build up as cards come in, marked provisional until every card is in. Save them as a PDF
to print or post, or CSV for a spreadsheet. Mark them final when they're checked; a correction
afterwards is a new numbered revision.

![Results: Trial 1 ranked, with lap totals, totals and counts of 0s to 5s, marked provisional](media/results.png)

## Everything stays on the laptop

![Home: the recent events list, with New event, Open event file and Restore from backup](media/home.png)

tScore needs no internet at the venue. Each event is one folder in Documents, saved as each change
is made, with automatic backups and an optional second copy on a USB stick.
