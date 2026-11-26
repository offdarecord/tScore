import {
  Alert,
  Button,
  Code,
  Group,
  List,
  NativeSelect,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { MARKING_STYLE_THRESHOLDS, type CardProfile, type MarkingStyle } from '@tscore/core';
import {
  blankReferenceFromStraight,
  CELL_MM,
  checkThresholds,
  cornersFit,
  evenColumns,
  findColumnOnBlank,
  gridFromColumn,
  practiceCard,
  proposeThresholds,
  readerProfile,
  readTeachCard,
  startingColumns,
  startingGrid,
  straightenCard,
  taughtProfile,
  TEACH_MAX_CARDS,
  TEACH_MIN_CARDS,
  type CardCorners,
  type GreyImage,
  type RgbaImage,
  type RowReading,
  type TaughtCard,
  type TeachAnswer,
  type TeachColumn,
  type TeachGrid,
  type TeachLayout,
  type TeachVerdict,
} from '@tscore/vision';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError, CardProfileInfo } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import { CornerPicker } from '../scan/CornerPicker';
import { CardCapture } from './CardCapture';
import { ShareCardDialog } from './ShareCardDialog';
import {
  cardTypeId,
  columnProblems,
  idClash,
  sizeProblems,
  tunedFrom,
  type LayoutProblem,
} from './teachLogic';
import { greyPng, greyUrl, rgbaUrl } from './teachPictures';

/** A card photographed (or drawn) for the wizard. */
interface Picture {
  readonly frame: RgbaImage;
  readonly url: string;
  readonly drawn: boolean;
  /** For a drawn card: what each row really holds, so practice answers can be checked. */
  readonly corners?: CardCorners;
}

/** A marked card taught to the wizard, and what the club says each row holds. */
interface Marked {
  readonly picture: Picture;
  readonly corners?: CardCorners;
  /** undefined: not said yet. */
  readonly answers: readonly (TeachAnswer | undefined)[];
}

type Rule = CardProfile['correction_rules'];

const STEPS = [
  'blank',
  'size',
  'locator',
  'columns',
  'marking',
  'corrections',
  'cards',
  'thresholds',
  'save',
] as const;
type Step = (typeof STEPS)[number];

const STYLES: readonly MarkingStyle[] = ['punch', 'pen-hole', 'ink'];
const RULES: readonly Rule[] = ['inverse-all-but-one', 'none', 'crossed-out'];

const answerValue = (a: TeachAnswer | undefined) =>
  a === undefined ? '' : a === null ? 'none' : String(a);
const answerFrom = (v: string): TeachAnswer | undefined =>
  v === '' ? undefined : v === 'none' ? null : Number(v);

/**
 * Teach a card (#107): a club describes its own scorecard in about ten minutes, with no code.
 * Photograph a blank card and mark its corners, describe the card, then show tScore a few marked
 * cards and say what they hold; tScore proposes thresholds and shows how it reads them. The card
 * type is saved `assisted` (a person confirms every card) and can be shared with the
 * maintainers.
 */
