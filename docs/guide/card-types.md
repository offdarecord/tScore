# Card types

tScore reads observers' punched scorecards with the document camera. Each scorecard design is a
**card type**: its size, how many section rows it has, which column stands for which score, and
how tScore reads it. Open **Card types** on the home screen to see the ones this laptop knows.

- **Built into tScore**: card types that come with tScore. Where they've been tested on enough
  cards, tScore saves a clearly read card by itself (**Reads by itself**).
- **Imported on this laptop**: card types from a `.tscore-card` file. tScore suggests each
  card's scores and a person confirms every card (**You confirm every card**), whatever the
  file says. Only card types shipped with tScore are ever trusted to save cards by themselves.

## Import a card type

When another club sends you a `.tscore-card` file (by email or on a USB stick):

1. Open **Card types**, then choose **Import card type…**.
2. Choose the file. tScore checks it, then lists it under **Imported on this laptop**.

Importing a newer file for the same card type replaces the old one. A file that isn't a card
type, or that has been damaged or changed, is refused and nothing changes (see
[TS-CARD-009](errors.md#ts-card-009)). A card type built into tScore can't be replaced by a file
([TS-CARD-010](errors.md#ts-card-010)).

Imported card types are kept in tScore's settings on this laptop, so import the file on each
laptop that reads cards.

## Share your club's card type

If your club's card type isn't built into tScore yet, share it with the tScore maintainers so a
later release builds it in for every club.

1. Open **Card types**, then choose **Share…** next to the card type.
2. Check **What the file holds**: the card type's settings and a picture of a blank card, and
   nothing else. No riders, scores or event details are ever in the file.
3. Optionally type your **Club** and **State**, so the maintainers can credit you.
4. Choose **Save file…** and pick where to save it.
5. Choose **Email it…**. Your own mail app opens with an email to the maintainers already filled
   in. **Attach the saved file yourself**, then send. **Show the file** opens the folder it's in.

tScore never sends anything itself, so you can save the file at the venue and email it later
from home. If you use webmail, choose **Copy address** and paste it into a new email. If you have
a GitHub account, you can use the **New card type** form instead.

> [!TIP]
> Until a release builds your card type in, pass the `.tscore-card` file straight to other clubs:
> they can import it the same way.
