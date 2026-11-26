import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { qrMatrix, qrPayload } from '@tscore/core';
import {
  readCard,
  readLabel,
  syntheticCard,
  type CardReading,
  type RgbaImage,
} from '@tscore/vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from '../i18n';
import type { AppError, CardDesk, OpenEvent } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import { pickedText, RiderPicker } from '../riders/RiderPicker';
import { fromLabel, nextLap, SteadyGate, verdict, type Identity, type Verdict } from './scanLogic';

/** How often a frame is read. */
const EVERY_MS = 250;
/** Frames are read at most this wide, which keeps each read well under the interval. */
const READ_WIDTH = 1280;

type Source = { kind: 'camera'; deviceId: string } | { kind: 'practice' };

interface Shown {
  readonly id: Identity;
  readonly card: CardReading;
  readonly verdict: Verdict;
  readonly image: Blob | null;
}

/** A short tone: high for saved, low for "needs a look". */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 330;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => void ctx.close();
  } catch {
    // No sound device: the screen still says what happened.
  }
}

const CAMERA_KEY = 'tscore.scan.camera';

/**
 * Scan desk: hold each card under the document camera. A card is read when the reading has
 * been steady for a moment, saved straight away when every section is clear, or sent to the
 * Review queue with its photo when a person needs to look. Then lift it off for the next.
 */
