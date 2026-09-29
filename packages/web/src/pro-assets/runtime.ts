import catalog from './catalog.json';
import { settings } from '../settings/settings.svelte.ts';

export const proEnabled =
  (import.meta.env.DEV || import.meta.env['PRO_ASSET_REVIEW'] === true) &&
  new URLSearchParams(location.search).get('visual') === 'pro';
export type AssetId = keyof typeof catalog;
function variant(id: AssetId) {
  const scale = Math.min(3, Math.max(1, Math.ceil(devicePixelRatio)));
  const entry = catalog[id];
  return entry.variants.find((v) => v.format === 'webp' && v.scale === scale) ?? entry.variants[0]!;
}
const images = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(id: AssetId) {
  const url = variant(id).url;
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        void image
          .decode()
          .then(() => resolve(image))
          .catch((error: unknown) => {
            images.delete(url);
            reject(error);
          });
      };
      image.onerror = () => {
        images.delete(url);
        reject(new Error(`Asset: ${id}`));
      };
      image.src = url;
    });
    images.set(url, pending);
  }
  return pending;
}
let context: AudioContext | undefined;
const buffers = new Map<string, AudioBuffer>();
const pendingAudio = new Set<string>();
const active = new Set<AudioBufferSourceNode>();
export function unlockAudio() {
  if (!proEnabled || !settings.value.sound) return;
  context ??= new AudioContext();
  void context.resume().catch(() => undefined);
  for (const id of ['card', 'chips', 'hit', 'success', 'go'] as const) {
    if (pendingAudio.has(id) || buffers.has(id)) continue;
    pendingAudio.add(id);
    // AAC fallback for Safari; no audio downloads until a user gesture.
    const format = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    void fetch(`/pro/${id}.${format}`)
      .then((r) => {
        if (!r.ok) throw new Error('Audio download');
        return r.arrayBuffer();
      })
      .then((data) => context!.decodeAudioData(data))
      .then((buffer) => buffers.set(id, buffer))
      .catch(() => undefined)
      .finally(() => pendingAudio.delete(id));
  }
}
export function stopAudio() {
  for (const source of active) source.stop();
  active.clear();
}
export function playSound(kind: string) {
  if (!proEnabled || !settings.value.sound || !context || document.hidden) return;
  const id =
    kind === 'ppeok' || kind === 'bomb'
      ? 'hit'
      : kind === 'go' || kind === 'shake'
        ? 'go'
        : kind === 'settlement' || kind === 'ttadak'
          ? 'chips'
          : kind === 'stop' || kind === 'jjok'
            ? 'success'
            : 'card';
  const buffer = buffers.get(id);
  if (!buffer) return;
  stopAudio();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.55;
  source.connect(gain).connect(context.destination);
  active.add(source);
  source.onended = () => {
    active.delete(source);
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}
