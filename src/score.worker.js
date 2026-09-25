import { renderScore } from './score.js';

self.onmessage = (e) => {
  const [L, R] = renderScore(e.data.duration);
  self.postMessage([L, R], [L.buffer, R.buffer]);
};
