import { Text } from '@mantine/core';
import type { CSSProperties } from 'react';
import i18next from '../i18n';

interface Props {
  /** Rows on the scorecard (16 on the regional card). */
  readonly rows: number;
  /** Sections this rider rides on this lap; later rows are greyed out. */
  readonly sections: number;
  /** What was typed for each section, from section 1. */
  readonly tokens: readonly string[];
  /** The score each token stands for, or null if it isn't one. */
  readonly scores: readonly (number | null)[];
  /** The event's scores, in card order. */
  readonly scoreValues: readonly number[];
  /** Highlight the next section to type. */
  readonly active: boolean;
  readonly label: { readonly number: string; readonly name: string; readonly detail: string };
  readonly total: number | null;
}

const INK = '#111418';
const ROW_H = 30;
const CHANNEL_W = 56;

/**
 * A drawing of the card in the desk's hand, filled in as they type, to hold against it: the
 * punches should sit in the same places. Laid out like the regional card: 0 and 1 on the left,
 * the black SECTN channel with white section numbers, then 2, 3 and 5.
 */
export function CardPreview(props: Props) {
  const { rows, sections, tokens, scores, scoreValues, active } = props;
  const left = scoreValues.slice(0, 2);
  const right = scoreValues.slice(2);
  const nextRow = active && tokens.length < sections ? tokens.length : -1;

  const hole = (filled: boolean, ring: string): CSSProperties => ({
    width: 18,
    height: 18,
    boxSizing: 'border-box',
    borderRadius: '50%',
    border: `2px solid ${ring}`,
    background: filled ? INK : 'transparent',
  });
  const cell: CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      style={
        {
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          // A drawing of a paper card: it stays light in Dark, on its own light panel. The
          // outline widens the panel without moving anything in Light.
          color: INK,
          '--mantine-color-text': INK,
          '--mantine-color-dimmed': '#495057',
          background: 'light-dark(transparent, #fff)',
          outline: '8px solid light-dark(transparent, #fff)',
          borderRadius: 2,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        data-testid="card-preview"
        style={{
          width: 300,
          border: '2px solid #343a40',
          borderRadius: 8,
          background: '#fbfbf8',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 96,
            boxSizing: 'border-box',
            borderBottom: '2px solid #343a40',
            padding: '8px 10px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: '#fff',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{props.label.number}</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {props.label.name}
            </div>
            <div style={{ fontSize: 13, color: '#495057' }}>{props.label.detail}</div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            height: 28,
            fontSize: 13,
            fontWeight: 700,
            color: '#495057',
            borderBottom: '1px solid #adb5bd',
          }}
        >
          {left.map((v) => (
            <span key={v} style={cell}>
              {v}
            </span>
          ))}
          <span
            style={{
              width: CHANNEL_W,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: INK,
              color: '#fff',
              fontSize: 11,
              letterSpacing: '0.06em',
            }}
          >
            {i18next.t('preview.sectn')}
          </span>
          {right.map((v) => (
            <span key={v} style={cell}>
              {v}
            </span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => {
          const ridden = i < sections;
          const token = ridden ? tokens[i] : undefined;
          const value = ridden ? scores[i] : undefined;
          const bad = token !== undefined && value === null;
          const ring = !ridden ? '#ced4da' : bad ? '#c92a2a' : '#868e96';
          const bg = !ridden
            ? '#e9ecef'
            : bad
              ? '#fdeaea'
              : i === nextRow
                ? '#fff3bf'
                : 'transparent';
          const holes = (vs: readonly number[]) =>
            vs.map((v) => (
              <span key={v} style={cell}>
                <span style={hole(!bad && value === v, ring)} />
              </span>
            ));
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                height: ROW_H,
                boxSizing: 'border-box',
                borderBottom: '1px solid #dee2e6',
                background: bg,
              }}
            >
              {holes(left)}
              <span
                style={{
                  width: CHANNEL_W,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: INK,
                  color: ridden ? '#fff' : '#868e96',
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              {holes(right)}
            </div>
          );
        })}
        <div
          style={{
            display: 'flex',
            height: 44,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            borderTop: '1px solid #343a40',
            background: '#fff',
            fontWeight: 700,
          }}
        >
          <span>{i18next.t('preview.lapTotal')}</span>
          <span style={{ fontSize: 22 }}>{props.total ?? ''}</span>
        </div>
      </div>

      <div style={{ width: 84, display: 'flex', flexDirection: 'column' }} aria-hidden="true">
        <div style={{ height: 98 }} />
        <div
          style={{
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#495057',
          }}
        >
          {i18next.t('preview.score')}
        </div>
        {Array.from({ length: rows }, (_, i) => {
          const ridden = i < sections;
          const token = ridden ? tokens[i] : undefined;
          const bad = token !== undefined && scores[i] === null;
          const border = !ridden
            ? '#e9ecef'
            : bad
              ? '#c92a2a'
              : token === undefined
                ? i === nextRow
                  ? '#f08c00'
                  : '#ced4da'
                : '#2f9e44';
          return (
            <div key={i} style={{ height: ROW_H, boxSizing: 'border-box', padding: '2px 0' }}>
              <div
                style={{
                  height: '100%',
                  boxSizing: 'border-box',
                  border: `2px solid ${border}`,
                  borderRadius: 6,
                  background: !ridden ? '#f1f3f5' : bad ? '#fdeaea' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 8px',
                  fontWeight: 800,
                }}
              >
                <Text span size="xs" c="dimmed" fw={600}>
                  {i18next.t('preview.section', { n: i + 1 })}
                </Text>
                <span style={{ fontSize: 18 }}>{ridden ? (token ?? '') : '–'}</span>
              </div>
            </div>
          );
        })}
        <div
          style={{
            height: 44,
            marginTop: 2,
            boxSizing: 'border-box',
            border: `2px solid ${INK}`,
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: '#495057', lineHeight: 1 }}>
            {i18next.t('preview.total')}
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
            {props.total ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}
