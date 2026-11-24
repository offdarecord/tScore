# 0015. Write card labels as a Word document, built by hand with fflate and qrcode-generator

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

Before an event the desk prints one sticky label per rider, per day, per lap that the rider's
class rides, and sticks each one on a blank scorecard. Each label carries the rider number, the
lap, the name, the class and a QR code that the scan desk reads. Clubs already use Avery L7651
sheets (65 labels, 38.1 × 21.2 mm) on these cards.

The project owner decided that labels are a **Word document for now**, printed from Microsoft
Word at 100%. That is how clubs work today. PDF viewers often default to "fit to page", which
shrinks the page by about 3% and misaligns every label. A Python prototype written during
planning was measured in Word to within 0.1 mm across and 0.2 mm down. It found two quirks:

- Word lines up the first cell's _text_ with the page margin, so the table must be indented by
  that cell's left padding.
- Word calls the file corrupt if table properties are out of schema order.

tScore needs to write a `.docx` (a zip of XML files) and QR code images, offline, in the
main process.

## Decision

- **Build the document by hand** in `packages/core/src/labels/docx.ts`, copying the prototype's
  measured structure. Each sheet is one fixed-layout table. Every label column is a cell, rows
  are exact heights, and the file is in Word 2010 compatibility mode (the mode the prototype was
  measured in).
- **Zip it with [fflate](https://github.com/101arrowz/fflate)** (MIT, no dependencies). The same
  library compresses the PNG images.
- **Make QR codes with
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)** (MIT, no
  dependencies), at medium error correction. tScore draws the PNG itself from the module grid.
- **Sheet geometry is data:** `presets/label-templates/`, validated by the new
  `tscore.label_template/1` schema. L7651 is the default.
- **Text fitting is estimated** from Arial's character widths, because Word does the layout. A
  long name becomes "F. SURNAME", then a smaller size, then is cut short. It never runs under the
  QR code.
- **The event file records each label printed** (migration 3, `label_print`), so late entries
  and added laps can be printed on their own. The printer's X/Y offset belongs to the laptop,
  not the event, so it's kept in the app's settings folder.

## Consequences

- The same labels always produce byte-identical files, so tests can compare them.
- Two small runtime dependencies are added to `@tscore/core`, both MIT. Neither has
  dependencies of its own.
- The text-fitting estimate could be wrong for unusual characters. Unknown characters count as
  wide, so the error leans towards shortening a name rather than overflowing.
- LibreOffice and Google Docs haven't been tested and may shift the layout. The app tells the
  desk to use Microsoft Word.
- A physical test print on L7651 stock is still owed. So far only Word's own rendering has been
  measured: the first label at 4.70 mm across and 10.71 mm down, against the template's 4.7 and
  10.7.

## Alternatives considered

- **The `docx` npm package:** larger, and it hides the table XML that the measured alignment
  depends on.
- **PDF or direct printing from the app:** the planned later option if Word causes support
  calls. It was not chosen now, because of the owner's decision and the fit-to-page risk.
- **The `qrcode` npm package:** more dependencies, and aimed at canvas and terminal output.
