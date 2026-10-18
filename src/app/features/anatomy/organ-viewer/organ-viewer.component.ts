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
import {
  ToothData,
  ToothQuadrant,
  DivisionMode,
  ToothState,
  DENTAL_SHADE_PRESETS,
  DentalShadePreset,
} from '../../../core/models/dental.model';
import { DentalService, ToothEnamelBounds } from '../../../core/services/dental.service';

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
  private readonly dentalService = inject(DentalService);
  private readonly ngZone = inject(NgZone);

  // Dental interactive state
  readonly hoveredTooth = signal<{
    number: number;
    name: string;
    type: string;
    isUpper: boolean;
    zoneLabel?: string;
    x: number;
    y: number;
  } | null>(null);

  readonly selectedTooth = signal<ToothData | null>(null);
  readonly divisionMode = signal<DivisionMode>(4);
  readonly selectedParts = signal<Set<string>>(new Set(['q1', 'q2', 'q3', 'q4']));
  readonly showGridLines = signal<boolean>(true);
  readonly activeColor = signal<string>('#4A9CFF');
  readonly toothColors = signal<Map<number, ToothState>>(new Map());
  readonly shadePresets = DENTAL_SHADE_PRESETS;
  private pointerDownCoord = { x: 0, y: 0, time: 0 };
  private toothBoundsMap = new Map<number, ToothEnamelBounds>();

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
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);

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
        if (this.isDentalModel()) {
          this.updateMeshVertexColors();
        }
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
        for (const mat of Object.values(materials.materials)) {
          mat.vertexColors = true;
        }
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
      if (mesh.isMesh && mesh.geometry) {
        if (mesh.name === 'Group1014' || mesh.name === 'Group1059') {
          if (mesh.geometry.index !== null) {
            mesh.geometry = mesh.geometry.toNonIndexed();
            mesh.geometry.computeVertexNormals();
          }
        }
        if (!mesh.geometry.attributes['color']) {
          const count = mesh.geometry.attributes['position'].count;
          const colors = new Float32Array(count * 3).fill(1.0);
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            m.vertexColors = true;
            m.needsUpdate = true;
          });
        } else if (mesh.material) {
          mesh.material.vertexColors = true;
          mesh.material.needsUpdate = true;
        }
        if (!mesh.geometry.boundsTree) {
          mesh.geometry.computeBoundsTree();
        }
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
    this.hoveredTooth.set(null);
    this.selectedTooth.set(null);
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
    if (this.placementMode() || this.isDentalModel()) {
      this.pendingPointerMove = event;
    }
  };

  private processPointerMove(event: PointerEvent): void {
    if (this.placementMode()) {
      this.setCursor(this.pickSurface(event) ? 'crosshair' : 'default');
      if (this.hoveredTooth()) {
        this.ngZone.run(() => this.hoveredTooth.set(null));
      }
      return;
    }

    if (this.isDentalModel()) {
      const hit = this.pickSurface(event);
      if (hit && (hit.object.name === 'Group1014' || hit.object.name === 'Group1059') && !this.checkIsGum(hit)) {
        const isUpper = hit.object.name === 'Group1059';
        const localPt = hit.object.worldToLocal(hit.point.clone());
        const tooth = this.dentalService.identifyTooth(localPt.x, localPt.y, localPt.z, isUpper);

        const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        this.setCursor('pointer');
        this.ngZone.run(() => {
          this.hoveredTooth.set({
            number: tooth.number,
            name: tooth.name,
            type: tooth.type,
            isUpper: tooth.isUpper,
            x,
            y,
          });
        });
        return;
      } else {
        if (this.hoveredTooth()) {
          this.ngZone.run(() => this.hoveredTooth.set(null));
        }
        this.setCursor('default');
      }
    }
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
    if (event.target !== this.renderer.domElement) return;

    this.pointerDownCoord = { x: event.clientX, y: event.clientY, time: Date.now() };

    if (!this.placementMode()) return;
    if (this.pendingHotspot()) return;

    const hit = this.pickSurface(event);
    if (!hit?.face) return;

    const point = hit.point.clone();
    this.tmpNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(this.tmpNormalMatrix).normalize();

    this.pendingHotspot.set({ position: point, normal: worldNormal });
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.placementMode()) return;

    const dx = event.clientX - this.pointerDownCoord.x;
    const dy = event.clientY - this.pointerDownCoord.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 6 && (Date.now() - this.pointerDownCoord.time < 500)) {
      if (this.isDentalModel()) {
        const hit = this.pickSurface(event);
        if (hit && (hit.object.name === 'Group1014' || hit.object.name === 'Group1059') && !this.checkIsGum(hit)) {
          const isUpper = hit.object.name === 'Group1059';
          const localPt = hit.object.worldToLocal(hit.point.clone());
          const tooth = this.dentalService.identifyTooth(localPt.x, localPt.y, localPt.z, isUpper);

          this.selectTooth(tooth, localPt);
        }
      }
    }
  };

  private handlePointerLeave = (): void => {
    if (this.hoveredTooth()) {
      this.ngZone.run(() => this.hoveredTooth.set(null));
    }
  };

  isDentalModel(): boolean {
    return this.loadedOrgan?.id === 'teeth-obj' ||
      (this.clickableMeshes?.has('Group1014') ?? false) ||
      (this.clickableMeshes?.has('Group1059') ?? false);
  }

  selectTooth(tooth: ToothData, clickedPoint?: { x: number; y: number; z: number }): void {
    this.ngZone.run(() => {
      this.selectedTooth.set(tooth);
      const state = this.toothColors().get(tooth.number);
      if (state) {
        this.divisionMode.set(state.divisionMode);
      }
      this.selectAllParts();
      this.updateMeshVertexColors();
    });
  }

  closeToothPanel(): void {
    this.selectedTooth.set(null);
    this.updateMeshVertexColors();
  }

  setDivisionMode(mode: DivisionMode): void {
    this.divisionMode.set(mode);
    this.selectAllParts();

    const tooth = this.selectedTooth();
    if (tooth) {
      const toothMap = new Map(this.toothColors());
      const state = toothMap.get(tooth.number);
      if (state) {
        state.divisionMode = mode;
        toothMap.set(tooth.number, { ...state });
        this.toothColors.set(toothMap);
      }
    }
    this.updateMeshVertexColors();
  }

  toggleGridLines(): void {
    this.showGridLines.update(v => !v);
    this.updateMeshVertexColors();
  }

  togglePart(partId: string): void {
    const current = new Set(this.selectedParts());
    if (current.has(partId)) {
      if (current.size > 1) {
        current.delete(partId);
      }
    } else {
      current.add(partId);
    }
    this.selectedParts.set(current);
  }

  isPartSelected(partId: string): boolean {
    return this.selectedParts().has(partId);
  }

  selectAllParts(): void {
    const mode = this.divisionMode();
    if (mode === 1) {
      this.selectedParts.set(new Set(['full']));
    } else if (mode === 2) {
      this.selectedParts.set(new Set(['left', 'right']));
    } else if (mode === 3) {
      this.selectedParts.set(new Set(['top', 'middle', 'bottom']));
    } else {
      this.selectedParts.set(new Set(['q1', 'q2', 'q3', 'q4']));
    }
  }

  applyColor(colorHex: string): void {
    const tooth = this.selectedTooth();
    if (!tooth) return;

    this.activeColor.set(colorHex);
    const toothMap = new Map(this.toothColors());
    const mode = this.divisionMode();
    const state: ToothState = toothMap.get(tooth.number) ?? {
      divisionMode: mode,
      zones: {}
    };

    state.divisionMode = mode;
    state.zones = { ...state.zones };
    const selected = this.selectedParts();

    if (mode === 1) {
      state.zones['q1'] = colorHex;
      state.zones['q2'] = colorHex;
      state.zones['q3'] = colorHex;
      state.zones['q4'] = colorHex;
    } else if (mode === 2) {
      if (selected.has('left')) {
        state.zones['q1'] = colorHex;
        state.zones['q3'] = colorHex;
      }
      if (selected.has('right')) {
        state.zones['q2'] = colorHex;
        state.zones['q4'] = colorHex;
      }
    } else if (mode === 3) {
      for (const part of selected) {
        state.zones[part] = colorHex;
      }
    } else {
      for (const quad of selected) {
        state.zones[quad] = colorHex;
      }
    }

    toothMap.set(tooth.number, state);
    this.toothColors.set(toothMap);
    this.updateMeshVertexColors();
  }

  getPartColor(toothNumber: number, partId: string): string {
    const state = this.toothColors().get(toothNumber);
    if (!state?.zones) return '#FAF9F5';
    if (partId === 'full') {
      return state.zones['q1'] || state.zones['q2'] || '#FAF9F5';
    }
    if (partId === 'left') {
      return state.zones['q1'] || state.zones['q3'] || '#FAF9F5';
    }
    if (partId === 'right') {
      return state.zones['q2'] || state.zones['q4'] || '#FAF9F5';
    }
    return state.zones[partId] || '#FAF9F5';
  }

  resetCurrentTooth(): void {
    const tooth = this.selectedTooth();
    if (!tooth) return;

    const toothMap = new Map(this.toothColors());
    toothMap.delete(tooth.number);
    this.toothColors.set(toothMap);
    this.updateMeshVertexColors();
  }

  resetAllTeeth(): void {
    this.toothColors.set(new Map());
    this.updateMeshVertexColors();
  }

  /**
   * Precomputes full-crown geometric boundaries across all white enamel triangles
   * so Q1..Q4, Halves, and Thirds cover 100% of the tooth surface edge-to-edge.
   */
  private computeAllToothBounds(): void {
    if (!this.model) return;
    const image = this.getDentalDiffuseImage();
    const sample = image ? this.getTextureSample(image) : null;

    const accum = new Map<number, { minX: number; maxX: number; minY: number; maxY: number }>();

    this.model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'Group1014' && mesh.name !== 'Group1059')) return;

      const isUpper = mesh.name === 'Group1059';
      const geo = mesh.geometry;
      const pos = geo.attributes['position'];
      const uvAttr = geo.attributes['uv'];
      const triCount = Math.floor(pos.count / 3);

      for (let t = 0; t < triCount; t++) {
        const i0 = t * 3;
        const i1 = i0 + 1;
        const i2 = i0 + 2;

        const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
        const cy = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
        const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;

        // Vertical gum cutoff
        if (isUpper && cy > 4.5) continue;
        if (!isUpper && cy < -14.6) continue;

        // Texture check: skip gums
        if (sample && uvAttr) {
          const cu = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;
          const cv = (uvAttr.getY(i0) + uvAttr.getY(i1) + uvAttr.getY(i2)) / 3;
          const sx = Math.min(sample.width - 1, Math.max(0, Math.floor(cu * sample.width)));
          const sy = Math.min(sample.height - 1, Math.max(0, Math.floor((1.0 - cv) * sample.height)));
          const sIndex = (sy * sample.width + sx) * 4;
          const r = sample.data[sIndex];
          const g = sample.data[sIndex + 1];
          const b = sample.data[sIndex + 2];
          if (this.dentalService.isGumPixel(r, g, b)) {
            continue;
          }
        }

        const tooth = this.dentalService.identifyTooth(cx, cy, cz, isUpper);
        let b = accum.get(tooth.number);
        if (!b) {
          b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          accum.set(tooth.number, b);
        }
        b.minX = Math.min(b.minX, cx);
        b.maxX = Math.max(b.maxX, cx);
        b.minY = Math.min(b.minY, cy);
        b.maxY = Math.max(b.maxY, cy);
      }
    });

    for (const [num, b] of accum.entries()) {
      const tooth = this.dentalService.getTooth(num);
      const midX = (b.minX + b.maxX) / 2;
      const midY = (b.minY + b.maxY) / 2;
      this.toothBoundsMap.set(num, {
        toothNumber: num,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        midX,
        midY,
        anchor: tooth ? tooth.center : { x: midX, y: midY, z: 0 }
      });
    }
  }

  /**
   * Colors the dental meshes triangle-by-triangle (3 non-indexed vertices per triangle)
   * so every triangle has a single uniform color. This eliminates GPU gradient blur
   * and creates razor-sharp CAD-like boundaries between quadrants.
   */
  updateMeshVertexColors(): void {
    if (!this.model) return;

    if (this.toothBoundsMap.size === 0) {
      this.computeAllToothBounds();
    }

    const image = this.getDentalDiffuseImage();
    const sample = image ? this.getTextureSample(image) : null;
    const statesMap = this.toothColors();
    const selectedTooth = this.selectedTooth();
    const showGrid = this.showGridLines();
    const activeMode = this.divisionMode();

    this.model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'Group1014' && mesh.name !== 'Group1059')) return;

      const isUpper = mesh.name === 'Group1059';
      const geo = mesh.geometry;
      const pos = geo.attributes['position'];
      const uvAttr = geo.attributes['uv'];
      let colorAttr = geo.attributes['color'] as THREE.BufferAttribute;

      if (!colorAttr) {
        const colors = new Float32Array(pos.count * 3).fill(1.0);
        colorAttr = new THREE.BufferAttribute(colors, 3);
        geo.setAttribute('color', colorAttr);
      }

      const colorArray = colorAttr.array as Float32Array;
      const triCount = Math.floor(pos.count / 3);

      for (let t = 0; t < triCount; t++) {
        const i0 = t * 3;
        const i1 = i0 + 1;
        const i2 = i0 + 2;

        const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
        const cy = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
        const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;

        // 1. Spatial vertical gum cutoff
        if (isUpper && cy > 4.5) {
          this.setTriangleColor(colorArray, i0, i1, i2, 1.0, 1.0, 1.0);
          continue;
        }
        if (!isUpper && cy < -14.6) {
          this.setTriangleColor(colorArray, i0, i1, i2, 1.0, 1.0, 1.0);
          continue;
        }

        // 2. Texture gum filter
        if (sample && uvAttr) {
          const cu = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;
          const cv = (uvAttr.getY(i0) + uvAttr.getY(i1) + uvAttr.getY(i2)) / 3;
          const sx = Math.min(sample.width - 1, Math.max(0, Math.floor(cu * sample.width)));
          const sy = Math.min(sample.height - 1, Math.max(0, Math.floor((1.0 - cv) * sample.height)));
          const sIndex = (sy * sample.width + sx) * 4;
          const r = sample.data[sIndex];
          const g = sample.data[sIndex + 1];
          const b = sample.data[sIndex + 2];
          if (this.dentalService.isGumPixel(r, g, b)) {
            this.setTriangleColor(colorArray, i0, i1, i2, 1.0, 1.0, 1.0);
            continue;
          }
        }

        // 3. Closest tooth assignment
        const tooth = this.dentalService.identifyTooth(cx, cy, cz, isUpper);
        const state = statesMap.get(tooth.number);
        const isToothSelected = selectedTooth?.number === tooth.number;
        const mode = isToothSelected ? activeMode : (state?.divisionMode ?? 4);
        const bounds = this.toothBoundsMap.get(tooth.number);

        // 4. Divider grid lines for active selected tooth
        if (isToothSelected && showGrid && mode !== 1) {
          if (this.dentalService.isNearBoundary(cx, cy, tooth, mode, bounds)) {
            // Crisp CAD grid line: pure white [1, 1, 1]
            this.setTriangleColor(colorArray, i0, i1, i2, 1.0, 1.0, 1.0);
            continue;
          }
        }

        // 5. Dynamic zone clinical restoration coloring
        if (state?.zones) {
          let colorHex: string | undefined;
          if (state.divisionMode === 3) {
            const third = this.dentalService.getThird(cy, tooth, bounds);
            colorHex = state.zones[third];
          } else {
            const quad = this.dentalService.getQuadrant(cx, cy, tooth, bounds);
            colorHex = state.zones[quad];
          }

          if (colorHex) {
            const rgb = this.dentalService.hexToRgb(colorHex);
            this.setTriangleColor(colorArray, i0, i1, i2, rgb[0], rgb[1], rgb[2]);
            continue;
          }
        }

        // Default unaltered enamel
        this.setTriangleColor(colorArray, i0, i1, i2, 1.0, 1.0, 1.0);
      }

      colorAttr.needsUpdate = true;
    });

    this.requestRender();
  }

  private setTriangleColor(arr: Float32Array, i0: number, i1: number, i2: number, r: number, g: number, b: number): void {
    const idx0 = i0 * 3;
    const idx1 = i1 * 3;
    const idx2 = i2 * 3;
    arr[idx0] = r; arr[idx0 + 1] = g; arr[idx0 + 2] = b;
    arr[idx1] = r; arr[idx1 + 1] = g; arr[idx1 + 2] = b;
    arr[idx2] = r; arr[idx2 + 1] = g; arr[idx2 + 2] = b;
  }

  private getDentalDiffuseImage(): TextureImage | null {
    let image: TextureImage | null = null;
    this.model?.traverse((child) => {
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
      canvas.removeEventListener('pointerup', this.handlePointerUp);
      canvas.removeEventListener('pointermove', this.handlePointerMove);
      canvas.removeEventListener('pointerleave', this.handlePointerLeave);
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
    if (!hit.uv) return true;

    const mesh = hit.object as THREE.Mesh;
    const isUpper = mesh.name === 'Group1059';
    const localPt = mesh.worldToLocal(hit.point.clone());

    // Spatial vertical cutoff:
    // Upper arch gums/palate are at y > 5.5; Lower arch gums/floor are at y < -15.5
    if (isUpper && localPt.y > 5.5) return true;
    if (!isUpper && localPt.y < -15.5) return true;

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

    return this.dentalService.isGumPixel(r, g, b); // true = Rejected as Gum
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
