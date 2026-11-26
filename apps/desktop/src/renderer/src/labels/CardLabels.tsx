import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import i18next from '../i18n';
import type {
  AppError,
  LabelLayoutChoice,
  LabelPreview,
  LabelRequest,
  LabelsView,
  OpenEvent,
} from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

const LAYOUTS = [
  { value: 'auto', label: 'labels.auto' },
  { value: 'row-per-rider', label: 'labels.rowPerRider' },
  { value: 'packed', label: 'labels.packed' },
  { value: 'by-lap', label: 'labels.byLap' },
] as const satisfies readonly { value: LabelLayoutChoice; label: string }[];

const LAYOUT_WORDS = {
  'row-per-rider': 'labels.usingRowPerRider',
  packed: 'labels.usingPacked',
  'by-lap': 'labels.usingByLap',
} as const satisfies Record<LabelsView['layout'], string>;

const SKIP_WORDS = {
  not_scored: 'labels.notScored',
  dns: 'labels.dns',
  no_laps: 'labels.noLaps',
  unknown_class: 'labels.unknownClass',
} as const;

type Which = 'all' | 'unprinted' | 'rider';

/** Card labels: one sticky label per rider for each lap their class rides (architecture §8.1). */
export function CardLabels({ event }: { readonly event: OpenEvent }) {
  const [layout, setLayout] = useState<LabelLayoutChoice>(event.setup.labels?.layout ?? 'auto');
  const [start, setStart] = useState(1);
  const [qr, setQr] = useState(event.setup.labels?.qr ?? true);
  // Minders are left out unless the desk says otherwise (scorer review, 25 Nov 2026).
  const [leaveOutMinders, setLeaveOutMinders] = useState(true);
  const minders = !leaveOutMinders;
  const [which, setWhich] = useState<Which>('all');
  const [rider, setRider] = useState<number | ''>('');
  const [view, setView] = useState<LabelsView | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request: LabelRequest | null =
    which === 'rider'
      ? typeof rider === 'number'
        ? { layout, start, qr, minders, which: { rider } }
        : null
      : { layout, start, qr, minders, which };

  const key = JSON.stringify(request);
  useEffect(() => {
    if (!request) return;
    let live = true;
    void window.tscore.labels(request).then((r) => {
      if (!live) return;
      if (r.ok) {
        setView(r.value);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `request`
  }, [key, event]);

  async function save() {
    if (!request) return;
    setBusy(true);
    setSaved(null);
    setError(null);
    const r = await window.tscore.saveLabels(request);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else if (r.value) {
      setSaved(i18next.t('labels.saved', { labels: r.value.labels, path: r.value.path }));
      const again = await window.tscore.labels(request);
      if (again.ok) setView(again.value);
    }
  }

  async function saveTestPage() {
    setSaved(null);
    setError(null);
    const r = await window.tscore.saveLabelTestPage();
    if (!r.ok) setError(r.error);
    else if (r.value) setSaved(i18next.t('labels.testSaved', { path: r.value }));
  }

  async function open() {
    const r = await window.tscore.openExport();
    if (!r.ok) setError(r.error);
  }

  const perSheet = view?.template.perSheet ?? 65;

  return (
    <Stack gap="lg" maw={1300}>
      <div>
        <Title order={2}>{i18next.t('labels.title')}</Title>
        <Text c="dimmed">{i18next.t('labels.intro')}</Text>
      </div>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {saved && (
        <Alert color="green" role="status" withCloseButton onClose={() => setSaved(null)}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>{saved}</span>
            <Button variant="default" size="xs" onClick={() => void open()}>
              {i18next.t('labels.openWord')}
            </Button>
          </Group>
        </Alert>
      )}

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="md" w={380} maw="100%">
          <Paper
            withBorder
            radius="md"
            p="md"
            component="section"
            aria-label={i18next.t('labels.whatToPrint')}
          >
            <Stack gap="md">
              <div>
                <Text fw={600}>{i18next.t('labels.sheets')}</Text>
                <Text size="sm">{view?.template.name ?? ' '}</Text>
              </div>
              <Radio.Group
                label={i18next.t('labels.which')}
                value={which}
                onChange={(v) => setWhich(v as Which)}
              >
                <Stack gap={6} mt={4}>
                  <Radio value="all" label={i18next.t('labels.every')} />
                  <Radio
                    value="unprinted"
                    label={
                      view
                        ? i18next.t('labels.unprintedN', { count: view.notPrinted })
                        : i18next.t('labels.unprinted')
                    }
                    description={i18next.t('labels.unprintedHelp')}
                  />
                  <Radio value="rider" label={i18next.t('labels.reprint')} />
                </Stack>
              </Radio.Group>
              {which === 'rider' && (
                <NumberInput
                  label={i18next.t('labels.riderNumber')}
                  required
                  min={1}
                  max={9999}
                  allowDecimal={false}
                  value={rider}
                  onChange={(v) => setRider(typeof v === 'number' ? v : '')}
                />
              )}
              <NativeSelect
                label={i18next.t('labels.layout')}
                data={LAYOUTS.map((l) => ({ value: l.value, label: i18next.t(l.label) }))}
                value={layout}
                onChange={(e) => setLayout(e.currentTarget.value as LabelLayoutChoice)}
                {...(layout === 'auto' &&
                  view && { description: i18next.t(LAYOUT_WORDS[view.layout]) })}
              />
              <NumberInput
                label={i18next.t('labels.startAt')}
                description={i18next.t('labels.startAtHelp')}
                min={1}
                max={perSheet}
                allowDecimal={false}
                value={start}
                onChange={(v) =>
                  setStart(typeof v === 'number' ? Math.min(Math.max(v, 1), perSheet) : 1)
                }
              />
              <Checkbox
                label={i18next.t('labels.qr')}
                description={i18next.t('labels.qrHelp')}
                checked={qr}
                onChange={(e) => setQr(e.currentTarget.checked)}
              />
              <Checkbox
                label={i18next.t('labels.minders')}
                description={i18next.t('labels.mindersHelp')}
                checked={leaveOutMinders}
                onChange={(e) => setLeaveOutMinders(e.currentTarget.checked)}
              />
              {view && <Summary view={view} />}
              <Button
                onClick={() => void save()}
                loading={busy}
                disabled={!request || !view || view.labels === 0}
              >
                {i18next.t('labels.saveWord')}
              </Button>
              <Text size="sm">{i18next.t('labels.printHelp')}</Text>
            </Stack>
          </Paper>
          {view && (
            <Alignment view={view} onTestPage={() => void saveTestPage()} onSaved={setView} />
          )}
        </Stack>

        <Paper
          withBorder
          radius="md"
          p="md"
          component="section"
          aria-label={i18next.t('labels.preview')}
          style={{ flex: '1 1 520px', minWidth: 0 }}
        >
          <Stack gap="sm">
            <Title order={3} size="h4">
              {i18next.t('labels.preview')}
            </Title>
            {view && <Sheet view={view} />}
            <Text size="sm" c="dimmed">
              {i18next.t('labels.previewHelp')}
            </Text>
          </Stack>
        </Paper>
      </Group>
    </Stack>
  );
}

function Summary({ view }: { view: LabelsView }) {
  const [open, setOpen] = useState(false);
  const minders = view.skipped.filter((s) => s.reason === 'not_scored').length;
  const others = view.skipped.filter((s) => s.reason !== 'not_scored');
  return (
    <Stack gap={6}>
      <Alert color="blue" variant="light" p="sm" role="none">
        <Text fw={700}>
          {i18next.t('labels.summary', {
            labels: view.labels,
            sheets: i18next.t('labels.sheetCount', { count: view.sheets }),
            riders: i18next.t('labels.riderCount', { count: view.riders }),
          })}
        </Text>
        {minders > 0 && <Text size="sm">{i18next.t('labels.noMinders')}</Text>}
        {view.printed > 0 && (
          <Text size="sm">
            {i18next.t('labels.printedBefore', {
              printed: view.printed,
              notPrinted: view.notPrinted,
            })}
          </Text>
        )}
      </Alert>
      {others.length > 0 && (
        <Alert color="yellow" variant="light" p="sm" role="none">
          <Group justify="space-between" gap="xs">
            <Text size="sm" fw={600}>
              {i18next.t('labels.noLabels', { count: others.length })}
            </Text>
            <Button variant="subtle" size="compact-sm" onClick={() => setOpen((o) => !o)}>
              {open ? i18next.t('labels.hide') : i18next.t('labels.showWho')}
            </Button>
          </Group>
          {open && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {others.map((s) => (
                <li key={s.number}>
                  <Text size="sm">
                    {i18next.t('labels.skipped', {
                      number: s.number,
                      name: s.name,
                      class: s.className || i18next.t('labels.noClass'),
                      why: i18next.t(SKIP_WORDS[s.reason]),
                    })}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </Stack>
  );
}

function Alignment(props: {
  view: LabelsView;
  onTestPage: () => void;
  onSaved: (view: LabelsView) => void;
}) {
  const { view } = props;
  const [x, setX] = useState<number | ''>(view.offset.x);
  const [y, setY] = useState<number | ''>(view.offset.y);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const changed = x !== view.offset.x || y !== view.offset.y;

  async function saveOffset() {
    setNote(null);
    setProblem(null);
    const r = await window.tscore.setLabelOffset({
      x: typeof x === 'number' ? x : 0,
      y: typeof y === 'number' ? y : 0,
    });
    if (!r.ok) setProblem(r.error.message);
    else {
      props.onSaved({ ...view, offset: r.value });
      setNote(i18next.t('labels.alignSaved'));
    }
  }

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      component="section"
      aria-label={i18next.t('labels.alignment')}
    >
      <Stack gap="sm">
        <Title order={3} size="h5">
          {i18next.t('labels.alignment')}
        </Title>
        <Text size="sm">{i18next.t('labels.alignHelp')}</Text>
        <Button variant="default" onClick={props.onTestPage}>
          {i18next.t('labels.saveTest')}
        </Button>
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <NumberInput
            label={i18next.t('labels.right')}
            description={i18next.t('labels.rightHelp')}
            min={-5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={x}
            onChange={(v) => setX(typeof v === 'number' ? v : '')}
          />
          <NumberInput
            label={i18next.t('labels.down')}
            description={i18next.t('labels.downHelp')}
            min={-5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={y}
            onChange={(v) => setY(typeof v === 'number' ? v : '')}
          />
        </Group>
        <Button variant="default" disabled={!changed} onClick={() => void saveOffset()}>
          {i18next.t('labels.saveOffset')}
        </Button>
        {note && (
          <Text size="sm" role="status">
            {note}
          </Text>
        )}
        {problem && (
          <Text size="sm" c="light-dark(#a51111, #ffa8a8)" role="alert">
            {problem}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/** Millimetres to preview pixels. */
const PX = 4;

function Sheet({ view }: { view: LabelsView }) {
  const cols = view.template.columns;
  // Show the rows in use (whole rows), not the empty bottom of the sheet.
  const used = view.firstSheet.length;
  const rows = Math.max(1, Math.ceil(used / cols));
  const positions = Array.from({ length: rows * cols }, (_, i) =>
    i < used ? (view.firstSheet[i] ?? null) : undefined,
  );
  const firstUsed = view.firstSheet.findIndex((s) => s !== null);
  return (
    <div
      role="region"
      aria-label={i18next.t('labels.scrolls')}
      tabIndex={0}
      style={{ overflowX: 'auto' }}
    >
      {view.labels === 0 ? (
        <Text c="dimmed">{i18next.t('labels.none')}</Text>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${38.1 * PX}px)`,
            gap: `0 ${2.5 * PX}px`,
            width: 'max-content',
          }}
        >
          {positions.map((p, i) =>
            p ? (
              <Label key={i} label={p} days={view.days} />
            ) : (
              <div
                key={i}
                aria-hidden="true"
                style={{
                  width: 38.1 * PX,
                  height: 21.2 * PX,
                  boxSizing: 'border-box',
                  border: '1px dashed #adb5bd',
                  background: p === null && i < firstUsed ? '#e9ecef' : '#fff',
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Label({ label, days }: { label: LabelPreview; days: number }) {
  const describe =
    days > 1
      ? i18next.t('labels.describeDay', { number: label.number, day: label.day, lap: label.lap })
      : i18next.t('labels.describe', { number: label.number, lap: label.lap });
  const pt = (n: number) => `${(n * 25.4 * PX) / 72}px`;
  return (
    <div
      role="img"
      aria-label={describe}
      style={{
        width: 38.1 * PX,
        height: 21.2 * PX,
        boxSizing: 'border-box',
        border: '1px dashed #adb5bd',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
        background: '#fff',
      }}
    >
      {label.qr.length > 0 && <Qr rows={label.qr} />}
      <div style={{ paddingLeft: 0.8 * PX, minWidth: 0, lineHeight: 1.15 }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: pt(17), fontWeight: 700 }}>{label.number}</span>
          <span style={{ fontSize: pt(8.5), fontWeight: 700 }}> {label.lapText}</span>
        </div>
        <div style={{ fontSize: pt(label.small ? 5.5 : 6.5), whiteSpace: 'nowrap' }}>
          {label.name}
        </div>
        <div style={{ fontSize: pt(6), color: '#404040', whiteSpace: 'nowrap' }}>
          {label.classText}
        </div>
      </div>
    </div>
  );
}

function Qr({ rows }: { rows: readonly string[] }) {
  const n = rows.length;
  const path = rows
    .flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <div style={{ width: 15 * PX, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
      <svg
        width={13 * PX}
        height={13 * PX}
        viewBox={`-1 -1 ${n + 2} ${n + 2}`}
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
    </div>
  );
}
