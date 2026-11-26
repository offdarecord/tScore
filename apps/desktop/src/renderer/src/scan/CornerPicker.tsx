import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { CORNER_ORDER, type CardCorners, type Point } from '@tscore/vision';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** Arrow keys move the cross this share of the picture; with Shift, a small step. */
const STEP = 0.02;
const FINE = 0.0025;

/**
 * The desk marks a card's four corners on a still camera picture (#106): top-left, top-right,
 * bottom-right, bottom-left. Click each, or move the cross with the arrow keys (Shift for small
 * steps) and press Enter or Space. Backspace takes the last corner back; Esc gives up.
 */
export function CornerPicker({
  image,
  width,
  height,
  onPlaced,
  onDone,
  onCancel,
}: {
  /** The still picture (a data URL) and its size in pixels. */
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** Told how many corners are marked so far, so the desk can say which is next. */
  readonly onPlaced: (count: number) => void;
  readonly onDone: (corners: CardCorners) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<Point[]>([]);
  const [cross, setCross] = useState<Point>({ x: width / 2, y: height / 2 });
  const svg = useRef<SVGSVGElement>(null);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => area.current?.focus(), []);

  function place(p: Point) {
    const next = [...points, p];
    setCross(p);
    if (next.length < CORNER_ORDER.length) {
      setPoints(next);
      onPlaced(next.length);
      return;
    }
    setPoints([]);
    const [topLeft, topRight, bottomRight, bottomLeft] = next as [Point, Point, Point, Point];
    onDone({ topLeft, topRight, bottomRight, bottomLeft });
  }

  function undo() {
    if (!points.length) return;
    setPoints(points.slice(0, -1));
    onPlaced(points.length - 1);
  }

  function click(e: MouseEvent<SVGSVGElement>) {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    if (pt.x < 0 || pt.y < 0 || pt.x > width || pt.y > height) return;
    place({ x: pt.x, y: pt.y });
    area.current?.focus();
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = (e.shiftKey ? FINE : STEP) * Math.max(width, height);
    const move = (dx: number, dy: number) =>
      setCross((c) => ({
        x: Math.min(width - 1, Math.max(0, c.x + dx * step)),
        y: Math.min(height - 1, Math.max(0, c.y + dy * step)),
      }));
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-1, 0),
      ArrowRight: () => move(1, 0),
      ArrowUp: () => move(0, -1),
      ArrowDown: () => move(0, 1),
      Enter: () => place(cross),
      ' ': () => place(cross),
      Backspace: undo,
      Escape: onCancel,
    };
    const act = actions[e.key];
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    act();
  }

  const r = Math.max(width, height) / 90;
  return (
    <Stack gap="xs" style={{ flex: 'none', width: 480 }}>
      <Paper
        withBorder
        radius="md"
        style={{ width: 480, height: 640, overflow: 'hidden', background: '#000' }}
      >
        <div
          ref={area}
          role="application"
          tabIndex={0}
          aria-label={t('scan.cornersPicture')}
          aria-describedby="corner-picker-help"
          onKeyDown={key}
          style={{ position: 'relative', width: '100%', height: '100%', outlineOffset: 2 }}
        >
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            onClick={click}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: 'crosshair',
            }}
          >
            <image href={image} x={0} y={0} width={width} height={height} />
            {points.length > 1 && (
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#40c057"
                strokeWidth={r / 3}
              />
            )}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#40c057" strokeWidth={r / 3} />
                <text
                  x={p.x + r * 1.4}
                  y={p.y - r * 1.4}
                  fill="#40c057"
                  fontSize={r * 2.4}
                  fontWeight={700}
                >
                  {i + 1}
                </text>
              </g>
            ))}
            <g stroke="#fab005" strokeWidth={r / 4}>
              <line x1={cross.x - r * 2} y1={cross.y} x2={cross.x + r * 2} y2={cross.y} />
              <line x1={cross.x} y1={cross.y - r * 2} x2={cross.x} y2={cross.y + r * 2} />
            </g>
          </svg>
        </div>
      </Paper>
      <Text id="corner-picker-help" size="sm">
        {t('scan.cornersHelp')}
      </Text>
      <Group gap="xs">
        <Button size="xs" variant="default" onClick={undo} disabled={points.length === 0}>
          {t('scan.undoCorner')}
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={onCancel}>
          {t('scan.cancelCorners')}
        </Button>
      </Group>
    </Stack>
  );
}
