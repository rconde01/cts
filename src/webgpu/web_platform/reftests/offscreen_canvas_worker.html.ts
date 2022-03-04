onmessage = async ({ data: { device, canvas, format } }) => {
  draw(device, canvas, format);
};

function draw(device: GPUDevice, canvas: OffscreenCanvas, format: GPUTextureFormat) {
  const ctx = (canvas.getContext('webgpu') as unknown) as GPUCanvasContext;
  ctx.configure({
    device,
    format,
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
