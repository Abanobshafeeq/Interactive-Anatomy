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

import { Organ, Hotspot, OrganScreenshot } from '../../../core/models/organ.model';
import { HotspotStorageService } from '../../../core/services/hotspot-storage.service';
import { OrganScreenshotService } from '../../../core/services/organ-screenshot.service';
import {
  ToothData,
  ToothQuadrant,
  DivisionMode,
  ToothState,
  DENTAL_SHADE_PRESETS,
  DentalShadePreset,
} from '../../../core/models/dental.model';
import { DentalService, ToothEnamelBounds } from '../../../core/services/dental.service';
import { isHexColor } from '../../../core/models/storage-validation';

export type CameraControlAction = 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut';

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
/** Largest dimension of a captured screenshot stored in localStorage. */
const MAX_SCREENSHOT_DIMENSION = 1200;
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
  private animationId: number | null = null;
  private frameInProgress = false;
  private destroyed = false;
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
  readonly loadError = signal<string | null>(null);
  readonly storageError = signal<string | null>(null);

  readonly hotspots2D = signal<Hotspot2D[]>([]);
  readonly activeHotspot = signal<Hotspot | null>(null);

  readonly placementMode = signal(false);
  readonly pendingHotspot = signal<{ position: THREE.Vector3, normal: THREE.Vector3 } | null>(null);

  pendingName = '';
  pendingDescription = '';
  pendingValue: number | undefined;

  /** User's auto-rotate preference; actual rotation is paused while interacting with points. */
  private readonly autoRotateEnabled = signal(false);

  /** Active continuous camera control action while the user holds a navigation button. */
  readonly activeCameraAction = signal<CameraControlAction | null>(null);

  /** Screenshot visual feedback state. */
  readonly isCapturingFlash = signal(false);
  readonly lastCapturedScreenshot = signal<OrganScreenshot | null>(null);
  private toastTimeoutId?: ReturnType<typeof setTimeout>;
  private flashTimeoutId?: ReturnType<typeof setTimeout>;

  private readonly hotspotStorage = inject(HotspotStorageService);
  private readonly screenshotService = inject(OrganScreenshotService);
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
  readonly showGridLines = signal<boolean>(this.dentalService.loadGridLinesPreference());
  readonly activeColor = signal<string>('#4A9CFF');
  readonly toothColors = signal<Map<number, ToothState>>(this.dentalService.loadToothStates());
  readonly shadePresets = DENTAL_SHADE_PRESETS;
  private pointerDownCoord = { x: 0, y: 0, time: 0 };
  private toothBoundsMap = new Map<number, ToothEnamelBounds>();
  private boundsCalibratedWithTexture = false;

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
  private readonly tmpPanRight = new THREE.Vector3();
  private readonly tmpPanUp = new THREE.Vector3();
  private readonly tmpPanDelta = new THREE.Vector3();

  constructor() {
    effect(() => {
      const organ = this.organ();

      untracked(() => {
        // Scene not ready yet (ngAfterViewInit does the first load), or this organ is already loaded.
        if (!this.scene || !this.renderer || !this.controls || organ === this.loadedOrgan) {
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
        this.requestRender();
      }
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      try {
        this.initScene();
        this.loadModel(this.organ());
        this.requestRender();
      } catch (error) {
        this.isLoading.set(false);
        this.loadError.set('The 3D viewer could not start. Check that WebGL is available and reload.');
        console.error('Failed to initialize anatomy viewer:', error);
      }
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

    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 0.85;

    this.controls.minDistance = 0.4;
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
    this.hotspots2D.set([]);
    this.pendingPointerMove = null;
    this.activeCameraAction.set(null);
    this.loadError.set(null);
    this.storageError.set(null);

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
      const builtInHotspots = (organ.hotspots ?? []).filter(h => !h.isCustom);
      const builtInIds = new Set(builtInHotspots.map(h => h.id));
      organ.hotspots = builtInHotspots.concat(customHotspots.filter(h => !builtInIds.has(h.id)));

      for (const hotspot of organ.hotspots) {
        this.registerHotspot(hotspot);
      }

      this.resetCamera();

      // OBJ + MTL: textures are still streaming in, the loading manager ends the loading state.
      if (!waitForTextures) {
        this.isLoading.set(false);
        if (this.isDentalModel()) {
          this.updateMeshVertexColors();
        }
      }

      this.requestRender();
      this.needsHotspotUpdate = true;
    };

    const onError = (error: unknown) => {
      if (requestId !== this.modelRequestId) {
        return;
      }
      this.isLoading.set(false);
      this.loadError.set(`Unable to load ${organ.name}. Please try again.`);
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
      this.loadError.set('This model format is not supported.');
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
    let ownedMaterials: THREE.Material[] = [];
    let transferred = false;
    let failed = false;
    const fail = (error: unknown) => {
      failed = true;
      onError(error);
    };
    manager.onProgress = () => this.requestRender();
    manager.onLoad = () => {
      if (!transferred && (failed || requestId !== this.modelRequestId)) {
        this.disposeMaterials(ownedMaterials);
        ownedMaterials = [];
      }
      if (!failed && this.model && requestId === this.modelRequestId) {
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
        ownedMaterials = Object.values(materials.materials);
        for (const mat of Object.values(materials.materials)) {
          mat.vertexColors = true;
        }
        // Create a fresh loader to avoid polluting a shared instance with these materials
        const loader = new OBJLoader(manager);
        loader.setMaterials(materials);
        loader.load(path, (obj) => {
          transferred = true;
          obj.visible = false; // Hide until textures are fully loaded
          onLoad(obj, true);
        }, undefined, fail);
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
    this.toothBoundsMap.clear();
    this.boundsCalibratedWithTexture = false;

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        if (mesh.name === 'Group1014' || mesh.name === 'Group1059') {
          if (mesh.geometry.index !== null) {
            const original = mesh.geometry;
            mesh.geometry = mesh.geometry.toNonIndexed();
            original.disposeBoundsTree?.();
            original.dispose();
          }
          const original = mesh.geometry;
          mesh.geometry = this.subdivideGeometry(original, 3);
          if (mesh.geometry !== original) {
            original.disposeBoundsTree?.();
            original.dispose();
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

  /** Recenters the camera target on the model origin while preserving the current orbit angle and zoom distance. */
  recenterCamera(event?: Event): void {
    event?.stopPropagation();
    if (!this.camera || !this.controls) {
      return;
    }
    this.camera.position.sub(this.controls.target);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
    this.needsHotspotUpdate = true;
  }

  private cameraHoldStartTime = 0;

  /** Starts a directional pan or zoom action on pointerdown (performs an immediate step + continues smoothly while held). */
  startCameraControl(action: CameraControlAction, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.cameraHoldStartTime = performance.now();
    this.applyCameraControlStep(action, 1.0);
    this.activeCameraAction.set(action);
    this.requestRender();
  }

  /** Stops continuous camera movement on pointerup/pointerleave. */
  stopCameraControl(event?: Event): void {
    event?.stopPropagation();
    if (this.activeCameraAction() !== null) {
      this.activeCameraAction.set(null);
    }
  }

  /** Keyboard-accessible single step for camera directional buttons. */
  nudgeCamera(action: CameraControlAction, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.applyCameraControlStep(action, 1.0);
  }

  private applyCameraControlStep(action: CameraControlAction, stepMultiplier: number): void {
    switch (action) {
      case 'up':
        this.panCameraBy(0, 1 * stepMultiplier);
        break;
      case 'down':
        this.panCameraBy(0, -1 * stepMultiplier);
        break;
      case 'left':
        this.panCameraBy(-1 * stepMultiplier, 0);
        break;
      case 'right':
        this.panCameraBy(1 * stepMultiplier, 0);
        break;
      case 'zoomIn':
        this.zoomCameraBy(1 - 0.07 * stepMultiplier);
        break;
      case 'zoomOut':
        this.zoomCameraBy(1 + 0.08 * stepMultiplier);
        break;
    }
  }

  /**
   * Translates both `camera.position` and `controls.target` in the camera's local screen plane
   * (right / up vectors), so subsequent zooming focuses directly on the newly centered region.
   */
  private panCameraBy(dx: number, dy: number): void {
    if (!this.camera || !this.controls) {
      return;
    }

    this.camera.updateMatrixWorld();
    const dist = Math.max(0.4, this.camera.position.distanceTo(this.controls.target));
    const panStep = dist * 0.025;

    this.tmpPanRight.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(dx * panStep);
    this.tmpPanUp.setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(dy * panStep);
    this.tmpPanDelta.copy(this.tmpPanRight).add(this.tmpPanUp);

    // Clamp target within a generous radius so the organ remains reachable
    const nextTarget = this.tmpViewDir.copy(this.controls.target).add(this.tmpPanDelta);
    if (nextTarget.length() <= 3.2) {
      this.controls.target.add(this.tmpPanDelta);
      this.camera.position.add(this.tmpPanDelta);
      this.controls.update();
      this.requestRender();
      this.needsHotspotUpdate = true;
    }
  }

  /** Zooms the camera toward or away from the current `controls.target`. */
  private zoomCameraBy(factor: number): void {
    if (!this.camera || !this.controls) {
      return;
    }

    const offset = this.tmpViewDir.subVectors(this.camera.position, this.controls.target);
    const currentDist = offset.length();
    if (currentDist <= 0) {
      return;
    }

    const nextDist = THREE.MathUtils.clamp(
      currentDist * factor,
      this.controls.minDistance,
      this.controls.maxDistance
    );

    offset.normalize().multiplyScalar(nextDist);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
    this.needsHotspotUpdate = true;
  }

  /**
   * Captures a high-resolution screenshot of the exact part of the object currently in the camera's view
   * (compositing the studio backdrop, rendered WebGL frame, and visible hotspot markers) and persists it
   * to localStorage under "ORIGAN-INFO".
   */
  captureScreenshot(event?: Event): void {
    event?.stopPropagation();
    this.storageError.set(null);
    this.lastCapturedScreenshot.set(null);
    try {
      this.createScreenshot();
    } catch (error) {
      this.storageError.set('Screenshot could not be captured. Please try again.');
      console.error('Failed to capture screenshot:', error);
    }
  }

  private createScreenshot(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.controls || this.isLoading() || this.loadError()) {
      return;
    }

    // 1. Synchronously render the current scene state so the WebGL framebuffer is fresh
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateHotspots();
    this.needsRender = false;

    const glCanvas = this.renderer.domElement;
    const srcW = glCanvas.width || this.viewWidth;
    const srcH = glCanvas.height || this.viewHeight;
    const scale = Math.min(1, MAX_SCREENSHOT_DIMENSION / Math.max(srcW, srcH, 1));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = outW;
    compositeCanvas.height = outH;
    const ctx = compositeCanvas.getContext('2d');
    if (!ctx) {
      this.storageError.set('Screenshot could not be captured. Please try again.');
      return;
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
    const cssToOutX = outW / Math.max(1, this.viewWidth);
    const cssToOutY = outH / Math.max(1, this.viewHeight);
    for (const hotspot of this.hotspots2D()) {
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

    // 6. Determine context label for the focused region
    const organ = this.organ();
    const tooth = this.selectedTooth();
    const hotspot = this.activeHotspot();
    let focusedPart = 'Current Camera View';
    if (tooth) {
      focusedPart = `Tooth #${tooth.number} · ${tooth.name}`;
    } else if (hotspot) {
      focusedPart = hotspot.name;
    } else if (this.controls.target.lengthSq() > 0.01) {
      focusedPart = 'Focused Region View';
    }

    const saved = this.screenshotService.saveScreenshot({
      organId: organ.id,
      organName: organ.name,
      imageDataUrl,
      focusedPart,
      camera: {
        position: {
          x: Number(this.camera.position.x.toFixed(3)),
          y: Number(this.camera.position.y.toFixed(3)),
          z: Number(this.camera.position.z.toFixed(3)),
        },
        target: {
          x: Number(this.controls.target.x.toFixed(3)),
          y: Number(this.controls.target.y.toFixed(3)),
          z: Number(this.controls.target.z.toFixed(3)),
        },
      },
    });

    if (!saved) {
      this.storageError.set('Screenshot was not saved. Browser storage is unavailable or full.');
      return;
    }

    // 7. Trigger shutter flash and toast preview
    this.isCapturingFlash.set(true);
    if (this.flashTimeoutId) {
      clearTimeout(this.flashTimeoutId);
    }
    this.flashTimeoutId = setTimeout(() => {
      this.isCapturingFlash.set(false);
    }, 260);

    this.lastCapturedScreenshot.set(saved);
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = setTimeout(() => {
      this.lastCapturedScreenshot.set(null);
    }, 5500);
  }

  dismissScreenshotToast(event?: Event): void {
    event?.stopPropagation();
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.lastCapturedScreenshot.set(null);
  }

  downloadScreenshot(screenshot: OrganScreenshot, event?: Event): void {
    event?.stopPropagation();
    const link = document.createElement('a');
    const ext = screenshot.imageDataUrl.startsWith('data:image/webp') ? 'webp' : 'png';
    link.href = screenshot.imageDataUrl;
    link.download = `${screenshot.organId}-${screenshot.id}.${ext}`;
    link.click();
  }

  toggleAutoRotate(): void {
    this.autoRotateEnabled.update(enabled => !enabled);
  }

  private disposeModel(model: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }

      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material) materials.add(material);
      }
    });
    for (const geometry of geometries) {
      geometry.disposeBoundsTree?.();
      geometry.dispose();
    }
    this.disposeMaterials(materials);
  }

  private disposeMaterials(materials: Iterable<THREE.Material>): void {
    const textures = new Set<THREE.Texture>();
    const images = new Set<ImageBitmap>();
    for (const material of new Set(materials)) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
      if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    }
    for (const image of images) image.close();
  }

  private requestRender(): void {
    this.needsRender = true;
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.destroyed || !this.renderer || this.frameInProgress || this.animationId !== null) return;
    this.ngZone.runOutsideAngular(() => {
      this.animationId = requestAnimationFrame(this.animate);
    });
  }

  private handleControlsChange = (): void => {
    this.needsHotspotUpdate = true;
    this.requestRender();
  };

  private animate = (): void => {
    this.animationId = null;
    if (this.destroyed) return;
    this.frameInProgress = true;

    // Continuous smooth camera movement while a directional or zoom button is held down (>180ms).
    const activeAction = this.activeCameraAction();
    if (activeAction && performance.now() - this.cameraHoldStartTime > 180) {
      this.applyCameraControlStep(activeAction, 0.2);
    }

    // Pointer moves are coalesced to at most one raycast per frame.
    if (this.pendingPointerMove) {
      const event = this.pendingPointerMove;
      this.pendingPointerMove = null;
      this.processPointerMove(event);
    }

    const controlsChanged = this.controls.update();

    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    }

    if (this.needsHotspotUpdate) {
      this.needsHotspotUpdate = false;
      this.updateHotspots();
    }
    this.frameInProgress = false;
    if (controlsChanged || this.controls.autoRotate || this.activeCameraAction() ||
        this.pendingPointerMove || this.needsRender || this.needsHotspotUpdate) {
      this.scheduleFrame();
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
    this.requestRender();
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
      this.scheduleFrame();
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
        const tooth = this.dentalService.identifyTooth(localPt.x, localPt.y, localPt.z, isUpper, hit.uv?.x);

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
          const tooth = this.dentalService.identifyTooth(localPt.x, localPt.y, localPt.z, isUpper, hit.uv?.x);

          this.selectTooth(tooth, localPt);
        }
      }
    }
  };

  private handlePointerLeave = (): void => {
    this.pendingPointerMove = null;
    this.setCursor('default');
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
    if (!this.dentalService.getTooth(tooth.number)) return;
    this.ngZone.run(() => {
      if (this.toothBoundsMap.size === 0) {
        this.computeAllToothBounds();
      }
      // Anchor/snap tooth center to the true center of its white enamel crown
      const bounds = this.toothBoundsMap.get(tooth.number);
      if (bounds) {
        this.dentalService.calibrateToothCenter(tooth.number, bounds.anchor, {
          width: bounds.maxH - bounds.minH,
          height: bounds.maxY - bounds.minY,
        });
      } else if (clickedPoint) {
        const resolved = this.dentalService.identifyTooth(
          clickedPoint.x,
          clickedPoint.y,
          clickedPoint.z,
          tooth.isUpper
        );
        tooth = resolved;
      }

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
      const state: ToothState = toothMap.get(tooth.number) ?? {
        divisionMode: mode,
        zones: {},
      };
      state.divisionMode = mode;
      toothMap.set(tooth.number, { ...state });
      this.toothColors.set(toothMap);
      this.persistToothStates(toothMap);
    }
    this.updateMeshVertexColors();
  }

  toggleGridLines(): void {
    this.showGridLines.update(v => !v);
    this.storageError.set(this.dentalService.saveGridLinesPreference(this.showGridLines())
      ? null : 'Grid preference could not be saved. Browser storage is unavailable or full.');
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
    if (!isHexColor(colorHex)) return;
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
    this.persistToothStates(toothMap);
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

  private persistToothStates(states: Map<number, ToothState>): void {
    this.storageError.set(this.dentalService.saveToothStates(states)
      ? null : 'Dental changes are visible but could not be saved. Browser storage is unavailable or full.');
  }

  resetCurrentTooth(): void {
    const tooth = this.selectedTooth();
    if (!tooth) return;

    const toothMap = new Map(this.toothColors());
    toothMap.delete(tooth.number);
    this.toothColors.set(toothMap);
    this.persistToothStates(toothMap);
    this.updateMeshVertexColors();
  }

  resetAllTeeth(): void {
    const emptyMap = new Map<number, ToothState>();
    this.toothColors.set(emptyMap);
    this.persistToothStates(emptyMap);
    this.updateMeshVertexColors();
  }

  /**
   * Subdivides each quad (2 consecutive triangles: (A,B,C) and (A,C,D)) of a non-indexed BufferGeometry
   * bilinearly into 4 rectangular sub-quads per iteration (3 iterations: 1 quad -> 64 micro-quads),
   * interpolating position, normal, and uv at the 4 edge midpoints (mAB, mBC, mCD, mDA) and quad center.
   * Preserves the 6-vertex quad pairing so micro-quads can be colored without diagonal sawtooth spikes.
   */
  private subdivideGeometry(geometry: THREE.BufferGeometry, iterations = 3): THREE.BufferGeometry {
    let current = geometry;

    const emitQuadPos = (
      dst: Float32Array, out: number,
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      dx: number, dy: number, dz: number
    ): number => {
      dst[out++] = ax; dst[out++] = ay; dst[out++] = az;
      dst[out++] = bx; dst[out++] = by; dst[out++] = bz;
      dst[out++] = cx; dst[out++] = cy; dst[out++] = cz;
      dst[out++] = ax; dst[out++] = ay; dst[out++] = az;
      dst[out++] = cx; dst[out++] = cy; dst[out++] = cz;
      dst[out++] = dx; dst[out++] = dy; dst[out++] = dz;
      return out;
    };

    const emitQuadUv = (
      dst: Float32Array, out: number,
      au: number, av: number,
      bu: number, bv: number,
      cu: number, cv: number,
      du: number, dv: number
    ): number => {
      dst[out++] = au; dst[out++] = av;
      dst[out++] = bu; dst[out++] = bv;
      dst[out++] = cu; dst[out++] = cv;
      dst[out++] = au; dst[out++] = av;
      dst[out++] = cu; dst[out++] = cv;
      dst[out++] = du; dst[out++] = dv;
      return out;
    };

    for (let iter = 0; iter < iterations; iter++) {
      const posAttr = current.attributes['position'] as THREE.BufferAttribute;
      const normAttr = current.attributes['normal'] as THREE.BufferAttribute | undefined;
      const uvAttr = current.attributes['uv'] as THREE.BufferAttribute | undefined;

      const quadCount = Math.floor(posAttr.count / 6);
      const nextVertCount = quadCount * 24; // 4 sub-quads * 6 vertices

      const srcPos = posAttr.array as Float32Array;
      const dstPos = new Float32Array(nextVertCount * 3);

      const srcNorm = normAttr ? (normAttr.array as Float32Array) : null;
      const dstNorm = srcNorm ? new Float32Array(nextVertCount * 3) : null;

      const srcUv = uvAttr ? (uvAttr.array as Float32Array) : null;
      const dstUv = srcUv ? new Float32Array(nextVertCount * 2) : null;

      let pOut = 0;
      let nOut = 0;
      let uOut = 0;

      for (let q = 0; q < quadCount; q++) {
        const iA = q * 6;
        const iB = iA + 1;
        const iC = iA + 2;
        const iD = iA + 5;

        const pA = iA * 3, pB = iB * 3, pC = iC * 3, pD = iD * 3;
        const ax = srcPos[pA], ay = srcPos[pA + 1], az = srcPos[pA + 2];
        const bx = srcPos[pB], by = srcPos[pB + 1], bz = srcPos[pB + 2];
        const cx = srcPos[pC], cy = srcPos[pC + 1], cz = srcPos[pC + 2];
        const dx = srcPos[pD], dy = srcPos[pD + 1], dz = srcPos[pD + 2];

        const abx = 0.5 * (ax + bx), aby = 0.5 * (ay + by), abz = 0.5 * (az + bz);
        const bcx = 0.5 * (bx + cx), bcy = 0.5 * (by + cy), bcz = 0.5 * (bz + cz);
        const cdx = 0.5 * (cx + dx), cdy = 0.5 * (cy + dy), cdz = 0.5 * (cz + dz);
        const dax = 0.5 * (dx + ax), day = 0.5 * (dy + ay), daz = 0.5 * (dz + az);
        const mx = 0.25 * (ax + bx + cx + dx);
        const my = 0.25 * (ay + by + cy + dy);
        const mz = 0.25 * (az + bz + cz + dz);

        pOut = emitQuadPos(dstPos, pOut, ax, ay, az, abx, aby, abz, mx, my, mz, dax, day, daz);
        pOut = emitQuadPos(dstPos, pOut, abx, aby, abz, bx, by, bz, bcx, bcy, bcz, mx, my, mz);
        pOut = emitQuadPos(dstPos, pOut, mx, my, mz, bcx, bcy, bcz, cx, cy, cz, cdx, cdy, cdz);
        pOut = emitQuadPos(dstPos, pOut, dax, day, daz, mx, my, mz, cdx, cdy, cdz, dx, dy, dz);

        if (srcNorm && dstNorm) {
          const nax = srcNorm[pA], nay = srcNorm[pA + 1], naz = srcNorm[pA + 2];
          const nbx = srcNorm[pB], nby = srcNorm[pB + 1], nbz = srcNorm[pB + 2];
          const ncx = srcNorm[pC], ncy = srcNorm[pC + 1], ncz = srcNorm[pC + 2];
          const ndx = srcNorm[pD], ndy = srcNorm[pD + 1], ndz = srcNorm[pD + 2];

          let nabx = nax + nbx, naby = nay + nby, nabz = naz + nbz;
          const lab = Math.hypot(nabx, naby, nabz) || 1;
          nabx /= lab; naby /= lab; nabz /= lab;

          let nbcx = nbx + ncx, nbcy = nby + ncy, nbcz = nbz + ncz;
          const lbc = Math.hypot(nbcx, nbcy, nbcz) || 1;
          nbcx /= lbc; nbcy /= lbc; nbcz /= lbc;

          let ncdx = ncx + ndx, ncdy = ncy + ndy, ncdz = ncz + ndz;
          const lcd = Math.hypot(ncdx, ncdy, ncdz) || 1;
          ncdx /= lcd; ncdy /= lcd; ncdz /= lcd;

          let ndax = ndx + nax, nday = ndy + nay, ndaz = ndz + naz;
          const lda = Math.hypot(ndax, nday, ndaz) || 1;
          ndax /= lda; nday /= lda; ndaz /= lda;

          let nmx = nax + nbx + ncx + ndx, nmy = nay + nby + ncy + ndy, nmz = naz + nbz + ncz + ndz;
          const lm = Math.hypot(nmx, nmy, nmz) || 1;
          nmx /= lm; nmy /= lm; nmz /= lm;

          nOut = emitQuadPos(dstNorm, nOut, nax, nay, naz, nabx, naby, nabz, nmx, nmy, nmz, ndax, nday, ndaz);
          nOut = emitQuadPos(dstNorm, nOut, nabx, naby, nabz, nbx, nby, nbz, nbcx, nbcy, nbcz, nmx, nmy, nmz);
          nOut = emitQuadPos(dstNorm, nOut, nmx, nmy, nmz, nbcx, nbcy, nbcz, ncx, ncy, ncz, ncdx, ncdy, ncdz);
          nOut = emitQuadPos(dstNorm, nOut, ndax, nday, ndaz, nmx, nmy, nmz, ncdx, ncdy, ncdz, ndx, ndy, ndz);
        }

        if (srcUv && dstUv) {
          const uA = iA * 2, uB = iB * 2, uC = iC * 2, uD = iD * 2;
          const au = srcUv[uA], av = srcUv[uA + 1];
          const bu = srcUv[uB], bv = srcUv[uB + 1];
          const cu = srcUv[uC], cv = srcUv[uC + 1];
          const du = srcUv[uD], dv = srcUv[uD + 1];

          const abu = 0.5 * (au + bu), abv = 0.5 * (av + bv);
          const bcu = 0.5 * (bu + cu), bcv = 0.5 * (bv + cv);
          const cdu = 0.5 * (cu + du), cdv = 0.5 * (cv + dv);
          const dau = 0.5 * (du + au), dav = 0.5 * (dv + av);
          const mu = 0.25 * (au + bu + cu + du);
          const mv = 0.25 * (av + bv + cv + dv);

          uOut = emitQuadUv(dstUv, uOut, au, av, abu, abv, mu, mv, dau, dav);
          uOut = emitQuadUv(dstUv, uOut, abu, abv, bu, bv, bcu, bcv, mu, mv);
          uOut = emitQuadUv(dstUv, uOut, mu, mv, bcu, bcv, cu, cv, cdu, cdv);
          uOut = emitQuadUv(dstUv, uOut, dau, dav, mu, mv, cdu, cdv, du, dv);
        }
      }

      const nextGeo = new THREE.BufferGeometry();
      nextGeo.name = current.name;
      nextGeo.userData = { ...current.userData };
      for (const group of current.groups) {
        nextGeo.addGroup(group.start * 4, group.count * 4, group.materialIndex);
      }
      nextGeo.setAttribute('position', new THREE.BufferAttribute(dstPos, 3));
      if (dstNorm) {
        nextGeo.setAttribute('normal', new THREE.BufferAttribute(dstNorm, 3));
      }
      if (dstUv) {
        nextGeo.setAttribute('uv', new THREE.BufferAttribute(dstUv, 2));
      }

      if (current !== geometry) {
        current.dispose();
      }
      current = nextGeo;
    }

    if (!current.attributes['normal']) {
      current.computeVertexNormals();
    }
    return current;
  }

  /**
   * Precomputes full-crown geometric boundaries across all white enamel micro-quads in each
   * tooth's arch-aware local coordinate frame (archTangent, minH..maxH, minY..maxY, minU..maxU)
   * so Q1..Q4, Halves, and Thirds cover 100% of the tooth surface edge-to-edge.
   */
  private computeAllToothBounds(): void {
    if (!this.model) return;
    const image = this.getDentalDiffuseImage();
    const sample = image ? this.getTextureSample(image) : null;

    const accum = new Map<
      number,
      {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        minZ: number;
        maxZ: number;
        minH: number;
        maxH: number;
        sumH: number;
        sumY: number;
        minU: number;
        maxU: number;
        sumU: number;
        count: number;
        archTangent: { x: number; z: number };
      }
    >();

    this.model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'Group1014' && mesh.name !== 'Group1059')) return;

      const isUpper = mesh.name === 'Group1059';
      const geo = mesh.geometry;
      const pos = geo.attributes['position'];
      const uvAttr = geo.attributes['uv'];
      const quadCount = Math.floor(pos.count / 6);

      for (let q = 0; q < quadCount; q++) {
        const iA = q * 6;
        const iB = iA + 1;
        const iC = iA + 2;
        const iD = iA + 5;

        const cx = 0.25 * (pos.getX(iA) + pos.getX(iB) + pos.getX(iC) + pos.getX(iD));
        const cy = 0.25 * (pos.getY(iA) + pos.getY(iB) + pos.getY(iC) + pos.getY(iD));
        const cz = 0.25 * (pos.getZ(iA) + pos.getZ(iB) + pos.getZ(iC) + pos.getZ(iD));

        // Deep vertical root cutoff
        if (isUpper && cy > 6.8) continue;
        if (!isUpper && cy < -16.5) continue;

        let cu: number | undefined;
        if (uvAttr) {
          cu = 0.25 * (uvAttr.getX(iA) + uvAttr.getX(iB) + uvAttr.getX(iC) + uvAttr.getX(iD));
          const cv = 0.25 * (uvAttr.getY(iA) + uvAttr.getY(iB) + uvAttr.getY(iC) + uvAttr.getY(iD));

          // Exclude gum / palate / floor-of-mouth UV islands outside the dental crown strips
          if (isUpper && cv < 0.838) continue;
          if (!isUpper && (cv < 0.6915 || cu < 0.3215)) continue;

          // Texture check: skip only distinctly deep pink/reddish gum pixels
          if (sample) {
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
        }

        const tooth = this.dentalService.identifyTooth(cx, cy, cz, isUpper, cu);
        let b = accum.get(tooth.number);
        if (!b) {
          const archTangent = this.dentalService.getArchTangent(tooth);
          b = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity,
            minH: Infinity,
            maxH: -Infinity,
            sumH: 0,
            sumY: 0,
            minU: Infinity,
            maxU: -Infinity,
            sumU: 0,
            count: 0,
            archTangent,
          };
          accum.set(tooth.number, b);
        }

        const h = cx * b.archTangent.x + cz * b.archTangent.z;
        b.minX = Math.min(b.minX, cx);
        b.maxX = Math.max(b.maxX, cx);
        b.minY = Math.min(b.minY, cy);
        b.maxY = Math.max(b.maxY, cy);
        b.minZ = Math.min(b.minZ, cz);
        b.maxZ = Math.max(b.maxZ, cz);
        b.minH = Math.min(b.minH, h);
        b.maxH = Math.max(b.maxH, h);
        b.sumH += h;
        b.sumY += cy;
        if (cu !== undefined) {
          b.minU = Math.min(b.minU, cu);
          b.maxU = Math.max(b.maxU, cu);
          b.sumU += cu;
        }
        b.count++;
      }
    });

    for (const [num, b] of accum.entries()) {
      const midX = (b.minX + b.maxX) / 2;
      const midZ = (b.minZ + b.maxZ) / 2;
      const bboxMidY = (b.minY + b.maxY) / 2;
      const meanY = b.count > 0 ? b.sumY / b.count : bboxMidY;
      const midY = 0.5 * (bboxMidY + meanY);

      const bboxMidH = (b.minH + b.maxH) / 2;
      const meanH = b.count > 0 ? b.sumH / b.count : bboxMidH;
      const midH = 0.5 * (bboxMidH + meanH);

      const minU = Number.isFinite(b.minU) ? b.minU : 0;
      const maxU = Number.isFinite(b.maxU) ? b.maxU : 1;
      const bboxMidU = (minU + maxU) / 2;
      const meanU = b.count > 0 && b.sumU > 0 ? b.sumU / b.count : bboxMidU;
      const midU = 0.5 * (bboxMidU + meanU);

      const anchor = { x: midX, y: midY, z: midZ };
      this.dentalService.calibrateToothCenter(num, anchor, {
        width: b.maxH - b.minH,
        height: b.maxY - b.minY,
      });

      this.toothBoundsMap.set(num, {
        toothNumber: num,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        minZ: b.minZ,
        maxZ: b.maxZ,
        midX,
        midY,
        midZ,
        minH: b.minH,
        maxH: b.maxH,
        midH,
        minU,
        maxU,
        midU,
        archTangent: b.archTangent,
        anchor,
      });
    }

    this.boundsCalibratedWithTexture = !!sample;
  }

  /**
   * Colors the dental meshes micro-quad by micro-quad (all 6 vertices of each subdivided rectangular
   * micro-quad receive the same uniform color evaluated at the micro-quad's true center).
   * This eliminates diagonal sawtooth spikes (`\/\/`) and GPU gradient blur for clean boundaries.
   */
  updateMeshVertexColors(): void {
    if (!this.model) return;

    const image = this.getDentalDiffuseImage();
    const sample = image ? this.getTextureSample(image) : null;

    if (this.toothBoundsMap.size === 0 || (!this.boundsCalibratedWithTexture && sample)) {
      this.computeAllToothBounds();
    }

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
      const quadCount = Math.floor(pos.count / 6);

      for (let q = 0; q < quadCount; q++) {
        const iA = q * 6;
        const iB = iA + 1;
        const iC = iA + 2;
        const iD = iA + 5;

        const cx = 0.25 * (pos.getX(iA) + pos.getX(iB) + pos.getX(iC) + pos.getX(iD));
        const cy = 0.25 * (pos.getY(iA) + pos.getY(iB) + pos.getY(iC) + pos.getY(iD));
        const cz = 0.25 * (pos.getZ(iA) + pos.getZ(iB) + pos.getZ(iC) + pos.getZ(iD));

        // 1. Deep vertical root cutoff
        if (isUpper && cy > 6.8) {
          this.setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
          continue;
        }
        if (!isUpper && cy < -16.5) {
          this.setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
          continue;
        }

        // 2. UV tooth-strip & pink gum filter (never rejects shaded enamel pits/grooves)
        let cu: number | undefined;
        if (uvAttr) {
          cu = 0.25 * (uvAttr.getX(iA) + uvAttr.getX(iB) + uvAttr.getX(iC) + uvAttr.getX(iD));
          const cv = 0.25 * (uvAttr.getY(iA) + uvAttr.getY(iB) + uvAttr.getY(iC) + uvAttr.getY(iD));

          if ((isUpper && cv < 0.838) || (!isUpper && (cv < 0.6915 || cu < 0.3215))) {
            this.setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
            continue;
          }

          if (sample) {
            const sx = Math.min(sample.width - 1, Math.max(0, Math.floor(cu * sample.width)));
            const sy = Math.min(sample.height - 1, Math.max(0, Math.floor((1.0 - cv) * sample.height)));
            const sIndex = (sy * sample.width + sx) * 4;
            const r = sample.data[sIndex];
            const g = sample.data[sIndex + 1];
            const b = sample.data[sIndex + 2];
            if (this.dentalService.isGumPixel(r, g, b)) {
              this.setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
              continue;
            }
          }
        }

        // 3. Interproximal-aware tooth assignment (28 physical teeth: 7 per quadrant)
        const tooth = this.dentalService.identifyTooth(cx, cy, cz, isUpper, cu);
        const state = statesMap.get(tooth.number);
        const isToothSelected = selectedTooth?.number === tooth.number;
        const mode = isToothSelected ? activeMode : (state?.divisionMode ?? 4);
        const bounds = this.toothBoundsMap.get(tooth.number);

        // 4. High-contrast divider grid lines for active selected tooth ONLY
        if (isToothSelected && showGrid && mode !== 1) {
          if (this.dentalService.isNearBoundary(cx, cy, tooth, mode, bounds, cz, 0.14, cu)) {
            this.setQuadColor(colorArray, iA, 0.14, 0.18, 0.25);
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
            const quad = this.dentalService.getQuadrant(cx, cy, tooth, bounds, cz, cu);
            colorHex = state.zones[quad];
          }

          if (colorHex) {
            const rgb = this.dentalService.hexToRgb(colorHex);
            this.setQuadColor(colorArray, iA, rgb[0], rgb[1], rgb[2]);
            continue;
          }
        }

        // Default unaltered enamel
        this.setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
      }

      colorAttr.needsUpdate = true;
    });

    this.requestRender();
  }

  private setQuadColor(arr: Float32Array, iA: number, r: number, g: number, b: number): void {
    let idx = iA * 3;
    for (let v = 0; v < 6; v++) {
      arr[idx++] = r;
      arr[idx++] = g;
      arr[idx++] = b;
    }
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
    if (!data || !organ || !this.pendingName.trim() ||
        (this.pendingValue !== undefined && this.pendingValue !== null && !Number.isFinite(this.pendingValue))) return;

    const newHotspot: Hotspot = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: this.pendingName.trim(),
      description: this.pendingDescription.trim(),
      value: this.pendingValue ?? undefined,
      position: { x: data.position.x, y: data.position.y, z: data.position.z },
      normal: { x: data.normal.x, y: data.normal.y, z: data.normal.z },
      isCustom: true
    };

    // Update active model array
    const updated = [...(organ.hotspots ?? []), newHotspot];

    // Persist
    if (!this.hotspotStorage.saveCustomHotspots(organ.id, updated)) {
      this.storageError.set('Point was not saved. Browser storage is unavailable or full.');
      return;
    }
    organ.hotspots = updated;
    this.storageError.set(null);

    // Register the new point directly; no need to reload the whole model
    this.registerHotspot(newHotspot);
    this.needsHotspotUpdate = true;
    this.requestRender();

    this.togglePlacementMode(); // Exit mode
  }

  deleteHotspot(id: string): void {
    const organ = this.loadedOrgan;
    if (!organ?.hotspots) return;

    // Remove from array
    const updated = organ.hotspots.filter(h => h.id !== id);

    // Save to storage
    if (!this.hotspotStorage.saveCustomHotspots(organ.id, updated)) {
      this.storageError.set('Point was not deleted. Browser storage is unavailable.');
      return;
    }
    organ.hotspots = updated;
    this.storageError.set(null);

    // Drop cached state for the point; no need to reload the whole model
    this.removeHotspotState(id);
    this.needsHotspotUpdate = true;
    this.requestRender();

    this.clearHotspot();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.pendingPointerMove = null;

    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    if (this.flashTimeoutId) {
      clearTimeout(this.flashTimeoutId);
    }

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

  retryLoad(): void {
    if (this.destroyed) return;
    if (this.scene && this.renderer && this.controls) {
      this.ngZone.runOutsideAngular(() => this.loadModel(this.organ()));
    } else {
      this.ngAfterViewInit();
    }
  }

  saveHotspotValue(hotspot: Hotspot): void {
    if (hotspot.value === null) hotspot.value = undefined;
    if (hotspot.value !== undefined && !Number.isFinite(hotspot.value)) return;
    if (hotspot.isCustom && this.loadedOrgan &&
        !this.hotspotStorage.saveCustomHotspots(this.loadedOrgan.id, this.loadedOrgan.hotspots ?? [])) {
      this.storageError.set('Point data was not saved. Browser storage is unavailable or full.');
      return;
    }
    this.storageError.set(null);
    this.clearHotspot();
  }

  private checkIsGum(hit: THREE.Intersection): boolean {
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
