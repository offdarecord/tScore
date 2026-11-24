# Importing riders

tScore imports the riders for an event from the entry list (**Riders → Import from entry
list…**). It recognises the file from its column headings, so there are no settings to choose.

| Entry system      | File                                    | How tScore recognises it                                     |
| ----------------- | --------------------------------------- | ------------------------------------------------------------ |
| **Entryplace**    | The `.xlsx` export (sheet `Entry List`) | Columns `Entry Form Reference`, `Entry Group`, `Competitive` |
| **Ridernet**      | The `eventRiders-….xls` export          | Columns `RidernetID`, `Event_Class_Name`, `Event_Role`       |
| **Anything else** | A tScore rider list (below)             | Columns `Given name`, `Family name`, `Class`                 |

The rules for each are data, in [`presets/import-mappings/`](../../presets/import-mappings/),
checked against [`tscore.import_mapping/1`](../../schemas/tscore.import_mapping.v1.schema.json).

## What is read, and what isn't

tScore reads **only** these columns: name, class, club, machine (make and model), licence or
member number, and the columns that say whether an entry is a rider and whether they're
competitive. Every other column (dates of birth, addresses, phone numbers, email, medical,
emergency contacts, VIN and engine numbers, payments) is dropped as the file is read. It is never saved in the event, written to
the log, or shown on screen.

Rows that aren't riders are skipped and counted: observers (Entryplace), crew, minders and
withdrawn entries (Ridernet). Numbers riders type into Ridernet's `Riding_Number` are ignored:
tScore numbers riders itself, in class order, then by surname, from the event's first rider
number.

## Machine

- **Entryplace:** the `Machine` column.
- **Ridernet:** `Bike_Make` and `Bike_Model` from the rider's profile, joined ("Beta" +
  "Evo 300"). Riders don't always keep their profile bike up to date, so the desk can change
  it on the Riders screen.
- **tScore rider list:** the optional `Machine` column.

The machine is for the desk only. It isn't printed on labels or published in results.

## Competition statuses

- **Entryplace:** `Competitive = N` → non-competitive (NC).
- **Ridernet:** a one-event recreational licence (`Licence_Type = OREC`) → NC. Every class is
  competitive, whatever its name; any other rider is marked NC or No award on the Riders
  screen.

## Class names

A class name in the entry list is matched to the event's classes by, in order: the same name;
a name saved for this event; the entry system's known names; the name with `(…)` removed and
`4+` read as `4 Plus`. Anything else is asked about on the import screen, and the answer can
be kept in the event's setup for next time.

## The tScore rider list (CSV)

For entry systems tScore doesn't know, save the list as **CSV UTF-8** with these headings
(any order; the first three are required):

| Heading              | Example      | Notes                                                   |
| -------------------- | ------------ | ------------------------------------------------------- |
| `Given name`         | Avery        |                                                         |
| `Family name`        | Stone        |                                                         |
| `Class`              | Trial 4 Plus | The event's class name                                  |
| `Club`               | Example MCC  | Optional                                                |
| `Licence`            | 123456       | Optional. Spots a rider entered twice, and on re-import |
| `Number`             | 42           | Optional. Kept when every rider has a different number  |
| `Competition status` | NC           | Optional. `NC` = non-competitive, `NA` = No award       |
| `Machine`            | Beta Evo 300 | Optional. Make and model; the desk can change it later  |

```csv
Number,Given name,Family name,Class,Club,Licence,Competition status,Machine
1,Avery,Stone,Trial 1,Example MCC,123456,,Beta Evo 300
2,Blake,River,Trial 4 Plus,Example MCC,234567,NC,
```

## Importing again

Importing a later copy of the entry list adds only the people who aren't in the event yet
(matched by licence number, or by name). Riders already entered keep their number, class and
competition status.
