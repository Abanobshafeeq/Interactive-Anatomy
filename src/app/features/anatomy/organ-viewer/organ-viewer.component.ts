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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Organ, Hotspot, OrganScreenshot } from '../../../core/models/organ.model';
import { HotspotStorageService } from '../../../core/services/hotspot-storage.service';
import { OrganScreenshotService } from '../../../core/services/organ-screenshot.service';
import {
  ToothData,
  DivisionMode,
  ToothState,
  DENTAL_SHADE_PRESETS,
} from '../../../core/models/dental.model';
import { DentalService, ToothEnamelBounds } from '../../../core/services/dental.service';
import { isHexColor } from '../../../core/models/storage-validation';

import { CameraController, CameraControlAction } from './camera/camera-controller';
import { composeScreenshot } from './screenshots/screenshot-capture';
import { HotspotProjection, Hotspot2D } from './hotspots/hotspot-projection';
import { PickingController } from './interactions/picking-controller';
import { ModelLoader } from './scene/model-loader';
import { prepareModel, freezeModel } from './scene/model-preparation';
import { disposeModel } from './scene/resource-disposer';
import { computeToothBounds } from './dental/dental-geometry';
import { renderDentalColors } from './dental/dental-color-renderer';
import { DentalTextureSampler, getDentalDiffuseImage } from './dental/dental-texture';