export function ScanDesk({ event }: { event: OpenEvent }) {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const big = theme.other['scanDeskFontSize'] as string;
  const [desk, setDesk] = useState<CardDesk | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [status, setStatus] = useState(() => i18next.t('scan.start'));
  // A card with no label is for the rider found here: picked from the list, or a whole number typed.
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [practiceFrame, setPracticeFrame] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const practice = useRef<RgbaImage | null>(null);
  const gate = useRef(new SteadyGate());
  // After a card is dealt with, wait for it to be lifted off before reading the next.
  const waitingForLift = useRef(false);
  const busy = useRef(false);
  // A save in flight: Enter pressed twice, or a second read, mustn't save the card again.
  const saving = useRef(false);
  const deskRef = useRef<CardDesk | null>(null);
  const typedRef = useRef('');
  const typed =
    picked !== null
      ? String(picked)
      : desk?.riders.some((r) => String(r.number) === query.trim())
        ? query.trim()
        : '';
  useEffect(() => {
    deskRef.current = desk;
    typedRef.current = typed;
  }, [desk, typed]);

  useEffect(() => {
    void window.tscore.cardDesk().then((r) => (r.ok ? setDesk(r.value) : setError(r.error)));
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => {
        const cams = all.filter((d) => d.kind === 'videoinput');
        setCameras(cams);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(CAMERA_KEY);
        } catch {
          // Storage unavailable: just don't remember the camera.
        }
        const pick = cams.find((c) => c.deviceId === saved);
        if (pick) setSource({ kind: 'camera', deviceId: pick.deviceId });
      })
      .catch(() => setCameras([]));
  }, [event]);

  // Start the camera.
  useEffect(() => {
    if (source?.kind !== 'camera') return;
    let stream: MediaStream | null = null;
    let stop = false;
    void navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: { exact: source.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((s) => {
        if (stop) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        setStatus(i18next.t('scan.place'));
      })
      .catch(() => setStatus(i18next.t('scan.noCamera')));
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [source]);

  /** The current frame, scaled to READ_WIDTH. */
  const grab = useCallback((): { frame: RgbaImage; canvas: HTMLCanvasElement } | null => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    if (source?.kind === 'practice') {
      const p = practice.current;
      if (!p) return null;
      canvas.width = p.width;
      canvas.height = p.height;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
      return { frame: p, canvas };
    }
    const v = video.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    const scale = Math.min(1, READ_WIDTH / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { frame: { width: data.width, height: data.height, data: data.data }, canvas };
  }, [source]);

  const save = useCallback(async (s: Shown) => {
    if (s.verdict.kind === 'problem' || saving.current) return;
    saving.current = true;
    const v = s.verdict;
    let r: Awaited<ReturnType<typeof window.tscore.saveScan>>;
    try {
      const image = s.image ? new Uint8Array(await s.image.arrayBuffer()) : new Uint8Array();
      r = await window.tscore.saveScan({
        number: s.id.number,
        day: s.id.day,
        lap: s.id.lap,
        scores: v.scores,
        confidence: v.confidence,
        reasons: v.kind === 'review' ? v.reasons : v.scores.map(() => null),
        image,
      });
    } finally {
      saving.current = false;
    }
    if (!r.ok) {
      setError(r.error);
      beep(false);
      return;
    }
    setDesk(r.value);
    const undecided = v.scores.filter((x) => x === null).length;
    setLast(
      undecided
        ? i18next.t('scan.toReview', { number: s.id.number, lap: s.id.lap, count: undecided })
        : i18next.t('scan.saved', {
            number: s.id.number,
            lap: s.id.lap,
            scores: v.scores.join(' '),
          }),
    );
    beep(undecided === 0);
    setShown(null);
    setQuery('');
    setPicked(null);
    waitingForLift.current = true;
    setStatus(i18next.t('scan.lift'));
  }, []);

  // The reading loop.
  useEffect(() => {
    if (!source) return;
    const timer = setInterval(() => {
      if (busy.current) return;
      busy.current = true;
      try {
        const got = grab();
        const current = deskRef.current;
        if (!current) return;
        const r = got ? readCard(got.frame) : ({ ok: false, reason: 'NO_CARD' } as const);
        const card = r.ok ? r.card : null;
        if (waitingForLift.current) {
          if (!card) {
            waitingForLift.current = false;
            gate.current.reset();
            setStatus(i18next.t('scan.placeNext'));
          }
          return;
        }
        if (!r.ok) {
          gate.current.push(null);
          setStatus(
            r.reason === 'CARD_CUT_OFF'
              ? i18next.t('scan.cutOff')
              : r.reason === 'TILTED'
                ? i18next.t('scan.tilted')
                : r.reason === 'TOO_SMALL'
                  ? i18next.t('scan.tooSmall')
                  : r.reason === 'UNSURE'
                    ? i18next.t('scan.unsure')
                    : i18next.t('scan.place'),
          );
          return;
        }
        if (!gate.current.push(r.card)) {
          setStatus(i18next.t('scan.reading'));
          return;
        }
        if (!got) return;
        const label = readLabel(got.frame, r.card.pose);
        let id = fromLabel(label, event.setup.event.code);
        if (!id) {
          const n = Number(typedRef.current);
          const rider = current.riders.find((x) => x.number === n);
          if (!rider) {
            setStatus(i18next.t('scan.noLabel'));
            setShown(null);
            return;
          }
          const day = current.days.length > 1 ? todayDay(current) : 1;
          id = { number: n, day, lap: nextLap(rider, day, current.cards), from: 'typed' };
        }
        const v = verdict(r.card, id, current.riders, current.cards);
        const shownNow: Shown = { id, card: r.card, verdict: v, image: null };
        if (v.kind === 'problem') {
          setShown(shownNow);
          setStatus(v.message);
          waitingForLift.current = true;
          beep(false);
          return;
        }
        // Taken: wait for lift-off now, not when the save finishes, or the next read (every
        // quarter second) sees the same card and saves it again.
        waitingForLift.current = true;
        got.canvas.toBlob(
          (blob) => {
            const withImage = { ...shownNow, image: blob };
            if (v.kind === 'save') void save(withImage);
            else {
              setShown(withImage);
              setStatus(i18next.t('scan.needsLook'));
            }
          },
          'image/jpeg',
          0.85,
        );
      } finally {
        busy.current = false;
      }
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [source, grab, save, event.setup.event.code]);

  // Enter sends a card that needs a look to review; Esc reads it again.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!shown || shown.verdict.kind !== 'review') return;
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {
        e.preventDefault();
        void save(shown);
      } else if (e.key === 'Escape') {
        setShown(null);
        gate.current.reset();
        waitingForLift.current = false;
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [shown, save]);

  function startPractice(unclear: boolean) {
    const d = deskRef.current;
    const rider = d?.riders.find((r) => r.status !== 'dns' && r.rides[1]);
    if (!d || !rider) {
      setStatus(i18next.t('scan.importFirst'));
      return;
    }
    const lap = nextLap(rider, 1, d.cards);
    const sections = rider.rides[1]?.sections ?? 10;
    const values = d.scoreValues;
    const punches = Array.from({ length: sections }, (_, i) => [
      values[(i * 7 + lap) % values.length] ?? 0,
    ]);
    if (unclear && punches[2]) punches[2] = [values[0] ?? 0, values[1] ?? 1];
    const frame = syntheticCard({
      punches,
      label: qrMatrix(qrPayload(event.setup.event.code, rider.number, 1, lap)),
      width: 640,
      height: 900,
      columnWidth: 36,
      angle: 4,
    });
    practice.current = frame;
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
        0,
        0,
      );
    setPracticeFrame(canvas.toDataURL('image/png'));
    gate.current.reset();
    waitingForLift.current = false;
    setSource({ kind: 'practice' });
  }

  function liftPractice() {
    practice.current = null;
    setPracticeFrame(null);
  }

  return (
    <Stack gap="lg" maw={1300}>
      <div>
        <Title order={2}>{t('scan.title')}</Title>
        <Text c="dimmed">{t('scan.intro')}</Text>
      </div>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      <Group align="flex-end" gap="sm">
        <NativeSelect
          label={t('scan.camera')}
          value={source?.kind === 'camera' ? source.deviceId : ''}
          onChange={(e) => {
            const id = e.currentTarget.value;
            try {
              localStorage.setItem(CAMERA_KEY, id);
            } catch {
              // Not remembered: fine.
            }
            liftPractice();
            setSource(id ? { kind: 'camera', deviceId: id } : null);
          }}
          data={[
            { value: '', label: cameras.length ? t('scan.chooseCamera') : t('scan.noneFound') },
            ...cameras.map((c, i) => ({
              value: c.deviceId,
              label: c.label || t('scan.cameraN', { n: i + 1 }),
            })),
          ]}
          w={320}
        />
        <Button variant="default" onClick={() => startPractice(false)}>
          {t('scan.practice')}
        </Button>
        <Button variant="default" onClick={() => startPractice(true)}>
          {t('scan.practiceUnclear')}
        </Button>
        {source?.kind === 'practice' && practiceFrame && (
          <Button variant="subtle" color="gray" onClick={liftPractice}>
            {t('scan.liftButton')}
          </Button>
        )}
      </Group>
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Paper
          withBorder
          radius="md"
          style={{ width: 480, height: 640, overflow: 'hidden', background: '#000', flex: 'none' }}
        >
          {source?.kind === 'camera' && (
            <video
              ref={video}
              muted
              playsInline
              aria-label={t('scan.cameraView')}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
          {source?.kind === 'practice' && practiceFrame && (
            <img
              src={practiceFrame}
              alt={t('scan.practiceAlt')}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </Paper>
        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          <Text role="status" fz="xl" fw={700}>
            {status}
          </Text>
          <RiderPicker
            label={t('scan.noLabelRider')}
            placeholder={t('scan.riderPlaceholder')}
            riders={desk?.riders}
            query={query}
            picked={picked !== null}
            onQueryChange={(q) => {
              setQuery(q);
              setPicked(null);
            }}
            onPick={(r) => {
              setPicked(r.number);
              setQuery(pickedText(r));
            }}
            maw={420}
          />
          {shown && (
            <Paper
              withBorder
              radius="md"
              p="md"
              component="section"
              aria-label={t('scan.cardRead')}
            >
              <Text fz={big} fw={800} lh={1.1}>
                {shown.id.number}
              </Text>
              <Text fz="lg">
                {t('scan.lapLine', { name: riderName(desk, shown.id.number), lap: shown.id.lap })}
                {shown.id.from === 'typed' ? t('scan.typed') : ''}
              </Text>
              <Group gap={6} mt="sm">
                {shown.card.rows
                  .slice(
                    0,
                    desk?.riders.find((r) => r.number === shown.id.number)?.rides[shown.id.day]
                      ?.sections ?? 0,
                  )
                  .map((r) => (
                    <Text
                      key={r.section}
                      span
                      fz={28}
                      fw={800}
                      px={8}
                      style={{
                        borderRadius: 6,
                        border: '2px solid',
                        borderColor: r.flag ? '#c92a2a' : 'var(--mantine-color-default-border)',
                        color: r.flag ? '#a51111' : undefined,
                      }}
                      title={r.flag ?? ''}
                    >
                      {r.value ?? '?'}
                    </Text>
                  ))}
              </Group>
              {shown.verdict.kind === 'review' && (
                <Group mt="md">
                  <Button onClick={() => void save(shown)}>{t('scan.sendToReview')}</Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      setShown(null);
                      gate.current.reset();
                      waitingForLift.current = false;
                    }}
                  >
                    {t('scan.readAgain')}
                  </Button>
                </Group>
              )}
              {shown.verdict.kind === 'review' && shown.verdict.extraRows.length > 0 && (
                <Text mt="sm" c="light-dark(#a51111, #ffa8a8)">
                  {t('scan.extraRows', { rows: shown.verdict.extraRows.join(', ') })}
                </Text>
              )}
            </Paper>
          )}
          {last && (
            <Alert color="gray" role="log" aria-label={t('scan.lastCard')}>
              <Text fz="lg" fw={700}>
                {last}
              </Text>
            </Alert>
          )}
        </Stack>
      </Group>
    </Stack>
  );
}

function riderName(desk: CardDesk | null, number: number): string {
  const r = desk?.riders.find((x) => x.number === number);
  return r ? r.riders.map((p) => `${p.givenName} ${p.familyName}`).join(' & ') : '';
}

/** On a multi-day event, today's day if it's one of them, else day 1. */
function todayDay(desk: CardDesk): number {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return desk.days.find((x) => x.date === today)?.day ?? 1;
}
