import { Hotspot2D } from '../hotspots/hotspot-projection';
import { composeScreenshot } from './screenshot-capture';

describe('Screenshot composition', () => {
  const source = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D required for screenshot tests');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  };
  const point = (x: number, visible: boolean, isCustom = false): Hotspot2D => ({
    x, y: 100, visible, data: { id: String(x), name: 'Point', description: '', isCustom, position: { x: 0, y: 0, z: 0 } },
  });

  it('preserves dimensions, CSS marker projection, visible markers, and WebP settings', () => {
    const canvas = source();
    let output: HTMLCanvasElement | undefined;
    const encode = spyOn(HTMLCanvasElement.prototype, 'toDataURL').and.callFake(function(this: HTMLCanvasElement) {
      output = this;
      return 'data:image/webp;base64,fixture';
    });
    expect(composeScreenshot(canvas, 1200, 600, [point(100, true), point(200, false), point(300, true, true)]))
      .toBe('data:image/webp;base64,fixture');
    expect(encode).toHaveBeenCalledOnceWith('image/webp', .9);
    if (!output) throw new Error('Expected composite canvas');
    expect(output.width).toBe(1200);
    expect(output.height).toBe(600);
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Expected composite context');
    expect(Array.from(ctx.getImageData(100, 100, 1, 1).data)).toEqual([255, 255, 255, 255]);
    expect(Array.from(ctx.getImageData(200, 100, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(Array.from(ctx.getImageData(300, 100, 1, 1).data)).toEqual([255, 255, 255, 255]);
  });

  it('retains PNG fallback when the browser cannot encode WebP', () => {
    const encode = spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .and.returnValues('data:image/png;base64,first', 'data:image/png;base64,fallback');
    expect(composeScreenshot(source(), 1200, 600, [])).toBe('data:image/png;base64,fallback');
    expect(encode.calls.allArgs()).toEqual([['image/webp', .9], ['image/png']]);
  });

  it('returns an explicit empty result if the 2D context is unavailable', () => {
    const canvas = source();
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
    expect(composeScreenshot(canvas, 1200, 600, [])).toBeNull();
  });
});