export function TeachCard({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const step: Step = STEPS[active] ?? 'blank';
  const [status, setStatus] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  // 1. The blank card.
  const [blank, setBlank] = useState<Picture | null>(null);
  const [blankCorners, setBlankCorners] = useState<CardCorners | null>(null);
  const [marking, setMarking] = useState<Picture | null>(null);

  // 2. Its size and rows.
  const [name, setName] = useState('');
  const [width, setWidth] = useState<number | string>('');
  const [height, setHeight] = useState<number | string>('');
  const [rows, setRows] = useState<number | string>('');

  // 3–6. Where the grid is, the columns, and how it's marked.
  const [straight, setStraight] = useState<{ img: GreyImage; url: string } | null>(null);
  const [columnFound, setColumnFound] = useState(false);
  const [analysed, setAnalysed] = useState('');
  const [locator, setLocator] = useState<TeachLayout['locator']>('black-column');
  const [grid, setGrid] = useState<TeachGrid | null>(null);
  const [columns, setColumns] = useState<TeachColumn[]>([]);
  const [cellMm, setCellMm] = useState<number>(CELL_MM.punch);
  const [style, setStyle] = useState<MarkingStyle>('punch');
  const [rule, setRule] = useState<Rule>('inverse-all-but-one');

  // 7–8. Marked cards, and the thresholds.
  const [marked, setMarked] = useState<Marked[]>([]);
  const [shownCard, setShownCard] = useState(0);
  const [thresholds, setThresholds] = useState<{ mark: number; confidence_gap: number } | null>(
    null,
  );

  // 9. Saving.
  const [known, setKnown] = useState<CardProfileInfo[]>([]);
  const [saved, setSaved] = useState<CardProfileInfo | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    void window.tscore.cardProfiles().then((r) => r.ok && setKnown(r.value));
  }, [saved]);

  const say = useCallback((text: string) => setStatus(text), []);
  const card = { width_mm: Number(width), height_mm: Number(height) };
  const rowCount = Number(rows);

  const layout: TeachLayout | null = grid && {
    id: cardTypeId(name),
    name: name.trim(),
    card,
    rows: rowCount,
    locator,
    grid,
    columns,
    cell_mm: cellMm,
    marking_style: style,
    correction_rules: rule,
  };

  // The card type as described so far, read with the marking style's starting thresholds.
  const layoutKey = layout && !columnProblems(layout).length ? JSON.stringify(layout) : '';
  const draft = useMemo(() => {
    if (!layoutKey || !straight) return null;
    try {
      const described = JSON.parse(layoutKey) as TeachLayout;
      const start = MARKING_STYLE_THRESHOLDS[described.marking_style];
      const profile = taughtProfile(described, {
        mark: start.mark,
        confidence_gap: start.confidence_gap,
        tuned_from: { source: 'real', cards: 0, rows: 0, rows_read: 0, wrong_auto_accepts: 0 },
      });
      const reader = readerProfile(profile);
      return {
        profile,
        reader,
        reference: blankReferenceFromStraight(straight.img, profile, reader),
      };
    } catch {
      return null;
    }
  }, [layoutKey, straight]);

  // Each marked card's rows, read against the blank card.
  const readings = useMemo(
    () =>
      marked.map((m) => {
        if (!draft) return null;
        const r = readTeachCard(m.picture.frame, draft.profile, draft.reference, m.corners);
        return r.ok ? r.card.rows : null;
      }),
    [marked, draft],
  );

  const taught = useMemo(
    () =>
      marked.flatMap((m, i): TaughtCard[] => {
        const rs = readings[i];
        if (!rs) return [];
        return [
          { darkness: rs.map((r) => r.darkness), answers: rs.map((_, k) => m.answers[k] ?? null) },
        ];
      }),
    [marked, readings],
  );
  const allAnswered = marked.every((m, i) => {
    const rs = readings[i];
    return !!rs && rs.every((_, k) => m.answers[k] !== undefined);
  });
  const proposal = useMemo(
    () =>
      draft && taught.length >= TEACH_MIN_CARDS
        ? proposeThresholds(taught, draft.reader, style)
        : null,
    [draft, taught, style],
  );
  const chosen = thresholds ?? proposal;
  const check = draft && chosen ? checkThresholds(taught, draft.reader, chosen) : null;

  // ---- Step changes -------------------------------------------------------------------------

  function blankPicture(frame: RgbaImage, drawn: boolean) {
    setError(null);
    const p: Picture = { frame, url: rgbaUrl(frame), drawn };
    setBlank(null);
    setBlankCorners(null);
    setMarking(p);
    say(t('scan.corner1'));
  }

  function blankMarked(corners: CardCorners) {
    if (!marking) return;
    setBlank(marking);
    setBlankCorners(corners);
    setMarking(null);
    setAnalysed('');
    say(t('teach.blankDone'));
  }

  /** After the size: straighten the blank card and look for a black column on it. */
  function analyse(): boolean {
    if (!blank || !blankCorners) return false;
    if (!cornersFit(blankCorners, card, blank.frame)) {
      say(t('teach.cornersDontFitSize'));
      return false;
    }
    const key = JSON.stringify([card, rowCount, blankCorners]);
    if (key === analysed) return true;
    const img = straightenCard(blank.frame, blankCorners, card);
    if (!img) {
      say(t('teach.cantStraighten'));
      return false;
    }
    setStraight({ img, url: greyUrl(img) });
    const pose = findColumnOnBlank(blank.frame, rowCount);
    const fromColumn = pose && gridFromColumn(pose, blankCorners, card);
    if (fromColumn) {
      setColumnFound(true);
      setLocator('black-column');
      setGrid(fromColumn);
      setColumns(startingColumns(fromColumn));
    } else {
      setColumnFound(false);
      setLocator('manual-corners');
      setGrid(startingGrid(card, rowCount));
      setColumns(evenColumns(card));
    }
    setAnalysed(key);
    setThresholds(null);
    return true;
  }

  function markedPicture(frame: RgbaImage, drawn: boolean) {
    setError(null);
    const p: Picture = { frame, url: rgbaUrl(frame), drawn };
    if (locator === 'manual-corners') {
      setMarking(p);
      say(t('scan.corner1'));
      return;
    }
    addMarked(p);
  }

  function addMarked(p: Picture, corners?: CardCorners) {
    if (!draft) return;
    const r = readTeachCard(p.frame, draft.profile, draft.reference, corners);
    if (!r.ok) {
      say(t(`teach.cantRead.${r.reason}`));
      return;
    }
    const answers = r.card.rows.map((row: RowReading) =>
      row.value !== null ? row.value : row.flag === 'NO_PUNCH' ? null : undefined,
    );
    const next = [...marked, { picture: p, ...(corners && { corners }), answers }];
    setMarked(next);
    setShownCard(next.length - 1);
    setThresholds(null);
    const unsure = answers.filter((a) => a === undefined).length;
    say(
      unsure
        ? t('teach.cardAddedUnsure', { n: next.length, count: unsure })
        : t('teach.cardAdded', { n: next.length }),
    );
  }

  function markedCorners(corners: CardCorners) {
    if (!marking || !draft) return;
    if (!cornersFit(corners, card, marking.frame)) {
      say(t('scan.cornersDontFit'));
      return;
    }
    const p = marking;
    setMarking(null);
    addMarked(p, corners);
  }

  function setAnswer(cardIndex: number, row: number, value: TeachAnswer | undefined) {
    setThresholds(null);
    setMarked((all) =>
      all.map((m, i) =>
        i === cardIndex
          ? { ...m, answers: rowsOf(m.answers, rowCount).map((a, k) => (k === row ? value : a)) }
          : m,
      ),
    );
  }

  function removeCard(index: number) {
    setMarked((all) => all.filter((_, i) => i !== index));
    setShownCard(0);
    setThresholds(null);
    say(t('teach.cardRemoved', { n: index + 1 }));
  }

  const id = cardTypeId(name);
  const clash = idClash(id, known);

  async function save() {
    if (!draft || !chosen || !check || !straight) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const drawn = marked.every((m) => m.picture.drawn) && !!blank?.drawn;
    const profile = taughtProfile(layout as TeachLayout, {
      mark: chosen.mark,
      confidence_gap: chosen.confidence_gap,
      tuned_from: tunedFrom(check, drawn, today),
    });
    const r = await window.tscore.saveTaughtCard(profile, await greyPng(straight.img));
    if (!r.ok) return setError(r.error);
    setSaved({ profile: r.value.profile, builtIn: false });
    say(
      t(r.value.replaced ? 'teach.savedReplaced' : 'teach.saved', { name: r.value.profile.name }),
    );
  }

  // ---- What each step needs before Next -----------------------------------------------------

  const sizeIssues: LayoutProblem[] = sizeProblems({ name, card, rows: rowCount });
  const columnIssues: LayoutProblem[] = layout ? columnProblems(layout) : [];
  const canNext: Record<Step, boolean> = {
    blank: !!blank && !!blankCorners && !marking,
    size: sizeIssues.length === 0,
    locator: true,
    columns: columnIssues.length === 0 && !!draft,
    marking: true,
    corrections: true,
    cards:
      !marking &&
      taught.length >= TEACH_MIN_CARDS &&
      taught.length === marked.length &&
      allAnswered,
    thresholds: !!check,
    save: false,
  };

  function next() {
    if (step === 'size' && !analyse()) return;
    setStatus('');
    setActive((a) => Math.min(a + 1, STEPS.length - 1));
  }

  function back() {
    setStatus('');
    setMarking(null);
    setActive((a) => Math.max(a - 1, 0));
  }

  const scoreOptions = [
    { value: '', label: t('teach.answerChoose') },
    { value: 'none', label: t('teach.answerNone') },
    ...columns.map((c) => ({ value: String(c.score), label: String(c.score) })),
  ];

  // ---- Screens ------------------------------------------------------------------------------

  const picker = marking && (
    <CornerPicker
      image={marking.url}
      width={marking.frame.width}
      height={marking.frame.height}
      onPlaced={(n) => say(t(`scan.corner${Math.min(n + 1, 4)}` as 'scan.corner1'))}
      onDone={step === 'blank' ? blankMarked : markedCorners}
      onCancel={() => {
        setMarking(null);
        say(t('teach.cornersStopped'));
      }}
    />
  );

  const screens: Record<Step, ReactNode> = {
    blank: (
      <Stack gap="sm">
        <Text>{t('teach.blankIntro')}</Text>
        {!marking && (
          <CardCapture
            takeLabel={t('teach.takeBlank')}
            drawLabel={t('teach.drawBlank')}
            draw={() => practiceCard(0).frame}
            onPicture={blankPicture}
            onStatus={say}
          />
        )}
        {picker}
        {blank && blankCorners && !marking && (
          <Group align="flex-start">
            <img
              src={blank.url}
              alt={t('teach.blankAlt')}
              style={{ maxHeight: 320, maxWidth: 240, objectFit: 'contain' }}
            />
            <Stack gap="xs">
              <Text>{t('teach.blankDone')}</Text>
              <Button variant="default" onClick={() => blankPicture(blank.frame, blank.drawn)}>
                {t('teach.markAgain')}
              </Button>
            </Stack>
          </Group>
        )}
      </Stack>
    ),
    size: (
      <Stack gap="sm" maw={520}>
        <Text>{t('teach.sizeIntro')}</Text>
        {blank?.drawn && (
          <Alert color="blue" title={t('teach.practiceTitle')}>
            {t('teach.practiceSize')}
          </Alert>
        )}
        <TextInput
          label={t('teach.name')}
          description={t('teach.nameHelp')}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Group grow>
          <NumberInput
            label={t('teach.width')}
            min={1}
            max={300}
            decimalScale={1}
            value={width}
            onChange={setWidth}
          />
          <NumberInput
            label={t('teach.height')}
            min={1}
            max={400}
            decimalScale={1}
            value={height}
            onChange={setHeight}
          />
        </Group>
        <NumberInput
          label={t('teach.rows')}
          description={t('teach.rowsHelp')}
          min={1}
          max={60}
          allowDecimal={false}
          value={rows}
          onChange={setRows}
        />
        <Problems list={sizeIssues} shown={name !== '' || width !== '' || rows !== ''} />
      </Stack>
    ),
    locator: (
      <Stack gap="sm" maw={620}>
        <Text>{t(columnFound ? 'teach.columnFound' : 'teach.columnNotFound')}</Text>
        <Radio.Group
          label={t('teach.locator')}
          value={locator}
          onChange={(v) => setLocator(v as TeachLayout['locator'])}
        >
          <Stack gap="xs" mt="xs">
            <Radio
              value="black-column"
              label={t('teach.locatorColumn')}
              description={t(
                columnFound ? 'teach.locatorColumnHelp' : 'teach.locatorColumnMissing',
              )}
              disabled={!columnFound}
            />
            <Radio
              value="manual-corners"
              label={t('teach.locatorCorners')}
              description={t('teach.locatorCornersHelp')}
            />
          </Stack>
        </Radio.Group>
      </Stack>
    ),
    columns: grid && straight && (
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <CardGuide
          url={straight.url}
          card={card}
          rows={rowCount}
          grid={grid}
          columns={columns}
          cellMm={cellMm}
          label={t('teach.guideAlt')}
        />
        <Stack gap="sm" maw={460}>
          <Text>{t('teach.columnsIntro')}</Text>
          <Group grow>
            <NumberInput
              label={t('teach.bottom')}
              min={0}
              max={card.height_mm}
              step={0.5}
              decimalScale={2}
              value={grid.origin_y_mm}
              onChange={(v) => setGrid({ ...grid, origin_y_mm: Number(v) })}
            />
            <NumberInput
              label={t('teach.rowHeight')}
              min={0.5}
              max={card.height_mm}
              step={0.1}
              decimalScale={2}
              value={grid.row_mm}
              onChange={(v) => setGrid({ ...grid, row_mm: Number(v) })}
            />
          </Group>
          <NumberInput
            label={t('teach.cellSize')}
            description={t('teach.cellSizeHelp')}
            min={0.3}
            max={10}
            step={0.1}
            decimalScale={2}
            value={cellMm}
            onChange={(v) => setCellMm(Number(v))}
          />
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('teach.column')}</Table.Th>
                <Table.Th>{t('teach.score')}</Table.Th>
                <Table.Th>{t('teach.across')}</Table.Th>
                <Table.Th>
                  <VisuallyHidden>{t('teach.actions')}</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {columns.map((c, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={t('teach.scoreOf', { n: i + 1 })}
                      min={0}
                      max={99}
                      allowDecimal={false}
                      value={c.score}
                      w={80}
                      onChange={(v) =>
                        setColumns(
                          columns.map((x, k) => (k === i ? { ...c, score: Number(v) } : x)),
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={t('teach.acrossOf', { n: i + 1 })}
                      min={0}
                      max={card.width_mm}
                      step={0.5}
                      decimalScale={1}
                      value={c.x_mm}
                      w={110}
                      onChange={(v) =>
                        setColumns(columns.map((x, k) => (k === i ? { ...c, x_mm: Number(v) } : x)))
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      aria-label={t('teach.removeColumnN', { n: i + 1 })}
                      onClick={() => setColumns(columns.filter((_, k) => k !== i))}
                    >
                      {t('teach.removeColumn')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group>
            <Button
              variant="default"
              size="xs"
              disabled={columns.length >= 10}
              onClick={() =>
                setColumns([
                  ...columns,
                  {
                    score: Math.max(-1, ...columns.map((c) => c.score)) + 1,
                    x_mm: Math.round(card.width_mm * 5) / 10,
                  },
                ])
              }
            >
              {t('teach.addColumn')}
            </Button>
          </Group>
          <Problems list={columnIssues} shown />
        </Stack>
      </Group>
    ),
    marking: (
      <Radio.Group
        label={t('teach.marking')}
        description={t('teach.markingHelp')}
        value={style}
        onChange={(v) => {
          const s = v as MarkingStyle;
          setStyle(s);
          setCellMm(CELL_MM[s]);
          setThresholds(null);
        }}
        maw={620}
      >
        <Stack gap="xs" mt="xs">
          {STYLES.map((s) => (
            <Radio
              key={s}
              value={s}
              label={t(`teach.style.${s}`)}
              description={t(`teach.styleHelp.${s}`)}
            />
          ))}
        </Stack>
      </Radio.Group>
    ),
    corrections: (
      <Radio.Group
        label={t('teach.corrections')}
        description={t('teach.correctionsHelp')}
        value={rule}
        onChange={(v) => setRule(v as Rule)}
        maw={620}
      >
        <Stack gap="xs" mt="xs">
          {RULES.map((r) => (
            <Radio
              key={r}
              value={r}
              label={t(`teach.rule.${r}`)}
              description={t(`teach.ruleHelp.${r}`)}
            />
          ))}
        </Stack>
      </Radio.Group>
    ),
    cards: (
      <Stack gap="sm">
        <Text>{t('teach.cardsIntro', { min: TEACH_MIN_CARDS, max: TEACH_MAX_CARDS })}</Text>
        {!marking && marked.length < TEACH_MAX_CARDS && (
          <CardCapture
            takeLabel={t('teach.takeMarked')}
            drawLabel={t('teach.drawMarked')}
            draw={() =>
              practiceCard(marked.length + 1, style, rule === 'inverse-all-but-one').frame
            }
            onPicture={markedPicture}
            onStatus={say}
          />
        )}
        {picker}
        {marked.length > 0 && (
          <CardChooser count={marked.length} shown={shownCard} onShow={setShownCard} />
        )}
        {marked[shownCard] && (
          <Group align="flex-start" gap="lg" wrap="nowrap">
            <img
              src={marked[shownCard].picture.url}
              alt={t('teach.markedAlt', { n: shownCard + 1 })}
              style={{ maxHeight: 420, maxWidth: 300, objectFit: 'contain' }}
            />
            <Stack gap="xs">
              <Text size="sm">{t('teach.answersIntro')}</Text>
              {readings[shownCard] ? (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('teach.section')}</Table.Th>
                      <Table.Th>{t('teach.holds')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {readings[shownCard].map((_, k) => (
                      <Table.Tr key={k}>
                        <Table.Td>{k + 1}</Table.Td>
                        <Table.Td>
                          <NativeSelect
                            aria-label={t('teach.holdsOf', { card: shownCard + 1, section: k + 1 })}
                            size="xs"
                            data={scoreOptions}
                            value={answerValue(marked[shownCard]?.answers[k])}
                            onChange={(e) =>
                              setAnswer(shownCard, k, answerFrom(e.currentTarget.value))
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="red">{t('teach.cardUnreadable')}</Text>
              )}
              <Button variant="default" size="xs" onClick={() => removeCard(shownCard)}>
                {t('teach.removeCardN', { n: shownCard + 1 })}
              </Button>
            </Stack>
          </Group>
        )}
        {marked.length > 0 && marked.length < TEACH_MIN_CARDS && (
          <Text size="sm">{t('teach.moreCards', { count: TEACH_MIN_CARDS - marked.length })}</Text>
        )}
        {marked.length >= TEACH_MIN_CARDS && !allAnswered && (
          <Text size="sm">{t('teach.answerAll')}</Text>
        )}
      </Stack>
    ),
    thresholds: check && chosen && proposal && (
      <Stack gap="sm">
        <Text>{t('teach.thresholdsIntro')}</Text>
        <Group align="flex-end">
          <NumberInput
            label={t('teach.markThreshold')}
            description={t('teach.markThresholdHelp')}
            min={0.05}
            max={0.95}
            step={0.01}
            decimalScale={2}
            value={chosen.mark}
            onChange={(v) => setThresholds({ ...chosen, mark: Number(v) })}
            w={220}
          />
          <NumberInput
            label={t('teach.gap')}
            description={t('teach.gapHelp')}
            min={0}
            max={0.9}
            step={0.01}
            decimalScale={2}
            value={chosen.confidence_gap}
            onChange={(v) => setThresholds({ ...chosen, confidence_gap: Number(v) })}
            w={220}
          />
          <Button variant="default" disabled={!thresholds} onClick={() => setThresholds(null)}>
            {t('teach.useProposal')}
          </Button>
        </Group>
        <Text size="sm">
          {t('teach.proposed', {
            mark: proposal.mark.toFixed(2),
            gap: proposal.confidence_gap.toFixed(2),
          })}
        </Text>
        <Alert
          color={check.wrong ? 'red' : check.toPerson ? 'yellow' : 'green'}
          title={t('teach.howItReads')}
        >
          <Text>
            {t('teach.checkSummary', {
              right: check.right,
              rows: check.rows,
              person: check.toPerson,
              wrong: check.wrong,
              cards: check.cards,
            })}
          </Text>
          <Text size="sm">
            {t('teach.leastMargin', { margin: Math.round(check.leastMargin * 100) })}
          </Text>
          {check.wrong > 0 && <Text size="sm">{t('teach.someWrong')}</Text>}
        </Alert>
        <CardChooser count={check.readings.length} shown={shownCard} onShow={setShownCard} />
        {check.readings[shownCard] && (
          <Table maw={620}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('teach.section')}</Table.Th>
                <Table.Th>{t('teach.holds')}</Table.Th>
                <Table.Th>{t('teach.read')}</Table.Th>
                <Table.Th>{t('teach.result')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {check.readings[shownCard].map((row) => (
                <Table.Tr key={row.reading.section}>
                  <Table.Td>{row.reading.section}</Table.Td>
                  <Table.Td>{row.answer === null ? t('teach.answerNone') : row.answer}</Table.Td>
                  <Table.Td>
                    {row.reading.value !== null
                      ? row.reading.value
                      : t(`teach.flag.${row.reading.flag ?? 'LOW_CONF'}`)}
                  </Table.Td>
                  <Table.Td>
                    <Verdict verdict={row.verdict} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    ),
    save: (
      <Stack gap="sm" maw={620}>
        <Text>{t('teach.saveIntro')}</Text>
        <TextInput
          label={t('teach.name')}
          maxLength={120}
          value={name}
          disabled={!!saved}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Text size="sm">
          {t('teach.idIs')} <Code>{id}</Code>
        </Text>
        {clash === 'built-in' && !saved && <Alert color="red">{t('teach.clashBuiltIn')}</Alert>}
        {clash === 'replaces' && !saved && <Alert color="yellow">{t('teach.clashReplaces')}</Alert>}
        <List size="sm">
          <List.Item>{t('teach.saveAssisted')}</List.Item>
          <List.Item>{t('teach.savePrivate')}</List.Item>
        </List>
        {!saved ? (
          <Group>
            <Button
              onClick={() => void save()}
              disabled={clash === 'built-in' || !name.trim() || !check}
            >
              {t('teach.save')}
            </Button>
          </Group>
        ) : (
          <Stack gap="xs">
            <Text>{t('teach.shareIntro')}</Text>
            <Group>
              <Button onClick={() => setSharing(true)}>{t('teach.share')}</Button>
              <Button variant="default" onClick={onBack}>
                {t('teach.done')}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    ),
  };

  return (
    <Stack gap="lg" maw={1100}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{t('teach.title')}</Title>
          <Text c="dimmed">{t('teach.intro')}</Text>
        </div>
        <Button variant="subtle" color="gray" onClick={onBack}>
          {t('teach.cardTypes')}
        </Button>
      </Group>
      <Stepper
        active={active}
        onStepClick={(s) => s < active && !saved && (setMarking(null), setActive(s))}
        allowNextStepsSelect={false}
        size="xs"
      >
        {STEPS.map((s) => (
          <Stepper.Step key={s} label={t(`teach.step.${s}`)} />
        ))}
      </Stepper>
      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="teach-step">
        <Title order={3} size="h4" id="teach-step" mb="sm">
          {t('teach.stepOf', { n: active + 1, of: STEPS.length, name: t(`teach.step.${step}`) })}
        </Title>
        {screens[step]}
      </Paper>
      <Text role="status" aria-live="polite" mih="1.5em">
        {status}
      </Text>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {!saved && (
        <Group>
          <Button variant="default" onClick={back} disabled={active === 0}>
            {t('teach.back')}
          </Button>
          {step !== 'save' && (
            <Button onClick={next} disabled={!canNext[step]}>
              {t('teach.next')}
            </Button>
          )}
        </Group>
      )}
      {saved && sharing && (
        <ShareCardDialog card={saved} opened onClose={() => setSharing(false)} />
      )}
    </Stack>
  );
}

/** A card's answers, one per row. */
function rowsOf<T>(xs: readonly T[], n: number): (T | undefined)[] {
  return Array.from({ length: Math.max(n, xs.length) }, (_, i) => xs[i]);
}

function Problems({ list, shown }: { list: readonly LayoutProblem[]; shown: boolean }) {
  const { t } = useTranslation();
  if (!shown || list.length === 0) return null;
  return (
    <List size="sm" c="red">
      {list.map((p) => (
        <List.Item key={p}>{t(p)}</List.Item>
      ))}
    </List>
  );
}

function CardChooser(props: { count: number; shown: number; onShow: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" role="group" aria-label={t('teach.cards')}>
      {Array.from({ length: props.count }, (_, i) => (
        <Button
          key={i}
          size="xs"
          variant={i === props.shown ? 'filled' : 'default'}
          aria-pressed={i === props.shown}
          onClick={() => props.onShow(i)}
        >
          {t('teach.cardN', { n: i + 1 })}
        </Button>
      ))}
    </Group>
  );
}

function Verdict({ verdict }: { verdict: TeachVerdict }) {
  const { t } = useTranslation();
  // In words, not colour alone; a row read wrong stands out in bold.
  return (
    <Text size="sm" fw={verdict === 'right' ? 400 : 700}>
      {t(`teach.verdict.${verdict}`)}
    </Text>
  );
}

/** The straightened blank card with the grid drawn on it, so the club can check the guides. */
function CardGuide(props: {
  url: string;
  card: { width_mm: number; height_mm: number };
  rows: number;
  grid: TeachGrid;
  columns: readonly TeachColumn[];
  cellMm: number;
  label: string;
}) {
  const { card, grid, rows, columns, cellMm } = props;
  const W = card.width_mm;
  const H = card.height_mm;
  const y = (mm: number) => H - mm;
  const line = Math.max(W, H) / 400;
  const lines = Array.from({ length: rows + 1 }, (_, k) => grid.origin_y_mm + k * grid.row_mm);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={props.label}
      style={{ height: 560, maxWidth: 360, flex: 'none', background: '#000' }}
    >
      <image href={props.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
      {lines.map((mm, k) => (
        <line key={k} x1={0} x2={W} y1={y(mm)} y2={y(mm)} stroke="#1c7ed6" strokeWidth={line} />
      ))}
      {columns.map((c, i) => (
        <g key={i}>
          <line x1={c.x_mm} x2={c.x_mm} y1={0} y2={H} stroke="#f08c00" strokeWidth={line} />
          <text
            x={c.x_mm}
            y={y(grid.origin_y_mm + rows * grid.row_mm) - line * 4}
            fontSize={Math.max(2.5, W / 14)}
            fill="#f08c00"
            textAnchor="middle"
            fontWeight={700}
          >
            {c.score}
          </text>
          {Array.from({ length: rows }, (_, k) => (
            <circle
              key={k}
              cx={c.x_mm}
              cy={y(grid.origin_y_mm + (k + 0.5) * grid.row_mm)}
              r={cellMm}
              fill="none"
              stroke="#e03131"
              strokeWidth={line}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
