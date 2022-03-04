import { runRefTest } from './gpu_ref_test.js';

runRefTest(async t => {
  function offscreen_draw(canvasId: string, format: GPUTextureFormat) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;

    const worker = new Worker('offscreen_canvas.html.js');

    const offscreen_canvas = canvas.transferControlToOffscreen();

    worker.postMessage({ device: t.device, canvas: offscreen_canvas, format }, [offscreen_canvas]);
  }

  offscreen_draw('cvs0', 'bgra8unorm');
  offscreen_draw('cvs1', 'rgba8unorm');
  offscreen_draw('cvs2', 'rgba16float');
});
