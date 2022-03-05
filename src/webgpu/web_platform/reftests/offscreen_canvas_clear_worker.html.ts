onmessage = async ({ data: { canvas } }) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();

  if (adapter !== null && device !== undefined) {
    draw(adapter, device, canvas);
  }
};

function draw(adapter: GPUAdapter, device: GPUDevice, canvas: OffscreenCanvas) {
  const ctx = (canvas.getContext('webgpu') as unknown) as GPUCanvasContext;
  ctx.configure({
    device,
    format: ctx.getPreferredFormat(adapter),
  });

  const colorAttachment = ctx.getCurrentTexture();
  const colorAttachmentView = colorAttachment.createView();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: colorAttachmentView,
        clearValue: { r: 0.4, g: 1.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
}
