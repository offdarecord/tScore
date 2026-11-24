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
import type {
  AppError,
  LabelLayoutChoice,
  LabelPreview,
  LabelRequest,
  LabelsView,
  OpenEvent,
} from '../../../shared/ipc';

const LAYOUTS: { value: LabelLayoutChoice; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'row-per-rider', label: 'One rider per row' },
  { value: 'packed', label: 'Packed (fewest sheets)' },
  { value: 'by-lap', label: 'Grouped by lap' },
];

const LAYOUT_WORDS: Record<LabelsView['layout'], string> = {
  'row-per-rider': 'one rider per row',
  packed: 'packed',
  'by-lap': 'grouped by lap',
};

const SKIP_WORDS = {
  not_scored: "isn't scored (minders)",
  dns: 'is marked DNS',
  no_laps: 'has no laps in the event setup',
  unknown_class: "isn't in the event setup",
} as const;

type Which = 'all' | 'unprinted' | 'rider';

/** Card labels: one sticky label per rider for each lap their class rides (architecture §8.1). */
export function CardLabels({ event }: { readonly event: OpenEvent }) {
  const [layout, setLayout] = useState<LabelLayoutChoice>(event.setup.labels?.layout ?? 'auto');
  const [start, setStart] = useState(1);
  const [qr, setQr] = useState(event.setup.labels?.qr ?? true);
  const [which, setWhich] = useState<Which>('all');
  const [rider, setRider] = useState<number | ''>('');
  const [view, setView] = useState<LabelsView | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request: LabelRequest | null =
    which === 'rider'
      ? typeof rider === 'number'
        ? { layout, start, qr, which: { rider } }
        : null
      : { layout, start, qr, which };

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
      setSaved(`${r.value.labels} labels saved to ${r.value.path}`);
      const again = await window.tscore.labels(request);
      if (again.ok) setView(again.value);
    }
  }

  async function saveTestPage() {
    setSaved(null);
    setError(null);
    const r = await window.tscore.saveLabelTestPage();
    if (!r.ok) setError(r.error);
    else if (r.value) setSaved(`Alignment test page saved to ${r.value}`);
  }

  async function open() {
    const r = await window.tscore.openExport();
    if (!r.ok) setError(r.error);
  }

  const perSheet = view?.template.perSheet ?? 65;

  return (
    <Stack gap="lg" maw={1300}>
      <div>
        <Title order={2}>Card labels</Title>
        <Text c="dimmed">
          One sticky label per rider for each lap their class rides. Stick it on the card&apos;s
          header, above the grid.
        </Text>
      </div>

      {error && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setError(null)}>
          {error.message}{' '}
          <Text span c="dimmed" size="sm">
            ({error.code})
          </Text>
        </Alert>
      )}
      {saved && (
        <Alert color="green" role="status" withCloseButton onClose={() => setSaved(null)}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>{saved}</span>
            <Button variant="default" size="xs" onClick={() => void open()}>
              Open in Word
            </Button>
          </Group>
        </Alert>
      )}

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="md" w={380} maw="100%">
          <Paper withBorder radius="md" p="md" component="section" aria-label="What to print">
            <Stack gap="md">
              <div>
                <Text fw={600}>Label sheets</Text>
                <Text size="sm">{view?.template.name ?? ' '}</Text>
              </div>
              <Radio.Group
                label="Which labels"
                value={which}
                onChange={(v) => setWhich(v as Which)}
              >
                <Stack gap={6} mt={4}>
                  <Radio value="all" label="Every rider" />
                  <Radio
                    value="unprinted"
                    label={`Only labels not printed yet${view ? ` (${view.notPrinted})` : ''}`}
                    description="Late entries, and laps added since the last print"
                  />
                  <Radio value="rider" label="One rider (reprint)" />
                </Stack>
              </Radio.Group>
              {which === 'rider' && (
                <NumberInput
                  label="Rider number"
                  min={1}
                  max={9999}
                  allowDecimal={false}
                  value={rider}
                  onChange={(v) => setRider(typeof v === 'number' ? v : '')}
                />
              )}
              <NativeSelect
                label="Layout"
                data={LAYOUTS}
                value={layout}
                onChange={(e) => setLayout(e.currentTarget.value as LabelLayoutChoice)}
                {...(layout === 'auto' &&
                  view && { description: `Using ${LAYOUT_WORDS[view.layout]}` })}
              />
              <NumberInput
                label="Start at label"
                description="Use up a sheet that's already been started"
                min={1}
                max={perSheet}
                allowDecimal={false}
                value={start}
                onChange={(v) =>
                  setStart(typeof v === 'number' ? Math.min(Math.max(v, 1), perSheet) : 1)
                }
              />
              <Checkbox
                label="QR code on each label"
                description="The scan desk reads the rider and lap from it"
                checked={qr}
                onChange={(e) => setQr(e.currentTarget.checked)}
              />
              {view && <Summary view={view} />}
              <Button
                onClick={() => void save()}
                loading={busy}
                disabled={!request || !view || view.labels === 0}
              >
                Save Word document…
              </Button>
              <Text size="sm">
                Open it in Microsoft Word and print at 100% (actual size), on the label sheets.
              </Text>
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
          aria-label="Sheet 1 preview"
          style={{ flex: '1 1 520px', minWidth: 0 }}
        >
          <Stack gap="sm">
            <Title order={3} size="h4">
              Sheet 1 preview
            </Title>
            {view && <Sheet view={view} />}
            <Text size="sm" c="dimmed">
              Dashed outlines show the label edges; they don&apos;t print. Grey labels are skipped.
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
          {view.labels} labels on {view.sheets} {view.sheets === 1 ? 'sheet' : 'sheets'} for{' '}
          {view.riders} {view.riders === 1 ? 'rider' : 'riders'}.
        </Text>
        {minders > 0 && <Text size="sm">Minders don&apos;t get labels.</Text>}
        {view.printed > 0 && (
          <Text size="sm">
            {view.printed} labels printed before; {view.notPrinted} not printed yet.
          </Text>
        )}
      </Alert>
      {others.length > 0 && (
        <Alert color="yellow" variant="light" p="sm" role="none">
          <Group justify="space-between" gap="xs">
            <Text size="sm" fw={600}>
              {others.length} {others.length === 1 ? 'rider gets' : 'riders get'} no labels
            </Text>
            <Button variant="subtle" size="compact-sm" onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide' : 'Show who'}
            </Button>
          </Group>
          {open && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {others.map((s) => (
                <li key={s.number}>
                  <Text size="sm">
                    {s.number} {s.name}: {s.className || 'no class'} {SKIP_WORDS[s.reason]}
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
      setNote('Saved for this laptop. Labels saved from now on use it.');
    }
  }

  return (
    <Paper withBorder radius="md" p="md" component="section" aria-label="Printer alignment">
      <Stack gap="sm">
        <Title order={3} size="h5">
          Printer alignment
        </Title>
        <Text size="sm">
          Once per printer: print the test page on plain paper, hold it against a label sheet up to
          the light, and measure how far the outlines are off.
        </Text>
        <Button variant="default" onClick={props.onTestPage}>
          Save alignment test page…
        </Button>
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <NumberInput
            label="Move right (mm)"
            description="Negative moves left"
            min={-5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={x}
            onChange={(v) => setX(typeof v === 'number' ? v : '')}
          />
          <NumberInput
            label="Move down (mm)"
            description="Negative moves up"
            min={-5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={y}
            onChange={(v) => setY(typeof v === 'number' ? v : '')}
          />
        </Group>
        <Button variant="default" disabled={!changed} onClick={() => void saveOffset()}>
          Save offset
        </Button>
        {note && (
          <Text size="sm" role="status">
            {note}
          </Text>
        )}
        {problem && (
          <Text size="sm" c="#a51111" role="alert">
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
      aria-label="Label preview, scrolls sideways"
      tabIndex={0}
      style={{ overflowX: 'auto' }}
    >
      {view.labels === 0 ? (
        <Text c="dimmed">No labels to print with these settings.</Text>
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
  const describe = `Rider ${label.number}, ${days > 1 ? `day ${label.day}, ` : ''}lap ${label.lap}`;
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
