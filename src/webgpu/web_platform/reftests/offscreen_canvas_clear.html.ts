import { runRefTest } from './gpu_ref_test.js';

runRefTest(async t => {
  const canvas = document.getElementById('cvs0') as HTMLCanvasElement;

  const worker = new Worker('offscreen_canvas_clear_worker.html.js');

  const offscreen_canvas = canvas.transferControlToOffscreen();

  worker.postMessage({ canvas: offscreen_canvas }, [offscreen_canvas]);
});
