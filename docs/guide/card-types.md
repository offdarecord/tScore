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

## Teach tScore your card

If your club's card isn't built into tScore and no other club has sent you a `.tscore-card` file,
teach tScore your card yourself. It takes about ten minutes and needs a blank card, 5 to 10
marked cards (invented scores are fine), a ruler and the document camera on its black mat.

Open **Card types**, then choose **Teach a card…**. The wizard has nine short steps; **Back**
goes to an earlier one at any time.

1. **Blank card.** Lay a blank card on the mat, header at the top, and choose **Take a picture
   of the blank card**. Mark its four corners: click each in turn, starting top-left and going
   round clockwise, or move the cross with the arrow keys and press Enter at each corner.
2. **Size and rows.** Type a name for the card type, the card's width and height in millimetres
   (measured with a ruler) and how many section rows it has.
3. **Finding the card.** If the card has a solid black column down the middle, tScore finds each
   card by itself. Otherwise the desk marks each card's four corners when it's read.
4. **Columns.** The blank card is shown straightened, with guides drawn on it: the rows in blue,
   each score's column in orange and the circle read in each cell in red. Change the numbers
   until the guides sit on your card's rows and score boxes, and set the score each column
   stands for. A card needs 3 to 10 score columns.
5. **Marking.** How observers mark a score: a punched hole, a hole made with a pen, or ink.
6. **Corrections.** How observers correct a mistake: by marking every score but the right one,
   not at all, or by crossing out the wrong mark.
7. **Marked cards.** Show tScore at least 3 marked cards, one at a time; 5 to 10 is better, with
   a corrected row or two. tScore reads each card and fills in what it read: check every row
   against the card and fix anything wrong, choosing **No mark** for an empty row.
8. **How it reads.** tScore proposes its reading settings (the **mark threshold** and the
   **confidence gap**) from your cards, then shows how many rows it read right, how many it left
   to a person and how many it read wrong, card by card. You can change the settings and see
   the results change; **Use tScore's proposal** puts them back.
9. **Save.** Choose **Save card type**. It's listed under **Imported on this laptop**.

A card type you teach is always read with help: tScore suggests each card's scores and a person
confirms every card. Only the blank card's picture is kept with it; the marked cards are never
saved or shared.

After saving, choose **Share with the maintainers…** to save a `.tscore-card` file and email it
to the tScore maintainers, as in [Share your club's card type](#share-your-clubs-card-type), so
a later release builds your card in for every club.

> [!TIP]
> To try the wizard without a camera, choose **Practise with a drawn card** and **Add a drawn
> marked card**: tScore draws the regional card (43 × 173 mm, 16 rows) for you to teach.

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
