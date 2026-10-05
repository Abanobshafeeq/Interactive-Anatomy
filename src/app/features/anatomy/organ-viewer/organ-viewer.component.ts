import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';


import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { Organ, Hotspot } from '../../../core/models/organ.model';
import { HotspotStorageService } from '../../../core/services/hotspot-storage.service';

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

/** CPU copy of a texture used for colour picking (gum detection). */
interface TextureSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type TextureImage = CanvasImageSource & { width: number; height: number };

/** Largest dimension of the CPU texture copy; colour classification doesn't need full resolution. */
const MAX_TEXTURE_SAMPLE_SIZE = 1024;
/** Camera has to move this far (squared) before an occlusion raycast is redone. */
const OCCLUSION_RECHECK_DIST_SQ = 0.02;
/** Fallback outward-normal origin for hotspots without an explicit normal (model space). */
const HOTSPOT_FALLBACK_CENTER = new THREE.Vector3(0, 0.45, 0);

function createFirstHitRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  return raycaster;
}

@Component({
  selector: 'app-organ-viewer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './organ-viewer.component.html',
  styleUrl: './organ-viewer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true })
  private canvasContainer!: ElementRef<HTMLDivElement>;

  @ViewChild('hotspotsOverlay', { static: true })
  private hotspotsOverlay!: ElementRef<HTMLDivElement>;

  readonly organ = input.required<Organ>();

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private model?: THREE.Object3D;
  /** The organ whose model is currently loaded / loading. Guards against duplicate loads. */
  private loadedOrgan?: Organ;
  private animationId = 0;
  private resizeObserver?: ResizeObserver;
  private viewWidth = 1;
  private viewHeight = 1;

  // Shared manager so that textures streaming in after the model trigger a re-render.
  private readonly loadingManager = new THREE.LoadingManager(
    () => this.requestRender(),
    () => this.requestRender(),
  );
  private readonly gltfLoader = new GLTFLoader(this.loadingManager).setMeshoptDecoder(MeshoptDecoder);
  private readonly tdsLoader = new TDSLoader(this.loadingManager);

  private modelRequestId = 0;

  readonly isLoading = signal(false);

  readonly hotspots2D = signal<Hotspot2D[]>([]);
  readonly activeHotspot = signal<Hotspot | null>(null);

  readonly placementMode = signal(false);
  readonly pendingHotspot = signal<{ position: THREE.Vector3, normal: THREE.Vector3 } | null>(null);

  pendingName = '';
  pendingDescription = '';
  pendingValue: number | undefined;

  /** User's auto-rotate preference; actual rotation is paused while interacting with points. */
  private readonly autoRotateEnabled = signal(false);

  private readonly hotspotStorage = inject(HotspotStorageService);
  private readonly ngZone = inject(NgZone);

  // Render-on-demand flags: nothing is drawn unless something actually changed.
  private needsRender = true;
  private needsHotspotUpdate = true;

  // Hotspot state
  private readonly hotspotAnchors = new Map<string, HotspotAnchor>();
  private readonly hotspotElements = new Map<string, HTMLElement>();
  private readonly occlusionCache = new Map<string, { blocked: boolean, camPos: THREE.Vector3 }>();

  // Interaction state
  private readonly interactionRaycaster = createFirstHitRaycaster();
  private readonly occlusionRaycaster = createFirstHitRaycaster();
  private readonly mouse = new THREE.Vector2();
  private clickableMeshes: Set<string> | null = null;
  private pendingPointerMove: PointerEvent | null = null;
  private currentCursor = '';
  private readonly textureSamples = new WeakMap<object, TextureSample | null>();

  // Scratch objects reused every frame to avoid GC pressure.
  private readonly tmpViewDir = new THREE.Vector3();
  private readonly tmpRayDir = new THREE.Vector3();
  private readonly tmpProjected = new THREE.Vector3();
  private readonly tmpUv = new THREE.Vector2();
  private readonly tmpNormalMatrix = new THREE.Matrix3();

  constructor() {
    effect(() => {
      const organ = this.organ();

      untracked(() => {
        // Scene not ready yet (ngAfterViewInit does the first load), or this organ is already loaded.
        if (!this.scene || organ === this.loadedOrgan) {
          return;
        }

        this.ngZone.runOutsideAngular(() => this.loadModel(organ));
      });
    }, { allowSignalWrites: true });

    // Pause auto-rotate while a hotspot is open or a point is being placed, resume afterwards.
    effect(() => {
      const isInteracting = !!this.activeHotspot() || this.placementMode() || !!this.pendingHotspot();
      const shouldRotate = this.autoRotateEnabled() && !isInteracting;

      if (this.controls) {
        this.controls.autoRotate = shouldRotate;
      }
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.initScene();
      this.loadModel(this.organ());
      this.animate();
    });
  }

  private initScene(): void {
    const container = this.canvasContainer.nativeElement;

    this.viewWidth = container.clientWidth || 1;
    this.viewHeight = container.clientHeight || 1;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.viewWidth / this.viewHeight,
      0.1,
      1000,
    );

    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setSize(this.viewWidth, this.viewHeight);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.enablePan = false;

    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 8;

    this.controls.autoRotateSpeed = 1.5;

    this.controls.target.set(0, 0, 0);

    // Fired by controls.update() only when the camera actually moved (incl. damping & auto-rotate).
    this.controls.addEventListener('change', this.handleControlsChange);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2);

    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3);

    keyLight.position.set(4, 4,4);

    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffd6c8, 1.5);

    fillLight.position.set(-4, 2, 3);

    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffeee8, 1.2);

    rimLight.position.set(0, 5, -5);

    this.scene.add(rimLight);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);

    // Observes the container itself, so layout changes (not just window resizes) are handled.
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(container);
  }

  private loadModel(organ: Organ): void {
    const requestId = ++this.modelRequestId;
    const path = organ.model;
    const lowerPath = path.toLowerCase();

    this.loadedOrgan = organ;
    this.clickableMeshes = organ.clickableMeshes?.length ? new Set(organ.clickableMeshes) : null;

    this.resetInteractionState();
    this.clearHotspotState();

    if (this.model) {
      this.scene.remove(this.model);
      this.disposeModel(this.model);
      this.model = undefined;
    }

    this.isLoading.set(true);
    this.requestRender();
    this.needsHotspotUpdate = true;

    const onLoad = (object: THREE.Object3D, waitForTextures = false) => {
      if (requestId !== this.modelRequestId) {
        this.disposeModel(object);
        return;
      }

      this.model = object;

      this.prepareModel(object);
      this.scene.add(object);
      this.freezeModel(object);

      // Load custom hotspots and merge them
      const customHotspots = this.hotspotStorage.loadCustomHotspots(organ.id);
      organ.hotspots = (organ.hotspots ?? []).filter(h => !h.isCustom).concat(customHotspots);

      for (const hotspot of organ.hotspots) {
        this.registerHotspot(hotspot);
      }

      this.resetCamera();

      // OBJ + MTL: textures are still streaming in, the loading manager ends the loading state.
      if (!waitForTextures) {
        this.isLoading.set(false);
      }

      this.requestRender();
      this.needsHotspotUpdate = true;
    };

    const onError = (error: unknown) => {
      if (requestId !== this.modelRequestId) {
        return;
      }
      this.isLoading.set(false);
      console.error('Failed to load anatomy model:', error);
    };

    if (lowerPath.endsWith('.gltf') || lowerPath.endsWith('.glb')) {
      this.gltfLoader.load(path, (gltf) => onLoad(gltf.scene), undefined, onError);
    } else if (lowerPath.endsWith('.3ds')) {
      this.tdsLoader.load(path, (object) => onLoad(object), undefined, onError);
    } else if (lowerPath.endsWith('.obj')) {
      this.loadObj(path, requestId, onLoad, onError);
    } else if (lowerPath.endsWith('.mtl')) {
      const mtlLoader = new MTLLoader();
      mtlLoader.load(
        path,
        (_materials) => {
          // MTL file just contains materials. Create a dummy object to satisfy the viewer.
          const dummyGroup = new THREE.Group();
          onLoad(dummyGroup);
        },
        undefined,
        onError
      );
    } else {
      this.isLoading.set(false);
      console.error('Unsupported model format:', path);
    }
  }

  private loadObj(
    path: string,
    requestId: number,
    onLoad: (object: THREE.Object3D, waitForTextures?: boolean) => void,
    onError: (error: unknown) => void,
  ): void {
    const mtlPath = path.substring(0, path.lastIndexOf('.')) + '.mtl';
    const basePath = path.substring(0, path.lastIndexOf('/') + 1);

    // Dedicated manager so we know when the MTL textures have finished loading.
    const manager = new THREE.LoadingManager();
    manager.onProgress = () => this.requestRender();
    manager.onLoad = () => {
      if (this.model && requestId === this.modelRequestId) {
        this.model.visible = true;
        this.isLoading.set(false);
        this.requestRender();
      }
    };

    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setResourcePath(basePath);

    mtlLoader.load(
      mtlPath,
      (materials) => {
        if (requestId !== this.modelRequestId) {
          return;
        }
        materials.preload();
        // Create a fresh loader to avoid polluting a shared instance with these materials
        const loader = new OBJLoader(manager);
        loader.setMaterials(materials);
        loader.load(path, (obj) => {
          obj.visible = false; // Hide until textures are fully loaded
          onLoad(obj, true);
        }, undefined, onError);
      },
      undefined,
      (error) => {
        if (requestId !== this.modelRequestId) {
          return;
        }
        console.warn('Failed to load MTL for OBJ, falling back to geometry only.', error);
        new OBJLoader(this.loadingManager).load(path, (obj) => onLoad(obj), undefined, onError);
      }
    );
  }

  private prepareModel(model: THREE.Object3D): void {
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && !mesh.geometry.boundsTree) {
        mesh.geometry.computeBoundsTree();
      }
    });

    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);
    if (maxSize > 0) {
      const scale = 2 / maxSize;
      model.scale.setScalar(scale);
      model.position.copy(center).multiplyScalar(-scale);
    } else {
      model.position.copy(center).multiplyScalar(-1);
    }
  }

  /**
   * The model never moves after it's been centred (only the camera orbits), so compute its
   * matrices once and stop three.js from recomputing them for every node on every frame.
   */
  private freezeModel(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      child.matrixAutoUpdate = false;
    });
  }

  /** Converts a hotspot to a world-space anchor once, instead of every frame. */
  private registerHotspot(hotspot: Hotspot): void {
    const position = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);

    const normal = hotspot.normal
      ? new THREE.Vector3(hotspot.normal.x, hotspot.normal.y, hotspot.normal.z).normalize()
      // Fallback outward normal relative to model center
      : position.clone().sub(HOTSPOT_FALLBACK_CENTER).normalize();

    // Built-in hotspots are authored in model space; custom ones are saved in world space.
    if (!hotspot.isCustom && this.model) {
      position.applyMatrix4(this.model.matrixWorld);
      normal.transformDirection(this.model.matrixWorld);
    }

    this.hotspotAnchors.set(hotspot.id, { position, normal });
  }

  private removeHotspotState(id: string): void {
    this.hotspotAnchors.delete(id);
    this.hotspotElements.delete(id);
    this.occlusionCache.delete(id);
  }

  private clearHotspotState(): void {
    this.hotspotAnchors.clear();
    this.hotspotElements.clear();
    this.occlusionCache.clear();
  }

  private resetInteractionState(): void {
    if (this.placementMode()) {
      this.togglePlacementMode();
    } else {
      this.clearHotspot();
    }
  }

  resetCamera(): void {
    if (!this.camera || !this.controls) {
      return;
    }
    this.camera.position.set(0, 0, 4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
    this.needsHotspotUpdate = true;
  }

  toggleAutoRotate(): void {
    this.autoRotateEnabled.update(enabled => !enabled);
  }

  private disposeModel(model: THREE.Object3D): void {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }

      mesh.geometry?.disposeBoundsTree?.();
      mesh.geometry?.dispose();

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) {
          continue;
        }
        // Release every texture referenced by the material (map, normalMap, roughnessMap, ...)
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
            const image = value.image;
            if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
              image.close();
            }
          }
        }
        material.dispose();
      }
    });
  }

  private requestRender(): void {
    this.needsRender = true;
  }

  private handleControlsChange = (): void => {
    this.needsRender = true;
    this.needsHotspotUpdate = true;
  };

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Pointer moves are coalesced to at most one raycast per frame.
    if (this.pendingPointerMove) {
      const event = this.pendingPointerMove;
      this.pendingPointerMove = null;
      this.processPointerMove(event);
    }

    // Must run every frame for damping / auto-rotate; emits 'change' only when the camera moves.
    this.controls.update();

    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    }

    if (this.needsHotspotUpdate) {
      this.needsHotspotUpdate = false;
      this.updateHotspots();
    }
  };

  /**
   * Projects hotspots to screen space.
   * Positions are written straight to the DOM every frame; the `hotspots2D` signal is only
   * updated when the list or a hotspot's visibility changes, so camera movement doesn't
   * trigger Angular change detection on every frame.
   */
  private updateHotspots(): void {
    const hotspots = this.loadedOrgan?.hotspots;
    if (!hotspots?.length || !this.model) {
      if (this.hotspots2D().length > 0) {
        this.hotspots2D.set([]);
      }
      return;
    }

    const width = this.viewWidth;
    const height = this.viewHeight;
    const camPos = this.camera.position;

    const previous = this.hotspots2D();
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
      const projected = this.tmpProjected.copy(worldPosition).project(this.camera);

      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const inFrustum = projected.z < 1 && projected.z > -1;

      // 3. Line-of-sight raycast: only when the hotspot could actually be visible
      let isBlocked = false;
      if (isFacingCamera && inFrustum) {
        isBlocked = this.isOccluded(hotspot.id, worldPosition, distance);
      } else {
        this.occlusionCache.delete(hotspot.id);
      }

      const visible = isFacingCamera && inFrustum && !isBlocked;

      const old = previous[next.length];
      if (!old || old.data !== hotspot || old.visible !== visible) {
        changed = true;
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

    if (changed || next.length !== previous.length) {
      this.hotspots2D.set(next);
    }
  }

  /** Detects if organ tissue blocks the view between the camera and a hotspot (cached). */
  private isOccluded(id: string, target: THREE.Vector3, distance: number): boolean {
    const camPos = this.camera.position;
    const cached = this.occlusionCache.get(id);

    if (cached && cached.camPos.distanceToSquared(camPos) <= OCCLUSION_RECHECK_DIST_SQ) {
      return cached.blocked;
    }

    const dir = this.tmpRayDir.subVectors(target, camPos).divideScalar(distance);
    this.occlusionRaycaster.set(camPos, dir);
    // Only geometry between the camera and the hotspot matters (small bias avoids self-hits).
    this.occlusionRaycaster.far = Math.max(0, distance - 0.03);
    const blocked = this.occlusionRaycaster.intersectObject(this.model!, true).length > 0;

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

    const element = this.hotspotsOverlay.nativeElement.querySelector<HTMLElement>(
      `[data-hotspot-id="${CSS.escape(id)}"]`,
    );

    if (element) {
      this.hotspotElements.set(id, element);
    } else {
      this.hotspotElements.delete(id);
    }

    return element;
  }

  selectHotspot(hotspot: Hotspot): void {
    this.activeHotspot.set(hotspot);
  }

  clearHotspot(): void {
    this.activeHotspot.set(null);
  }

  private handleResize = (): void => {
    if (!this.camera || !this.renderer) {
      return;
    }

    const container = this.canvasContainer.nativeElement;

    const width = container.clientWidth;

    const height = container.clientHeight;

    if (!width || !height || (width === this.viewWidth && height === this.viewHeight)) {
      return;
    }

    this.viewWidth = width;
    this.viewHeight = height;

    this.camera.aspect = width / height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    // Resizing clears the drawing buffer: draw immediately to avoid a blank frame.
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
    this.needsHotspotUpdate = true;
  };

  private updateMouse(event: PointerEvent): void {
    const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** Raycasts the pointer against the model, honouring `clickableMeshes` and gum filtering. */
  private pickSurface(event: PointerEvent): THREE.Intersection | undefined {
    if (!this.model) {
      return undefined;
    }

    this.updateMouse(event);
    this.interactionRaycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.interactionRaycaster.intersectObject(this.model, true);

    const allowed = this.clickableMeshes;
    if (!allowed) {
      return intersects[0];
    }

    // If clickableMeshes is defined, we also perform texture-based filtering for gums
    return intersects.find(i => allowed.has(i.object.name) && !this.checkIsGum(i));
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.placementMode()) {
      this.pendingPointerMove = event;
    }
  };

  private processPointerMove(event: PointerEvent): void {
    if (!this.placementMode()) {
      return;
    }
    this.setCursor(this.pickSurface(event) ? 'crosshair' : 'default');
  }

  private setCursor(cursor: string): void {
    if (cursor === this.currentCursor) {
      return;
    }
    this.currentCursor = cursor;
    this.canvasContainer.nativeElement.style.cursor = cursor;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return; // Only left click

    // Only proceed if clicking on the canvas directly
    if (event.target !== this.renderer.domElement) return;

    if (!this.placementMode()) return;
    if (this.pendingHotspot()) return; // Wait until current point is handled

    const hit = this.pickSurface(event);
    if (!hit?.face) return;

    // Use world space position directly from raycaster
    const point = hit.point.clone();
    // Extract normal in world space
    this.tmpNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(this.tmpNormalMatrix).normalize();

    this.pendingHotspot.set({ position: point, normal: worldNormal });
  };

  togglePlacementMode(): void {
    const isPlacing = !this.placementMode();
    this.placementMode.set(isPlacing);
    if (this.controls) {
      this.controls.enabled = !isPlacing; // Disable camera rotation while placing
    }
    if (!isPlacing) {
      this.cancelPlacement();
      this.pendingPointerMove = null;
      this.setCursor('default');
    }
    this.clearHotspot();
  }

  cancelPlacement(): void {
    this.pendingHotspot.set(null);
    this.pendingName = '';
    this.pendingDescription = '';
    this.pendingValue = undefined;
  }

  confirmPlacement(): void {
    const data = this.pendingHotspot();
    const organ = this.loadedOrgan;
    if (!data || !organ || !this.pendingName.trim()) return;

    const newHotspot: Hotspot = {
      id: `custom-${Date.now()}`,
      name: this.pendingName.trim(),
      description: this.pendingDescription.trim(),
      value: this.pendingValue,
      position: { x: data.position.x, y: data.position.y, z: data.position.z },
      normal: { x: data.normal.x, y: data.normal.y, z: data.normal.z },
      isCustom: true
    };

    // Update active model array
    (organ.hotspots ??= []).push(newHotspot);

    // Persist
    this.hotspotStorage.saveCustomHotspots(organ.id, organ.hotspots);

    // Register the new point directly; no need to reload the whole model
    this.registerHotspot(newHotspot);
    this.needsHotspotUpdate = true;

    this.togglePlacementMode(); // Exit mode
  }

  deleteHotspot(id: string): void {
    const organ = this.loadedOrgan;
    if (!organ?.hotspots) return;

    // Remove from array
    organ.hotspots = organ.hotspots.filter(h => h.id !== id);

    // Save to storage
    this.hotspotStorage.saveCustomHotspots(organ.id, organ.hotspots);

    // Drop cached state for the point; no need to reload the whole model
    this.removeHotspotState(id);
    this.needsHotspotUpdate = true;

    this.clearHotspot();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);

    ++this.modelRequestId;

    this.resizeObserver?.disconnect();

    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
      canvas.removeEventListener('pointermove', this.handlePointerMove);
    }

    this.controls?.removeEventListener('change', this.handleControlsChange);
    this.controls?.dispose();

    if (this.model) {
      this.disposeModel(this.model);
      this.model = undefined;
    }

    this.clearHotspotState();

    if (this.renderer) {
      this.renderer.dispose();
      // Free the WebGL context right away (browsers cap the number of live contexts)
      this.renderer.forceContextLoss();
      canvas?.remove();
    }
  }

  private checkIsGum(hit: THREE.Intersection): boolean {
    if (!hit.uv) return false;

    const mesh = hit.object as THREE.Mesh;
    const material = Array.isArray(mesh.material)
      ? mesh.material[hit.face?.materialIndex ?? 0]
      : mesh.material;
    const texture = (material as THREE.MeshStandardMaterial | undefined)?.map;
    const image = texture?.image as unknown as TextureImage | undefined;
    if (!texture || !image) return false;

    const sample = this.getTextureSample(image);
    if (!sample) return false;

    // Applies the texture's offset/repeat/wrapping and flipY (UV y is inverted for most WebGL textures)
    const uv = texture.transformUv(this.tmpUv.copy(hit.uv));
    const x = Math.min(sample.width - 1, Math.max(0, Math.floor(uv.x * sample.width)));
    const y = Math.min(sample.height - 1, Math.max(0, Math.floor(uv.y * sample.height)));

    const index = (y * sample.width + x) * 4;
    const r = sample.data[index];
    const g = sample.data[index + 1];
    const b = sample.data[index + 2];

    // Gums and tongue are pink/red. Teeth are white/yellow.
    // Pink means red is significantly higher than green and blue.
    return r > g + 25 && r > b + 25 && g < 180; // true = Rejected as Gum
  }

  /**
   * Reads a texture back to the CPU once and caches it, so picking is a plain array lookup
   * instead of a GPU readback (drawImage + getImageData) on every pointer move.
   */
  private getTextureSample(image: TextureImage): TextureSample | null {
    const cached = this.textureSamples.get(image);
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

    this.textureSamples.set(image, sample);
    return sample;
  }
}
