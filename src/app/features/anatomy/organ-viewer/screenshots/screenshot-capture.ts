import type { Hotspot2D } from '../hotspots/hotspot-projection';

const MAX_SCREENSHOT_DIMENSION = 1200;

export function composeScreenshot(glCanvas: HTMLCanvasElement, viewWidth: number, viewHeight: number, hotspots: readonly Hotspot2D[]): string | null {
  const srcW = glCanvas.width || viewWidth;
  const srcH = glCanvas.height || viewHeight;
  const scale = Math.min(1, MAX_SCREENSHOT_DIMENSION / Math.max(srcW, srcH, 1));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = outW;
  compositeCanvas.height = outH;
  const ctx = compositeCanvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  // 2. Paint the exact studio radial-gradient backdrop seen by the user
  const gradCx = outW * 0.5;
  const gradCy = outH * 0.42;
  const gradRadius = Math.hypot(outW, outH) * 0.65;
  const gradient = ctx.createRadialGradient(gradCx, gradCy, 0, gradCx, gradCy, gradRadius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  gradient.addColorStop(0.45, 'rgba(255, 250, 243, 0.94)');
  gradient.addColorStop(1, 'rgba(247, 237, 225, 1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, outW, outH);

  // 3. Draw the 3D WebGL view
  ctx.drawImage(glCanvas, 0, 0, outW, outH);

  // 4. Composite visible 2D hotspot markers onto the screenshot
  const cssToOutX = outW / Math.max(1, viewWidth);
  const cssToOutY = outH / Math.max(1, viewHeight);
  for (const hotspot of hotspots) {
    if (!hotspot.visible) continue;
    const hx = hotspot.x * cssToOutX;
    const hy = hotspot.y * cssToOutY;
    const dotRadius = 6 * Math.min(cssToOutX, cssToOutY);

    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, dotRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hx, hy, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, 3.5 * Math.min(cssToOutX, cssToOutY));
    ctx.strokeStyle = hotspot.data.isCustom ? '#4a90d9' : '#f37b68';
    ctx.stroke();
    ctx.restore();
  }

  // 5. Encode using modern WebP format (with PNG fallback)
  let imageDataUrl = compositeCanvas.toDataURL('image/webp', 0.9);
  if (!imageDataUrl.startsWith('data:image/webp')) {
    imageDataUrl = compositeCanvas.toDataURL('image/png');
  }

  return imageDataUrl;
}
