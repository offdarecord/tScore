import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Teach a card (#107), practised on cards tScore draws: the regional card, taught as if it were a
// club's own. Invented cards only; the run on real cards is #131.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  window = run.window;
});

test.afterEach(async () => {
  await run.app.close();
});

async function accessible(when: string) {
  // Let transitions finish, so colours are measured as shown.
  await window.waitForTimeout(300);
  const axe = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    when,
  ).toEqual([]);
}

/**
 * Where the drawn blank card's corners are in its picture (640 × 900, column 34 px wide, turned
 * 3°), from the regional card: 43 × 173 mm, grid origin 19.06, 15.64 mm, 9.773 mm a unit.
 */
function blankCorners() {
  const px = 34 / 9.773;
  const a = (3 * Math.PI) / 180;
  const up = { x: Math.sin(a), y: -Math.cos(a) };
  const right = { x: -up.y, y: up.x };
  const mid = { x: 0.5 * 640, y: 0.55 * 900 };
  const half = (17 * 0.675 * 9.773) / 2;
  const at = (x: number, y: number) => {
    const dx = (x - 19.06) * px;
    const dy = (y - 15.64 - half) * px;
    return { x: mid.x + right.x * dx + up.x * dy, y: mid.y + right.y * dx + up.y * dy };
  };
  return [at(0, 173), at(43, 173), at(43, 0), at(0, 0)];
}

const status = () => window.getByRole('status').filter({ hasText: /./ }).first();
const next = () => window.getByRole('button', { name: 'Next', exact: true });

