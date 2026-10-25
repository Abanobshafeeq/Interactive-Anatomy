import * as THREE from 'three';
import type { Hotspot } from '../../../../core/models/organ.model';
import { createFirstHitRaycaster } from '../interactions/picking-controller';

export interface Hotspot2D {
  data: Hotspot;
  x: number;
  y: number;
  visible: boolean;
}

/** Pre-computed world-space anchor of a hotspot (the model is static, so this never changes). */
interface HotspotAnchor {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

const OCCLUSION_RECHECK_DIST_SQ = 0.02;
const HOTSPOT_FALLBACK_CENTER = new THREE.Vector3(0, 0.45, 0);

export class HotspotProjection {
  private readonly hotspotAnchors = new Map<string, HotspotAnchor>();
  private readonly hotspotElements = new Map<string, HTMLElement>();
  private readonly occlusionCache = new Map<string, { blocked: boolean; camPos: THREE.Vector3 }>();
  private readonly occlusionRaycaster = createFirstHitRaycaster();
  private readonly tmpViewDir = new THREE.Vector3();
  private readonly tmpRayDir = new THREE.Vector3();
  private readonly tmpProjected = new THREE.Vector3();

  constructor(private readonly getOverlay: () => HTMLElement) {}

  register(hotspot: Hotspot, model?: THREE.Object3D): void {
    const position = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);

    const normal = hotspot.normal
      ? new THREE.Vector3(hotspot.normal.x, hotspot.normal.y, hotspot.normal.z).normalize()
      // Fallback outward normal relative to model center
      : position.clone().sub(HOTSPOT_FALLBACK_CENTER).normalize();

    // Built-in hotspots are authored in model space; custom ones are saved in world space.
    if (!hotspot.isCustom && model) {
      position.applyMatrix4(model.matrixWorld);
      normal.transformDirection(model.matrixWorld);
    }

    this.hotspotAnchors.set(hotspot.id, { position, normal });
  }

  remove(id: string): void {
    this.hotspotAnchors.delete(id);
    this.hotspotElements.delete(id);
    this.occlusionCache.delete(id);
  }

  clear(): void {
    this.hotspotAnchors.clear();
    this.hotspotElements.clear();
    this.occlusionCache.clear();
  }

  project(
    hotspots: readonly Hotspot[] | undefined,
    model: THREE.Object3D | undefined,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    previous: Hotspot2D[],
  ): Hotspot2D[] | null {
    if (!hotspots?.length || !model) return previous.length > 0 ? [] : null;

    const camPos = camera.position;

    const next: Hotspot2D[] = [];
    let changed = false;

    for (const hotspot of hotspots) {
      const anchor = this.hotspotAnchors.get(hotspot.id);
      if (!anchor) continue;

      const worldPosition = anchor.position;

      // 1. Check if surface normal faces camera
      const viewDir = this.tmpViewDir.subVectors(camPos, worldPosition);
      const distance = viewDir.length();
      const isFacingCamera = distance > 0 && anchor.normal.dot(viewDir) / distance > 0.05;

      // 2. Project to screen space and check the frustum
      const projected = this.tmpProjected.copy(worldPosition).project(camera);

      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const inFrustum = projected.z < 1 && projected.z > -1;

      // 3. Line-of-sight raycast: only when the hotspot could actually be visible
      let isBlocked = false;
      if (isFacingCamera && inFrustum) {
        isBlocked = this.isOccluded(hotspot.id, worldPosition, distance, camera, model);
      } else {
        this.occlusionCache.delete(hotspot.id);
      }

      const visible = isFacingCamera && inFrustum && !isBlocked;

      const old = previous[next.length];
      if (!old || old.data !== hotspot || old.visible !== visible) {
        changed = true;
      }
      if (old) {
        old.x = x;
        old.y = y;
      }

      next.push({ data: hotspot, x, y, visible });

      if (visible) {
        const element = this.getHotspotElement(hotspot.id);
        if (element) {
          element.style.left = `${x}px`;
          element.style.top = `${y}px`;
        }
      }
    }

    return changed || next.length !== previous.length ? next : null;
  }

  private isOccluded(id: string, target: THREE.Vector3, distance: number, camera: THREE.Camera, model: THREE.Object3D): boolean {
    const camPos = camera.position;
    const cached = this.occlusionCache.get(id);

    if (cached && cached.camPos.distanceToSquared(camPos) <= OCCLUSION_RECHECK_DIST_SQ) {
      return cached.blocked;
    }

    const dir = this.tmpRayDir.subVectors(target, camPos).divideScalar(distance);
    this.occlusionRaycaster.set(camPos, dir);
    // Only geometry between the camera and the hotspot matters (small bias avoids self-hits).
    this.occlusionRaycaster.far = Math.max(0, distance - 0.03);
    const blocked = this.occlusionRaycaster.intersectObject(model, true).length > 0;

    if (cached) {
      cached.blocked = blocked;
      cached.camPos.copy(camPos);
    } else {
      this.occlusionCache.set(id, { blocked, camPos: camPos.clone() });
    }

    return blocked;
  }

  private getHotspotElement(id: string): HTMLElement | null {
    const cached = this.hotspotElements.get(id);
    if (cached?.isConnected) {
      return cached;
    }

    const element = this.getOverlay().querySelector<HTMLElement>(
      `[data-hotspot-id="${CSS.escape(id)}"]`,
    );

    if (element) {
      this.hotspotElements.set(id, element);
    } else {
      this.hotspotElements.delete(id);
    }

    return element;
  }
}
