// These examples are type-checked independently and displayed as text in the portal.
// They are never imported by the documentation runtime.
import { Component, signal } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ModelLoader } from '../../src/app/features/anatomy/organ-viewer/scene/model-loader';
import { prepareModel, freezeModel } from '../../src/app/features/anatomy/organ-viewer/scene/model-preparation';
import { disposeModel } from '../../src/app/features/anatomy/organ-viewer/scene/resource-disposer';
import { CameraController } from '../../src/app/features/anatomy/organ-viewer/camera/camera-controller';
import { PickingController } from '../../src/app/features/anatomy/organ-viewer/interactions/picking-controller';
import { HotspotProjection, type Hotspot2D } from '../../src/app/features/anatomy/organ-viewer/hotspots/hotspot-projection';
import { composeScreenshot } from '../../src/app/features/anatomy/organ-viewer/screenshots/screenshot-capture';
import { DentalTextureSampler, getDentalDiffuseImage } from '../../src/app/features/anatomy/organ-viewer/dental/dental-texture';
import { computeToothBounds } from '../../src/app/features/anatomy/organ-viewer/dental/dental-geometry';
import { renderDentalColors } from '../../src/app/features/anatomy/organ-viewer/dental/dental-color-renderer';
import { DentalService } from '../../src/app/core/services/dental.service';
import type { Hotspot, Organ } from '../../src/app/core/models/organ.model';
import type { ToothState } from '../../src/app/core/models/dental.model';
import { OrganViewerComponent } from '../../src/app/features/anatomy/organ-viewer/organ-viewer.component';

export function reuseModelLoader(scene: THREE.Scene, requestRender: () => void, reportError: (error: unknown) => void): () => void {
  let current: THREE.Object3D | undefined;
  const loader = new ModelLoader(requestRender);
  loader.load('/models/brain.glb', {
    loaded(object, waitForTextures) {
      if (current) { scene.remove(current); disposeModel(current); }
      current = object;
      // Optional project policy: this preparation normalizes and adds BVHs.
      prepareModel(object);
      scene.add(object);
      freezeModel(object); // Static models only.
      object.visible = !waitForTextures;
      requestRender();
    },
    texturesReady() { if (current) { current.visible = true; requestRender(); } },
    error: reportError,
    unsupported() { reportError(new Error('Unsupported model suffix')); },
  });
  return () => {
    loader.dispose(); // Invalidates pending callbacks; does not cancel downloads.
    if (current) { scene.remove(current); disposeModel(current); current = undefined; }
  };
}

export function reuseCamera(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, requestRender: () => void): () => void {
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 0.4;
  controls.maxDistance = 8;
  // No damping in this minimal example, so an event-triggered frame suffices.
  controls.enableDamping = false;
  controls.addEventListener('change', requestRender);
  const navigation = new CameraController();
  navigation.reset(camera, controls);
  if (navigation.step(camera, controls, 'zoomIn', 1)) requestRender();
  return () => { controls.removeEventListener('change', requestRender); controls.dispose(); };
}

export function reusePicking(canvas: HTMLCanvasElement, camera: THREE.Camera, model: THREE.Object3D,
  onHit: (point: THREE.Vector3, normal: THREE.Vector3) => void): () => void {
  const picker = new PickingController(() => false); // No dental masking.
  const pick = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    camera.updateMatrixWorld(); model.updateMatrixWorld(true);
    const hit = picker.pick(event, canvas.getBoundingClientRect(), camera, model, null);
    if (hit?.face) onHit(hit.point.clone(), picker.surfaceNormal(hit.face.normal, hit.object.matrixWorld));
  };
  canvas.addEventListener('pointerup', pick);
  return () => canvas.removeEventListener('pointerup', pick);
}

export function reuseHotspots(overlay: HTMLElement, model: THREE.Object3D, camera: THREE.PerspectiveCamera,
  hotspots: Hotspot[]): { update: () => void; dispose: () => void } {
  overlay.style.position = 'relative';
  const projection = new HotspotProjection(() => overlay);
  let previous: Hotspot2D[] = [];
  model.updateMatrixWorld(true);
  for (const hotspot of hotspots) {
    const marker = document.createElement('button');
    marker.dataset['hotspotId'] = hotspot.id;
    marker.textContent = hotspot.name;
    marker.setAttribute('aria-label', hotspot.name);
    marker.style.position = 'absolute';
    marker.style.transform = 'translate(-50%, -50%)';
    overlay.append(marker);
    projection.register(hotspot, model);
  }
  return {
    update() {
      camera.updateMatrixWorld();
      const next = projection.project(hotspots, model, camera, overlay.clientWidth, overlay.clientHeight, previous);
      if (next !== null) previous = next;
      for (const item of previous) {
        const marker = overlay.querySelector<HTMLElement>(`[data-hotspot-id="${CSS.escape(item.data.id)}"]`);
        if (marker) marker.hidden = !item.visible;
      }
    },
    dispose() { projection.clear(); overlay.replaceChildren(); },
  };
}

export function reuseScreenshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  width: number, height: number, hotspots: readonly Hotspot2D[]): string | null {
  renderer.render(scene, camera); // Read the fresh frame in the same turn.
  return composeScreenshot(renderer.domElement, width, height, hotspots);
}

export function reuseDental(model: THREE.Object3D, dental: DentalService, requestRender: () => void): void {
  // dental must come from Angular DI, or be replaced by an adapter with the exact Pick contracts.
  // Input must be the original teeth.OBJ, with MTL/textures ready. This is one-time preparation.
  prepareModel(model);
  freezeModel(model);
  const sampler = new DentalTextureSampler(dental);
  const image = getDentalDiffuseImage(model);
  const sample = image ? sampler.getSample(image) : null;
  const bounds = computeToothBounds(model, sample, dental);
  for (const [number, bound] of bounds) {
    dental.calibrateToothCenter(number, bound.anchor, { width: bound.maxH - bound.minH, height: bound.maxY - bound.minY });
  }
  const states = new Map<number, ToothState>([[8, { divisionMode: 4, zones: { q1: '#4A9CFF' } }]]);
  renderDentalColors(model, dental, {
    sample, statesMap: states, selectedTooth: dental.getTooth(8) ?? null,
    showGrid: true, activeMode: 4, boundsMap: bounds,
  });
  requestRender(); // Caller retains model and eventually disposes it.
}

@Component({
  selector: 'example-anatomy-host', standalone: true, imports: [OrganViewerComponent],
  template: '<div style="height: 80vh; min-height: 480px"><app-organ-viewer [organ]="organ()" /></div>',
})
export class EmbedAnatomyExample {
  readonly organ = signal<Organ>({
    id: 'brain', name: 'Brain', description: 'Embedded model', function: 'Demonstration',
    image: '/anatomy/brain/thumb.webp', model: '/models/brain.glb', hotspots: [],
  });
}