test('a club teaches tScore its card on drawn cards, saves it and shares it', async () => {
  await window.getByRole('button', { name: 'Card types' }).click();
  await window.getByRole('button', { name: 'Teach a card…' }).click();
  await expect(window.getByRole('heading', { name: 'Teach a card', level: 2 })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Step 1 of 9: Blank card' })).toBeVisible();
  await expect(next()).toBeDisabled();
  await accessible('Blank card');

  // 1. The blank card, and its corners: three by mouse, the last by keyboard.
  await window.getByRole('button', { name: 'Practise with a drawn card' }).click();
  await expect(status()).toHaveText("Mark the card's top-left corner (1 of 4).");
  const picture = window.getByRole('application', { name: 'Card picture: mark its corners' });
  await expect(picture).toBeFocused();
  const box = await picture.locator('svg').boundingBox();
  if (!box) throw new Error('no picture');
  const scale = Math.min(box.width / 640, box.height / 900);
  const corners = blankCorners();
  for (const p of corners.slice(0, 3)) {
    await window.mouse.click(
      box.x + (box.width - 640 * scale) / 2 + p.x * scale,
      box.y + (box.height - 900 * scale) / 2 + p.y * scale,
    );
  }
  await expect(status()).toHaveText("Mark the card's bottom-left corner (4 of 4).");
  const [, , bottomRight, bottomLeft] = corners as [unknown, unknown, Pt, Pt];
  await moveCross(bottomLeft.x - bottomRight.x, 'ArrowLeft', 'ArrowRight');
  await moveCross(bottomLeft.y - bottomRight.y, 'ArrowUp', 'ArrowDown');
  await window.keyboard.press('Enter');
  await expect(status()).toHaveText("The blank card's corners are marked.");
  await expect(window.getByRole('img', { name: 'The blank card' })).toBeVisible();
  await next().click();

  // 2. Size and rows.
  await expect(window.getByRole('heading', { name: 'Step 2 of 9: Size and rows' })).toBeVisible();
  await expect(window.getByText('The drawn card is 43 mm wide')).toBeVisible();
  await window.getByLabel('Card type name').fill('Example club card');
  await window.getByLabel('Width (mm)').fill('43');
  await window.getByLabel('Height (mm)').fill('173');
  await window.getByLabel('Section rows').fill('16');
  await accessible('Size and rows');
  await next().click();

  // 3. The black column is found, so cards are found by themselves.
  await expect(window.getByText(/found a black section column/)).toBeVisible();
  await expect(window.getByRole('radio', { name: 'By its black section column' })).toBeChecked();
  await accessible('Finding the card');
  await next().click();

  // 4. The columns, drawn over the straightened blank card.
  await expect(
    window.getByRole('img', { name: 'The blank card with the rows and columns drawn on it' }),
  ).toBeVisible();
  await expect(window.getByLabel('Score for column 5')).toHaveValue('5');
  // Two columns for the same score are refused until put right.
  await window.getByLabel('Score for column 5').fill('3');
  await expect(window.getByText('Each column needs its own score')).toBeVisible();
  await expect(next()).toBeDisabled();
  await window.getByLabel('Score for column 5').fill('5');
  await accessible('Columns');
  await next().click();

  // 5, 6. Punched holes, corrected by marking all but one.
  await expect(window.getByRole('radio', { name: 'Punched hole' })).toBeChecked();
  await accessible('Marking');
  await next().click();
  await expect(
    window.getByRole('radio', { name: 'Mark every score but the right one' }),
  ).toBeChecked();
  await next().click();

  // 7. Three marked cards; tScore fills in what it read, the club checks it.
  await expect(window.getByRole('heading', { name: 'Step 7 of 9: Marked cards' })).toBeVisible();
  for (let n = 1; n <= 3; n++) {
    await window.getByRole('button', { name: 'Add a drawn marked card' }).click();
    await expect(status()).toHaveText(`Card ${n} read. Check each row against the card.`);
    if (n < 3) await expect(next()).toBeDisabled();
  }
  await expect(window.getByLabel('Card 3, section 16 really holds')).toHaveValue('none');
  await window.getByRole('button', { name: 'Card 1', exact: true }).click();
  const first = window.getByLabel('Card 1, section 1 really holds');
  const read = await first.inputValue();
  expect(read).toMatch(/^[01235]$/);
  await accessible('Marked cards');
  await next().click();

  // 8. Thresholds proposed from the cards, and how they read them.
  await expect(window.getByRole('heading', { name: 'Step 8 of 9: How it reads' })).toBeVisible();
  await expect(window.getByText(/^tScore proposes a mark threshold of 0\.\d\d/)).toBeVisible();
  await expect(
    window.getByText('48 of 48 rows on 3 cards read right, 0 left to a person, 0 read wrong.'),
  ).toBeVisible();
  // A threshold too high leaves every marked row to a person; the proposal puts it back.
  await window.getByLabel('Mark threshold').fill('0.95');
  await expect(window.getByText(/left to a person/)).not.toContainText(' 0 left to a person');
  await window.getByRole('button', { name: "Use tScore's proposal" }).click();
  await expect(window.getByText(/^48 of 48 rows/)).toBeVisible();
  await accessible('How it reads');

  // A row the club says holds something else isn't read right, and is shown for checking.
  await window.getByRole('button', { name: 'Back' }).click();
  await window.getByRole('button', { name: 'Card 1', exact: true }).click();
  await first.selectOption(read === '5' ? '0' : '5');
  await next().click();
  await expect(window.getByText(/^47 of 48 rows on 3 cards read right/)).toBeVisible();
  await expect(window.getByRole('row', { name: /^1 / }).first()).toContainText(/Wrong|To a person/);
  await window.getByRole('button', { name: 'Back' }).click();
  await first.selectOption(read);
  await next().click();
  await expect(window.getByText(/^48 of 48 rows/)).toBeVisible();
  await next().click();

  // 9. Save: always confirmed by a person, kept with its blank card.
  await expect(window.getByRole('heading', { name: 'Step 9 of 9: Save' })).toBeVisible();
  await expect(window.getByText('example-club-card', { exact: true })).toBeVisible();
  await accessible('Save');
  await window.getByRole('button', { name: 'Save card type' }).click();
  await expect(status()).toHaveText(
    'Saved Example club card. tScore suggests each reading and a person confirms every card.',
  );
  const dir = join(run.userData, 'card-profiles');
  const kept = JSON.parse(readFileSync(join(dir, 'example-club-card.json'), 'utf8')) as {
    trust: string;
    locator: string;
    rows: number;
    grid: { on_card?: unknown };
    thresholds: { tuned_from: { source: string; cards: number; rows: number } };
    blank_image?: string;
  };
  expect(kept.trust).toBe('assisted');
  expect(kept.locator).toBe('black-column');
  expect(kept.rows).toBe(16);
  expect(kept.grid.on_card).toBeDefined();
  expect(kept.thresholds.tuned_from).toMatchObject({ source: 'synthetic', cards: 3, rows: 48 });
  expect(kept.blank_image).toBe('example-club-card.blank.png');
  expect(existsSync(join(dir, 'example-club-card.blank.png'))).toBe(true);

  // Share it with the maintainers, by the same path as any card type.
  await window.getByRole('button', { name: 'Share with the maintainers…' }).click();
  const share = window.getByRole('dialog', { name: 'Share Example club card' });
  await expect(share).toBeVisible();
  await expect(share.getByText('blank.png', { exact: true })).toBeVisible();
  await expect(share.getByLabel('The card type, exactly as it goes in the file')).toContainText(
    '"trust": "assisted"',
  );
  await share.getByRole('button', { name: 'Close' }).first().click();
  await expect(share).toBeHidden();

  await window.getByRole('button', { name: 'Back to card types' }).click();
  await expect(window.getByRole('row', { name: /Example club card/ })).toContainText(
    'You confirm every card',
  );
});

interface Pt {
  x: number;
  y: number;
}

/** Move the corner cross by keyboard: big steps, then small ones with Shift. */
async function moveCross(d: number, less: string, more: string) {
  const step = 0.02 * 900;
  const fine = 0.0025 * 900;
  const key = d < 0 ? less : more;
  const coarse = Math.trunc(Math.abs(d) / step);
  for (let i = 0; i < coarse; i++) await window.keyboard.press(key);
  const small = Math.round((Math.abs(d) - coarse * step) / fine);
  for (let i = 0; i < small; i++) await window.keyboard.press(`Shift+${key}`);
}
