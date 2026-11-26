/** Pictures for the Teach a card wizard (#107): camera frames and straightened cards. */
import type { GreyImage, RgbaImage } from '@tscore/vision';

/** The camera picture is read at most this wide, as at the scan desk. */
const READ_WIDTH = 1600;

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** A colour picture as a PNG data URL, to show. */
export function rgbaUrl(frame: RgbaImage): string {
  const canvas = canvasOf(frame.width, frame.height);
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
      0,
      0,
    );
  return canvas.toDataURL('image/png');
}

function greyCanvas(img: GreyImage) {
  const canvas = canvasOf(img.width, img.height);
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.data.length; i++) {
    const g = img.data[i] ?? 0;
    rgba[i * 4] = g;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = g;
    rgba[i * 4 + 3] = 255;
  }
  canvas.getContext('2d')?.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return canvas;
}

/** A grey picture as a PNG data URL, to show. */
export function greyUrl(img: GreyImage): string {
  return greyCanvas(img).toDataURL('image/png');
}

/** A grey picture as PNG bytes, to keep with the card type. */
export async function greyPng(img: GreyImage): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((done) => greyCanvas(img).toBlob(done, 'image/png'));
  if (!blob) throw new Error("The blank card's picture couldn't be made.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The camera's current picture, or null when it isn't showing one yet. */
export function grabVideo(video: HTMLVideoElement | null): RgbaImage | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const scale = Math.min(1, READ_WIDTH / video.videoWidth);
  const canvas = canvasOf(
    Math.round(video.videoWidth * scale),
    Math.round(video.videoHeight * scale),
  );
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: data.data };
}
