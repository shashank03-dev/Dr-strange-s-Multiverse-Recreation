// Renders the score off the main thread and hands back an AudioBuffer.
import { SR } from './synth.js';

export async function composeScore(duration) {
  let channels;
  try {
    channels = await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./score.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { resolve(e.data); w.terminate(); };
      w.onerror = (e) => { reject(e); w.terminate(); };
      w.postMessage({ duration });
    });
  } catch (e) {
    // Browsers without module workers: render on the main thread instead.
    const { renderScore } = await import('./score.js');
    channels = renderScore(duration);
  }
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tmp = new AC(2, 1, SR);
  const buf = tmp.createBuffer(2, channels[0].length, SR);
  buf.copyToChannel(channels[0], 0);
  buf.copyToChannel(channels[1], 1);
  return buf;
}
