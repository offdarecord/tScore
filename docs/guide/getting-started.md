# Getting started

## Install tScore

1. Download `tScore-Setup-<version>.exe` from the
   [latest release](https://github.com/offdarecord/tScore/releases/latest).
2. Run it. tScore installs for you only (no administrator needed) and starts.
3. If Windows shows **Windows protected your PC**, choose **More info**, then **Run anyway**.
   This shows until the installer is signed.

### On a Mac (beta)

tScore for Mac is a beta: it's tested on Macs, but less used than the Windows version. It isn't
signed by Apple yet, so macOS asks you to confirm it the first time.

1. Download from the [latest release](https://github.com/offdarecord/tScore/releases/latest):
   `tScore-<version>-mac-arm64.dmg` for a Mac with Apple silicon (M1 or later), or
   `tScore-<version>-mac-x64.dmg` for an older Intel Mac. (Apple menu → **About This Mac** says which.)
2. Open the `.dmg` and drag **tScore** into **Applications**.
3. Open tScore from Applications. macOS says it can't check it for malicious software: choose
   **Done** (not Move to Bin).
4. Open **System Settings → Privacy & Security**, scroll down to **Security**, and choose
   **Open Anyway** next to "tScore was blocked". Confirm with your password or Touch ID, then
   **Open Anyway** again. (Right-click → Open no longer does this on macOS 15 and later.)
5. The first time you scan cards, allow tScore to use the camera.

macOS remembers your choice, so this is only the first time. The Mac version doesn't update
itself yet: download each new version and drag it into Applications again. Your events are
kept, in **Documents → tScore**.

Install and try tScore at home, with internet, well before the event. On the day it needs no
internet at all.

## What you need

| Item            | What                                                                                                                                                                 | Approx. cost (Nov 2026)   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Laptop          | Windows 10 or 11, 64-bit. Or a Mac (beta) with a recent macOS.                                                                                                       | The club's own            |
| Document camera | A USB document camera on a rigid stand, looking straight down at the desk (see below).                                                                               | A$140–200                 |
| Card labels     | Avery **L7651** / J8651 (Officeworks PPS78651): A4, 65 per sheet, 38.1 × 21.2 mm. Printed at 100% (actual size).                                                     | One pack does many events |
| Printer         | Any A4 printer that takes label sheets.                                                                                                                              | The club's own            |
| Black mat       | An A4 sheet of **matte** black EVA foam or black card, under the camera. Punched holes show black against it, so tScore can read them. Not shiny: glare hides holes. | A$5–10                    |

The scan desk comes to about **A$150–220** on top of the laptop. The camera is only for the
**Scan desk**: without one, type cards in on **Manual entry**.

### Choosing a document camera

We're still trying cameras at real events before recommending particular models. For now, any
camera that meets these needs should work:

- **Plug and play over USB:** it shows up in the Windows Camera app with no driver, app, account
  or internet.
- **On a rigid stand**, looking straight down from about 25–40 cm, seeing at least one whole card
  plus a margin (about 10 × 18 cm). Handheld, clip-on and gooseneck cameras wobble and don't work.
- **Full HD (1920 × 1080) video or better**, at 15 frames per second or more. 8 MP models give
  extra margin.
- **A built-in adjustable LED light**, or a small USB LED bar beside it: tents are dim or patchy.
- **Focus that settles** quickly and doesn't keep hunting between cards.
- **Powered from the laptop's USB**, with no mains adapter.

Avoid sheet-feed scanners (wet, muddy, punched cards jam them), Wi-Fi or phone-app cameras, and
HDMI-only presenters.

Being tried, not yet recommended: INSWAN INS-1 (built-in light), IPEVO V4K (add a USB LED),
INSWAN INS-2, IPEVO DO-CAM.

### When the camera arrives: a 15-minute check

1. Plug it in. It appears in the Windows **Camera** app with nothing to install.
2. Put a card on the black mat. The whole card is in view, with a margin, and the label's QR code
   is sharp.
3. Punched holes look clearly black, with no glare from the light.
4. Swap cards a few times. Focus settles within about a second.
5. Then rehearse a whole event with the [Test trial kit](test-trial.md): it checks what tScore
   reads against what you punched.

## Updates

When the laptop is online and no event is open, tScore checks for a new version as it starts.
It downloads it and installs it the next time tScore closes. It never updates during an event.

## Find your way around

- **Home** lists your recent events. From here: **New event**, **Open event file…** and
  **Restore from backup…**.
- With an event open, the list on the left has the screens in the order you need them: **Before
  the event** (Pre-event check, Event setup, Riders, Card labels), then **On the day** (Scan
  desk, Manual entry, Review queue, Progress, Still on course, Results). **← All events** goes back to Home.
- **Help** (or **F1**) at the top opens this guide beside the screen you're on.
- **Light / Dark / Match Windows** at the top sets the colours. Light is clearest in daylight;
  Dark is easier on the eyes in a dim clubroom or trailer. The choice stays on this laptop.
  Printouts, PDFs and labels are always light.
- Grey buttons that say "Coming in a later version" are features not built yet.
- **About → Suggest a feature** asks a few questions about an idea, then lets you email, copy
  or save it. It works without internet.

## Your first event

1. On Home, choose **New event**.
2. Fill in the event, its classes and laps (see [Event setup](before-the-event.md#event-setup)),
   then **Create event**.
3. Import the entry list on **Riders** (see
   [Import the entry list](before-the-event.md#import-the-entry-list)).
4. Print the card labels (see [Card labels](before-the-event.md#card-labels)).

## Where your events are kept

Each event has its own folder in `Documents\tScore`, named with its date and event code. The
event is one file in it, `event.sqlite`, saved as each change is made: there is no **Save**
button, and nothing is lost if the laptop goes flat.

Backups go in the event's `backups` folder, and to a USB stick if you choose one. See
[Backups and restore](backups.md).

To move an event to another laptop, see
[Move an event to another laptop](backups.md#move-an-event-to-another-laptop).

## Manage events: tidy up old events

Card photos take most of the space. After a season, **Manage events** on the home screen
lists every event on this laptop with the space its card photos and everything else use, whether
its results are final, and when it last reached the second backup place (USB). Tick events, then:

- **Remove card scans…** shrinks each card photo to a small copy. Riders, every score, the audit
  log, results and backups stay, and results can still be reopened. If a result is questioned
  later, you'll only have the small copy to look at, so mark results final first.
- **Delete event…** moves the whole event folder to the Windows **Recycle Bin**, where it can be
  put back until the bin is emptied. Type the event's code to confirm. **Save a copy first…**
  keeps the whole event as one file. Backups on a USB stick aren't touched.
- **Keep** stops tScore offering that event for tidying.

The event that's open can't be tidied until it's closed. When events are over a month old,
the home screen offers them once; **Remind me later** asks again in 30 days. It never asks on an
event day. Each recent event's **⋯** menu also has **Show in folder** and the same tidy-up
choices.
