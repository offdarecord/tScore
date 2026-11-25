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
  the event** (Pre-event check, Event setup, Riders, Card labels), then **On the day** (Manual
  entry, Progress, Still on course, Results). **← All events** goes back to Home.
- **Help** (or **F1**) at the top opens this guide beside the screen you're on.
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

To move an event to another laptop, copy its whole folder, then use **Open event file…** there.
