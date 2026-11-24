# Event day

Run the [Pre-event check](before-the-event.md#pre-event-check) when you arrive. Then, as riders
hand in their cards, enter each one. The screens under **On the day** are for this.

> [!NOTE]
> Scanning cards with a document camera (the **Scan desk** and **Review queue**) comes in a later
> version. Until then, type cards in on **Manual entry**.

## Manual entry

Type a card in by hand. It's quick with the keyboard alone:

1. Type the rider's **number** (or part of their name) and press **Enter**. Their name, class
   and lap show, with the next lap they haven't handed in.
2. Check the **Day** and **Lap**. **Card in at** is the laptop's time: change it only for a card
   that came in earlier.
3. Type the **scores**, section 1 onwards. With single-digit scores, type one digit per section
   (`0010352000`); spaces are ignored. The lap total and the **Card preview** fill in as you
   type: hold the preview against the card in your hand, and the punches should sit in the same
   places.
4. Press **Enter** (**Save card**). tScore says "Saved rider 12 lap 2: total 7. Next card." and
   is ready for the next one.

**Esc** (**Clear**) empties the form without saving.

If that lap is already in, tScore says so: choose **Edit that card instead** to change it.

### Correct a card

Earlier cards are listed beside the form (all of the rider's laps once a rider is chosen).
**Edit** loads a card into the form; change the scores and choose **Save change**. The old
scores, who changed them and when are kept in the audit log. If results are already final,
reopen them first (see [Results](results.md#reopen-to-correct-something)).

### Penalties

A 90-second section-time breach is just a 5 on the card. For anything else, pick the rider and
choose **Add penalty…**: the **Points**, the **Reason** (time, dissent, outside assistance,
course cutting, or other with a note saying what for), and the lap if it belongs to one.
Penalties are added to the rider's total on the results. Remove one from **Penalties for this
rider**; adding and removing are both logged.

## Late entries

Add a rider who turns up on the day with **Late entry…** on **Riders** (see
[Riders](before-the-event.md#riders)), then print their labels: on **Card labels**, choose
**Only labels not printed yet**.

## DNF and DNS

On **Riders**, choose **Change** and set **Riding status** to **Did not finish** (DNF) or **Did
not start** (DNS). You can also mark a rider DNF from **Progress** or **Still on course**, with
**Undo** straight after. Every change is logged.

## Progress

Which cards are in, for every rider and lap, updated as cards are saved and every 30 seconds.

- The counts across the top: **Cards in**, **Overdue**, **Still on course**, and **DNF / DNS**.
- Show **All riders**, only **Missing laps**, or only **Overdue** riders.
- Each lap shows its total once the card is in. **Late** means overdue: the rider is later than
  their class's average lap by more than the margin set in Event setup. Overdue riders are
  listed with **Mark DNF**, but tScore never marks anyone DNF by itself: the desk decides.

## Still on course

Who is still out, to close the event down safely. A rider is on course from the start until
their final lap card is in, or they're marked DNF or DNS. It's worked out only from the cards
in and those marks.

- Riders still on course are listed first, with their last card in and how long since.
- When **Everyone is accounted for**, choose **Close the event: check and mark results final**
  to go to [Results](results.md).

> [!IMPORTANT]
> Before closing, make sure every rider shown on course really is back. Ask the clerk of the
> course about anyone you can't account for.
