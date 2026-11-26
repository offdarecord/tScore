# Series points

Many clubs run their trials as a series, and publish a points tally after each round. tScore
works it out from each round's **final** results, so nobody has to copy results into a
spreadsheet.

## Make a series

1. On Home, choose **Series points**.
2. Type the series name (for example "Winter Series 2027") and choose **Make series**.
3. Under **Rounds**, add each round's event: pick it from **Add a round from your events**, or
   choose **Add from file…** and find its `event.sqlite`. Rounds are numbered by date.

Series are kept in `Documents\tScore\Series`, one small file each. Removing a round or a series
never changes the events themselves.

**Rounds run by other clubs?** When clubs share a series, each round is scored on a different
laptop. See [A series run by several clubs](series-across-clubs.md) for getting every round onto
one laptop for the tally.

## Rules

- **Points for 1st, 2nd, 3rd …**: the usual scale is 25, 22, 20, 18, 16, then 15 down to 1.
  Type your club's scale and choose **Save points**. Places past the end score 0.
- **Rounds that count**: every round, or only each rider's best rounds (for example best 3 of 4).
  With best rounds, the tally shows both the full total and the best-rounds total.
- **Equal totals**: share the place (1, 2, 2, 4), or split them by most round wins, then the
  better result in the latest round.

DNF and No award riders score 0 for the round. A round a rider didn't ride is left blank.
Non-competitive riders take no series points and aren't listed.

Each class has its own tally, matched by class name. Riders are matched by name, so a new
number at a later round doesn't matter. A rider who changes class has a line in each class.

## Which rounds count

Only rounds whose results are **final** count (see [Mark results final](results.md#mark-results-final)).
A round that isn't final yet, or has been reopened for a correction, is listed under **Not
counted yet** until it's marked final again.

## Save the tally to share

Choose **Save PDF…** or **Save CSV…**. Tick **Junior surnames as an initial** to apply that rule
to every round's junior classes, as for round results.
