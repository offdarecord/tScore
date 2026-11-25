# Example files (synthetic)

Made-up riders and clubs. They show the **shape** of what a region sends, and what tScore should produce from it. The numbers are internally consistent: 2 classes, 1 day, 3 laps × 4 sections, so the expected results can be checked by hand.

| File                           | Stands in for                                  | Notes                                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entry-list-example.csv`       | Intake item 1, the entry system export         | Deliberately messy, like real exports: a class with text in brackets, an observer row (dropped on import), a duplicate entry (merged), an empty class. A real export also carries columns we never read. Rider numbers aren't in it; tScore assigns 101–103 and 201–203. |
| `event-scores-example.csv`     | Intake item 2, raw scores                      | One row per card (rider × lap). `card_in` is when the card reached the desk. Rider 203 has no lap 3 card: DNF.                                                                                                                                                           |
| `results-expected-example.csv` | Intake item 2, the published results           | What the region published for that event. It shows the rules the ruleset must reproduce.                                                                                                                                                                                 |
| `card-truth-example.csv`       | Intake item 3, the true scores for card photos | One row per photo; `X` = no punch; notes say what's unusual. Becomes the fixture's expected readings.                                                                                                                                                                    |

## The rules these examples exercise

- **Tie-break:** 101 and 102 both total 12. 101 wins on cleans (7 against 6).
- **DNF:** 203 has no position and sits after the finishers.
- **Non-competitive:** 202 (Competitive = N) rode the best score in Novice but is listed after the class with counts only. Their lap scores and total are **left out of the file**, not just hidden.
- **Missed section / correction:** `card-truth-example.csv` shows an inverse correction (card-02) and a missed section (card-03), the two cases the card reader must flag correctly.