export type { CameraControlAction } from './camera/camera-controller';
export type { Hotspot2D } from './hotspots/hotspot-projection';

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
  private readonly modelLoader = new ModelLoader(() => this.requestRender());
  private readonly cameraController = new CameraController();
  /** The organ whose model is currently loaded / loading. Guards against duplicate loads. */
  private loadedOrgan?: Organ;
  private animationId: number | null = null;
  private frameInProgress = false;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private viewWidth = 1;
  private viewHeight = 1;

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
  private readonly textureSampler = new DentalTextureSampler(this.dentalService);
  private readonly picking = new PickingController(hit => this.textureSampler.isGum(hit));
  private readonly hotspotProjection = new HotspotProjection(() => this.hotspotsOverlay.nativeElement);

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
  private clickableMeshes: Set<string> | null = null;
  private pendingPointerMove: PointerEvent | null = null;
  private currentCursor = '';

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
    const path = organ.model;

    this.loadedOrgan = organ;
    this.clickableMeshes = organ.clickableMeshes?.length ? new Set(organ.clickableMeshes) : null;

    this.resetInteractionState();
    this.hotspotProjection.clear();
    this.hotspots2D.set([]);
    this.pendingPointerMove = null;
    this.activeCameraAction.set(null);
    this.loadError.set(null);
    this.storageError.set(null);

    if (this.model) {
      this.scene.remove(this.model);
      disposeModel(this.model);
      this.model = undefined;
    }

    this.isLoading.set(true);
    this.requestRender();
    this.needsHotspotUpdate = true;

    const onLoad = (object: THREE.Object3D, waitForTextures = false) => {
      this.model = object;

      this.toothBoundsMap.clear();
      this.boundsCalibratedWithTexture = false;
      prepareModel(object);
      this.scene.add(object);
      freezeModel(object);

      // Load custom hotspots and merge them
      const customHotspots = this.hotspotStorage.loadCustomHotspots(organ.id);
      const builtInHotspots = (organ.hotspots ?? []).filter(h => !h.isCustom);
      const builtInIds = new Set(builtInHotspots.map(h => h.id));
      organ.hotspots = builtInHotspots.concat(customHotspots.filter(h => !builtInIds.has(h.id)));

      for (const hotspot of organ.hotspots) {
        this.hotspotProjection.register(hotspot, this.model);
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
      this.isLoading.set(false);
      this.loadError.set(`Unable to load ${organ.name}. Please try again.`);
      console.error('Failed to load anatomy model:', error);
    };

    this.modelLoader.load(path, {
      loaded: onLoad,
      texturesReady: () => {
        if (!this.model) return;
        this.model.visible = true;
        this.isLoading.set(false);
        if (this.isDentalModel()) this.updateMeshVertexColors();
        this.requestRender();
      },
      error: onError,
      unsupported: () => {
        this.isLoading.set(false);
        this.loadError.set('This model format is not supported.');
        console.error('Unsupported model format:', path);
      },
    });
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
    this.cameraController.reset(this.camera, this.controls);
    this.requestRender();
    this.needsHotspotUpdate = true;
  }

  /** Recenters the camera target on the model origin while preserving the current orbit angle and zoom distance. */
  recenterCamera(event?: Event): void {
    event?.stopPropagation();
    if (!this.camera || !this.controls) {
      return;
    }
    this.cameraController.recenter(this.camera, this.controls);
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
    if (!this.camera || !this.controls) return;
    if (this.cameraController.step(this.camera, this.controls, action, stepMultiplier)) {
      this.requestRender();
      this.needsHotspotUpdate = true;
    }
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

    // Synchronously render the current scene state so the WebGL framebuffer is fresh
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateHotspots();
    this.needsRender = false;

    const imageDataUrl = composeScreenshot(this.renderer.domElement, this.viewWidth, this.viewHeight, this.hotspots2D());
    if (!imageDataUrl) {
      this.storageError.set('Screenshot could not be captured. Please try again.');
      return;
    }

    // Determine context label for the focused region
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

    // Trigger shutter flash and toast preview
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

  private updateHotspots(): void {
    const next = this.hotspotProjection.project(this.loadedOrgan?.hotspots, this.model, this.camera,
      this.viewWidth, this.viewHeight, this.hotspots2D());
    if (next) this.hotspots2D.set(next);
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

  private pickSurface(event: PointerEvent): THREE.Intersection | undefined {
    if (!this.model) return undefined;
    return this.picking.pick(event, this.canvasContainer.nativeElement.getBoundingClientRect(),
      this.camera, this.model, this.clickableMeshes);
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
      if (hit && (hit.object.name === 'Group1014' || hit.object.name === 'Group1059') && !this.textureSampler.isGum(hit)) {
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
    const worldNormal = this.picking.surfaceNormal(hit.face.normal, hit.object.matrixWorld);

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
        if (hit && (hit.object.name === 'Group1014' || hit.object.name === 'Group1059') && !this.textureSampler.isGum(hit)) {
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

  private computeAllToothBounds(): void {
    if (!this.model) return;
    const image = getDentalDiffuseImage(this.model);
    const sample = image ? this.textureSampler.getSample(image) : null;
    const measuredBounds = computeToothBounds(this.model, sample, this.dentalService);
    for (const [num, bounds] of measuredBounds) {
      this.dentalService.calibrateToothCenter(num, bounds.anchor, {
        width: bounds.maxH - bounds.minH,
        height: bounds.maxY - bounds.minY,
      });
      this.toothBoundsMap.set(num, bounds);
    }
    this.boundsCalibratedWithTexture = !!sample;
  }

  updateMeshVertexColors(): void {
    if (!this.model) return;
    const image = getDentalDiffuseImage(this.model);
    const sample = image ? this.textureSampler.getSample(image) : null;
    if (this.toothBoundsMap.size === 0 || (!this.boundsCalibratedWithTexture && sample)) {
      this.computeAllToothBounds();
    }
    renderDentalColors(this.model, this.dentalService, {
      sample, statesMap: this.toothColors(), selectedTooth: this.selectedTooth(),
      showGrid: this.showGridLines(), activeMode: this.divisionMode(), boundsMap: this.toothBoundsMap,
    });
    this.requestRender();
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
    this.hotspotProjection.register(newHotspot, this.model);
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
    this.hotspotProjection.remove(id);
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

    this.modelLoader.dispose();

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
      disposeModel(this.model);
      this.model = undefined;
    }

    this.hotspotProjection.clear();

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
}
