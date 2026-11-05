/** Capture only completed WebGL frames; avoid relying on the browser's paint timer.
 * Explicit frame requests prevent empty short captures with on-demand rendering. */
export function createCanvasRecorder(canvas: HTMLCanvasElement, mimeType: string) {
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const manual = typeof track?.requestFrame === 'function';
  if (!manual) {
    stream.getTracks().forEach(t => t.stop());
    stream = canvas.captureStream(30);
    track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  } catch (error) {
    stream.getTracks().forEach(t => t.stop());
    throw error;
  }
  const frame = () => {
    if (manual && recorder.state === 'recording') track?.requestFrame();
  };
  const cleanup = () => canvas.removeEventListener('touchline-frame', frame);
  canvas.addEventListener('touchline-frame', frame);
  recorder.addEventListener('start', () => {
    canvas.dispatchEvent(new Event('touchline-capture-request'));
  }, { once: true });
  recorder.addEventListener('stop', cleanup, { once: true });
  recorder.addEventListener('error', cleanup, { once: true });
  return { stream, recorder };
}
