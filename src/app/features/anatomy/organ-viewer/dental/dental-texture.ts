import * as THREE from 'three';
import type { DentalService } from '../../../../core/services/dental.service';

export interface TextureSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type TextureImage = CanvasImageSource & { width: number; height: number };
const MAX_TEXTURE_SAMPLE_SIZE = 1024;

export function getDentalDiffuseImage(model?: THREE.Object3D): TextureImage | null {
  let image: TextureImage | null = null;
  model?.traverse((child) => {
    if (image) return;
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const texture = (mat as THREE.MeshStandardMaterial)?.map;
      if (texture?.image) {
        image = texture.image as unknown as TextureImage;
      }
    }
  });
  return image;
}

export class DentalTextureSampler {
  private readonly samples = new WeakMap<object, TextureSample | null>();
  private readonly tmpUv = new THREE.Vector2();

  constructor(private readonly dental: Pick<DentalService, 'isGumPixel'>) {}

  getSample(image: TextureImage): TextureSample | null {
    const cached = this.samples.get(image);
    if (cached !== undefined) {
      return cached;
    }

    let sample: TextureSample | null = null;

    if (image.width && image.height) {
      const scale = Math.min(1, MAX_TEXTURE_SAMPLE_SIZE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      try {
        if (ctx) {
          ctx.drawImage(image, 0, 0, width, height);
          sample = { data: ctx.getImageData(0, 0, width, height).data, width, height };
        }
      } catch {
        // Tainted canvas or draw error, fail gracefully
        sample = null;
      }
    }

    this.samples.set(image, sample);
    return sample;
  }

  isGum(hit: THREE.Intersection): boolean {
    if (!hit.uv) return true;

    const mesh = hit.object as THREE.Mesh;
    const isUpper = mesh.name === 'Group1059';
    const localPt = mesh.worldToLocal(hit.point.clone());

    // Deep vertical root cutoff:
    // Upper arch gums/palate are at y > 6.8; Lower arch gums/floor are at y < -16.5
    if (isUpper && localPt.y > 6.8) return true;
    if (!isUpper && localPt.y < -16.5) return true;

    // UV tooth-strip check: reject gum, palate, and floor-of-mouth UV regions
    if (isUpper && hit.uv.y < 0.838) return true;
    if (!isUpper && (hit.uv.y < 0.6915 || hit.uv.x < 0.3215)) return true;

    const material = Array.isArray(mesh.material)
      ? mesh.material[hit.face?.materialIndex ?? 0]
      : mesh.material;
    const texture = (material as THREE.MeshStandardMaterial | undefined)?.map;
    const image = texture?.image as unknown as TextureImage | undefined;
    if (!texture || !image) return false;

    const sample = this.getSample(image);
    if (!sample) return false;

    // Applies the texture's offset/repeat/wrapping and flipY (UV y is inverted for most WebGL textures)
    const uv = texture.transformUv(this.tmpUv.copy(hit.uv));
    const x = Math.min(sample.width - 1, Math.max(0, Math.floor(uv.x * sample.width)));
    const y = Math.min(sample.height - 1, Math.max(0, Math.floor(uv.y * sample.height)));

    const index = (y * sample.width + x) * 4;
    const r = sample.data[index];
    const g = sample.data[index + 1];
    const b = sample.data[index + 2];

    return this.dental.isGumPixel(r, g, b); // true = Rejected as Gum
  }
}
