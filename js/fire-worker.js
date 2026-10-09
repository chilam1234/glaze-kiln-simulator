// Kiln thread. Owns one host GlazeState and runs the same fire() the page used to run inline,
// so orbiting the pot stays on the page thread. Messages move copies of the thickness maps;
// the page keeps the originals for Unfire.
import { TEX_W, TEX_H } from './grid.js?v=e07da0a-20261009-0514';
import { GLAZES } from './glazes.js?v=e07da0a-20261009-0514';
import { GlazeState, setFireCone } from './sim.js?v=e07da0a-20261009-0514';

const N = TEX_W * TEX_H;
const NG = GLAZES.length;
const kiln = new GlazeState({ host: true });

self.postMessage({ type: 'ready' });

self.onmessage = async (ev) => {
  const m = ev.data;
  if (!m || m.type !== 'fire') return;
  const job = m.job;
  try {
    setFireCone(m.cone);
    const thick = new Array(NG);
    const stamp = new Array(NG);
    for (let i = 0; i < m.active.length; i++) {
      const q = m.active[i];
      thick[q] = new Float32Array(m.thickBufs[i]);
      stamp[q] = new Uint16Array(m.stampBufs[i]);
    }
    kiln.thick = thick;
    kiln.stamp = stamp;
    kiln._live = m.active.slice();
    kiln.nLow = new Float32Array(m.nLow);
    kiln.nMid = new Float32Array(m.nMid);
    kiln.nLow2 = new Float32Array(m.nLow2);
    kiln.streak = new Float32Array(m.streak);
    kiln.cellE = new Float32Array(m.cellE);
    kiln.cellId = new Float32Array(m.cellId);
    kiln.pot = { rows: m.rows, height: m.height };
    kiln.fixedSeed = m.fixedSeed === null ? undefined : m.fixedSeed;
    kiln.debugDrips = !!m.debugDrips;
    kiln.debugThickness = !!m.debugThickness;
    kiln.waxFoot = !!m.waxFoot;
    await kiln.fire((p) => self.postMessage({ type: 'progress', job, p }), m.seed === null ? undefined : m.seed);

    const transfers = [kiln.color.buffer, kiln.props.buffer, kiln.fx.buffer, kiln.height.buffer];
    const firedIndex = [];
    const firedBufs = [];
    const stampIndex = [];
    const stampBufs = [];
    for (let q = 0; q < NG; q++) {
      if (kiln.fired && kiln.fired[q]) {
        firedIndex.push(q);
        firedBufs.push(kiln.fired[q].buffer);
        transfers.push(kiln.fired[q].buffer);
      }
      if (kiln.firedStamp && kiln.firedStamp[q]) {
        stampIndex.push(q);
        stampBufs.push(kiln.firedStamp[q].buffer);
        transfers.push(kiln.firedStamp[q].buffer);
      }
    }
    const color = kiln.color, props = kiln.props, fx = kiln.fx, height = kiln.height;
    self.postMessage({
      type: 'done', job,
      color: color.buffer, props: props.buffer, fx: fx.buffer, height: height.buffer,
      firedIndex, firedBufs, stampIndex, stampBufs,
      seed: kiln.seed, dripStats: kiln.dripStats, fireMs: kiln.fireMs, composeMs: kiln.composeMs,
    }, transfers);
    kiln.color = new Uint8Array(N * 4);
    kiln.props = new Uint8Array(N * 4);
    kiln.fx = new Uint8Array(N * 4);
    kiln.height = new Uint8Array(N * 4);
    kiln.fired = null;
    kiln.firedStamp = null;
    kiln.thick = [];
    kiln.stamp = [];
    kiln._live = [];
    kiln.nLow = kiln.nMid = kiln.nLow2 = kiln.streak = kiln.cellE = kiln.cellId = null;
  } catch (err) {
    self.postMessage({ type: 'error', job, message: String(err && err.stack || err) });
  }
};
