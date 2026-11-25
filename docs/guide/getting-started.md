# Getting started

## Install tScore

1. Download `tScore-Setup-<version>.exe` from the
   [latest release](https://github.com/offdarecord/tScore/releases/latest).
2. Run it. tScore installs for you only (no administrator needed) and starts.
3. If Windows shows **Windows protected your PC**, choose **More info**, then **Run anyway**.
   This shows until the installer is signed.

Install and try tScore at home, with internet, well before the event. On the day it needs no
internet at all.

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
