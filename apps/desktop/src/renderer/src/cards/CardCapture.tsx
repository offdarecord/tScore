import { Button, Group, NativeSelect, Paper, Stack } from '@mantine/core';
import type { RgbaImage } from '@tscore/vision';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { grabVideo } from './teachPictures';

/** The camera the scan desk last used, so the wizard starts with it too. */
const CAMERA_KEY = 'tscore.scan.camera';

/**
 * Take a picture of a card for the Teach a card wizard (#107): from the document camera, or a
 * card tScore draws, to practise with.
 */
export function CardCapture(props: {
  readonly takeLabel: string;
  readonly drawLabel: string;
  readonly onPicture: (frame: RgbaImage, drawn: boolean) => void;
  readonly draw: () => RgbaImage;
  readonly onStatus: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { onStatus } = props;
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [camera, setCamera] = useState('');
  // The camera now showing a picture.
  const [liveFor, setLiveFor] = useState('');
  const live = !!camera && liveFor === camera;
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => {
        const cams = all.filter((d) => d.kind === 'videoinput');
        setCameras(cams);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(CAMERA_KEY);
        } catch {
          // Storage unavailable: start with no camera chosen.
        }
        if (cams.some((c) => c.deviceId === saved) && saved) setCamera(saved);
      })
      .catch(() => setCameras([]));
  }, []);

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let stop = false;
    void navigator.mediaDevices
      .getUserMedia({
        video: { deviceId: { exact: camera }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((s) => {
        if (stop) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        setLiveFor(camera);
      })
      .catch(() => onStatus(t('scan.noCamera')));
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [camera, onStatus, t]);

  function take() {
    const frame = grabVideo(video.current);
    if (frame) props.onPicture(frame, false);
    else onStatus(t('teach.cameraNotReady'));
  }

  return (
    <Stack gap="sm">
      <Group align="flex-end">
        <NativeSelect
          label={t('scan.camera')}
          value={camera}
          onChange={(e) => {
            const id = e.currentTarget.value;
            setCamera(id);
            try {
              if (id) localStorage.setItem(CAMERA_KEY, id);
            } catch {
              // Storage unavailable: just don't remember the camera.
            }
          }}
          data={[
            { value: '', label: cameras.length ? t('scan.chooseCamera') : t('scan.noneFound') },
            ...cameras.map((c, i) => ({
              value: c.deviceId,
              label: c.label || t('scan.cameraN', { n: i + 1 }),
            })),
          ]}
          w={280}
        />
        <Button onClick={take} disabled={!live}>
          {props.takeLabel}
        </Button>
        <Button variant="default" onClick={() => props.onPicture(props.draw(), true)}>
          {props.drawLabel}
        </Button>
      </Group>
      {camera && (
        <Paper
          withBorder
          radius="md"
          style={{ width: 480, overflow: 'hidden', background: '#000' }}
        >
          <video
            ref={video}
            muted
            playsInline
            aria-label={t('scan.cameraView')}
            style={{ width: '100%', display: 'block' }}
          />
        </Paper>
      )}
    </Stack>
  );
}
