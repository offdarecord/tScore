import { Button, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError, OpenEvent, ReviewItem } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

const REASONS: Record<string, 'review.noPunch' | 'review.multiPunch' | 'review.lowConf'> = {
  NO_PUNCH: 'review.noPunch',
  MULTI_PUNCH: 'review.multiPunch',
  LOW_CONF: 'review.lowConf',
};

/**
 * Review queue: scanned cards with sections the reader couldn't decide. Look at the photo (or
 * the card itself), pick each score, and save. Results stay provisional until the queue is empty.
 */
export function ReviewQueue({
  event,
  scoreValues,
  onManualEntry,
}: {
  event: OpenEvent;
  scoreValues?: readonly number[];
  /** Go to Manual entry, for a card that's easier typed in than decided here. */
  onManualEntry?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [values, setValues] = useState<readonly number[]>(scoreValues ?? [0, 1, 2, 3, 5]);
  const [error, setError] = useState<AppError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void window.tscore.reviewQueue().then((r) => (r.ok ? setItems(r.value) : setError(r.error)));
    void window.tscore.cardDesk().then((r) => r.ok && setValues(r.value.scoreValues));
  }, [event]);

  if (!items) return error ? <ErrorAlert error={error} /> : null;

  return (
    <Stack gap="lg" maw={1300}>
      <div>
        <Title order={2}>{t('review.title')}</Title>
        <Text c="dimmed">{t('review.intro')}</Text>
      </div>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {saved && (
        <Text role="status" fw={700}>
          {saved}
        </Text>
      )}
      {items.length === 0 ? (
        <Text fz="lg">{t('review.nothing')}</Text>
      ) : (
        items.map((item) => (
          <ReviewCard
            key={`${item.number}-${item.day}-${item.lap}`}
            item={item}
            values={values}
            onSaved={(next, words) => {
              setItems(next);
              setSaved(words);
            }}
            onError={setError}
          />
        ))
      )}
      {onManualEntry && (
        <Group gap="sm">
          <Text c="dimmed">{t('review.cantRead')}</Text>
          <Button variant="default" onClick={onManualEntry}>
            {t('review.goManual')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function ReviewCard(props: {
  item: ReviewItem;
  values: readonly number[];
  onSaved: (items: ReviewItem[], words: string) => void;
  onError: (e: AppError) => void;
}) {
  const { t } = useTranslation();
  const { item } = props;
  const [photo, setPhoto] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!item.imagePath) return;
    void window.tscore.cardImage(item.imagePath).then((r) => r.ok && setPhoto(r.value));
  }, [item.imagePath]);

  const ready = item.sections.every((s) => picked[s.section] !== undefined);
  const label = t('review.label', {
    number: item.number,
    name: item.name ? t('review.labelName', { name: item.name }) : '',
    class: item.className,
    day: item.day,
    lap: item.lap,
  });

  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-label={label}>
      <Group align="flex-start" gap="lg" wrap="nowrap">
        {photo ? (
          <img
            src={photo}
            alt={t('review.photoAlt', { number: item.number })}
            style={{
              width: 300,
              maxHeight: 420,
              objectFit: 'contain',
              background: '#000',
              borderRadius: 8,
            }}
          />
        ) : (
          <Text c="dimmed" w={300}>
            {t('review.noPhoto')}
          </Text>
        )}
        <Stack gap="sm" style={{ flex: 1 }}>
          <Title order={3} size="h4">
            {label}
          </Title>
          <Text>
            {t('review.readSoFar')}{' '}
            {item.scores.map((s, i) => (
              <Text key={i} span fw={700} mr={6}>
                {s ?? '?'}
              </Text>
            ))}
          </Text>
          {item.sections.map((s) => (
            <div key={s.section}>
              <Text fw={600}>
                {t('review.section', {
                  section: s.section,
                  reason: t(REASONS[s.reason ?? ''] ?? 'review.notDecided'),
                })}
              </Text>
              <SegmentedControl
                aria-label={t('review.scoreFor', { section: s.section })}
                value={picked[s.section] ?? ''}
                onChange={(v) => setPicked((p) => ({ ...p, [s.section]: v }))}
                data={props.values.map((v) => ({ value: String(v), label: String(v) }))}
              />
            </div>
          ))}
          <Group>
            <Button
              disabled={!ready}
              onClick={() =>
                void window.tscore
                  .decideScores({
                    number: item.number,
                    day: item.day,
                    lap: item.lap,
                    scores: item.sections.map((s) => ({
                      section: s.section,
                      value: Number(picked[s.section]),
                    })),
                  })
                  .then((r) =>
                    r.ok
                      ? props.onSaved(
                          r.value,
                          t('review.saved', { number: item.number, lap: item.lap }),
                        )
                      : props.onError(r.error),
                  )
              }
            >
              {t('review.save')}
            </Button>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
}
