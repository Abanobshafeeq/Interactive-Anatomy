import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';


import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { Organ, Hotspot } from '../../../core/models/organ.model';
import { HotspotStorageService } from '../../../core/services/hotspot-storage.service';

export interface Hotspot2D {
  data: Hotspot;
  x: number;
  y: number;
  visible: boolean;
}

@Component({
  selector: 'app-organ-viewer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './organ-viewer.component.html',
  styleUrl: './organ-viewer.component.css',
})
export class OrganViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true })
  private canvasContainer!: ElementRef<HTMLDivElement>;

  readonly organ = input.required<Organ>();

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private model?: THREE.Object3D;
  private animationId = 0;

  private readonly gltfLoader = new GLTFLoader();
  private readonly tdsLoader = new TDSLoader();
  private readonly objLoader = new OBJLoader();
  private readonly mtlLoader = new MTLLoader();

  private modelRequestId = 0;

  readonly isLoading = input(false);

  readonly hotspots2D = signal<Hotspot2D[]>([]);
  readonly activeHotspot = signal<Hotspot | null>(null);

  readonly placementMode = signal(false);
  readonly pendingHotspot = signal<{ position: THREE.Vector3, normal: THREE.Vector3 } | null>(null);
  
  pendingName = '';
  pendingDescription = '';
  pendingValue: number | undefined;

  private autoRotate = false;
  
  private interactionRaycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private readonly hotspotStorage = inject(HotspotStorageService);

  constructor() {
    effect(() => {
      const organ = this.organ();

      if (!this.scene) {
        return;
      }

      this.loadModel(organ.model);
    });
  }

  ngAfterViewInit(): void {
    this.initScene();

    this.loadModel(this.organ().model);

    this.animate();
  }

  private initScene(): void {
    const container = this.canvasContainer.nativeElement;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );

    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setSize(container.clientWidth, container.clientHeight);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.setAnimationLoop(null);

    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.enablePan = false;

    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 8;

    this.controls.target.set(0, 0, 0);

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

    window.addEventListener('resize', this.handleResize);
  }

  private hotspotObjects = new Map<string, THREE.Object3D>();

  private loadModel(path: string): void {
    const requestId = ++this.modelRequestId;

    if (this.model) {
      this.disposeModel(this.model);
      this.scene.remove(this.model);
      this.model = undefined;
      this.hotspotObjects.clear();
    }

    const onLoad = (object: THREE.Object3D) => {
      if (requestId !== this.modelRequestId) {
        this.disposeModel(object);
        return;
      }

      this.model = object;
      
      // Load custom hotspots and merge them
      const customHotspots = this.hotspotStorage.loadCustomHotspots(this.organ().id);
      if (!this.organ().hotspots) {
        this.organ().hotspots = [];
      }
      this.organ().hotspots = this.organ().hotspots!.filter(h => !h.isCustom).concat(customHotspots);

      // Attach hotspot dummy objects
      const hotspots = this.organ().hotspots;
      if (hotspots) {
        for (const hotspot of hotspots) {
          const dummy = new THREE.Object3D();
          dummy.position.set(hotspot.position.x, hotspot.position.y, hotspot.position.z);
          if (hotspot.normal) {
            dummy.userData['normal'] = new THREE.Vector3(
              hotspot.normal.x,
              hotspot.normal.y,
              hotspot.normal.z,
            ).normalize();
          } else {
            // Fallback outward normal relative to model center
            const center = new THREE.Vector3(0, 0.45, 0);
            dummy.userData['normal'] = dummy.position.clone().sub(center).normalize();
          }
          dummy.userData['isCustom'] = !!hotspot.isCustom;
          
          if (hotspot.isCustom) {
            this.scene.add(dummy);
          } else {
            this.model.add(dummy);
          }
          this.hotspotObjects.set(hotspot.id, dummy);
        }
      }

      this.prepareModel(this.model);
      this.scene.add(this.model);
      this.resetCamera();
    };

    const onError = (error: unknown) => {
      if (requestId !== this.modelRequestId) {
        return;
      }
      console.error('Failed to load anatomy model:', error);
    };

    if (path.toLowerCase().endsWith('.gltf') || path.toLowerCase().endsWith('.glb')) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      this.gltfLoader.load(
        path,
        (gltf) => onLoad(gltf.scene),
        undefined,
        onError
      );
    } else if (path.toLowerCase().endsWith('.3ds')) {
      this.tdsLoader.load(
        path,
        onLoad,
        undefined,
        onError
      );
    } else if (path.toLowerCase().endsWith('.obj')) {
      const mtlPath = path.substring(0, path.lastIndexOf('.')) + '.mtl';
     /////////////// 
      this.mtlLoader.load(
        mtlPath,
        (materials) => {
          materials.preload();
          // Create a fresh loader to avoid polluting the class singleton
          import('three/examples/jsm/loaders/OBJLoader.js').then(({ OBJLoader }) => {
            const loader = new OBJLoader();
            loader.setMaterials(materials);
            loader.load(path, onLoad, undefined, onError);
          });
        },
        undefined,
        (error) => {
          console.warn('Failed to load MTL for OBJ, falling back to geometry only.', error);
          this.objLoader.load(path, onLoad, undefined, onError);
        }
      );
    } else if (path.toLowerCase().endsWith('.mtl')) {
      this.mtlLoader.load(
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
      console.error('Unsupported model format:', path);
    }
  }

  private prepareModel(model: THREE.Object3D): void {
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

  resetCamera(): void {
    this.camera.position.set(0, 0, 4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  toggleAutoRotate(): void {
    this.autoRotate = !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 1.5;
  }

  private disposeModel(model: THREE.Object3D): void {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
      this.updateHotspots();
    }
  };

  private readonly occlusionRaycaster = new THREE.Raycaster();

  private updateHotspots(): void {
    const organ = this.organ();
    if (!organ.hotspots || !this.model || !this.camera || !this.renderer) {
      if (this.hotspots2D().length > 0) {
        this.hotspots2D.set([]);
      }
      return;
    }

    const container = this.canvasContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const newHotspots2D: Hotspot2D[] = [];

    const tempQuat = new THREE.Quaternion();
    const modelQuat = this.model.getWorldQuaternion(tempQuat);

    for (const hotspot of organ.hotspots) {
      const dummy = this.hotspotObjects.get(hotspot.id);
      if (!dummy) continue;

      const worldPosition = new THREE.Vector3();
      dummy.getWorldPosition(worldPosition);

      // 1. Check if surface normal faces camera
      const localNormal = dummy.userData['normal'] as THREE.Vector3 | undefined;
      let isFacingCamera = true;
      if (localNormal) {
        let worldNormal: THREE.Vector3;
        if (dummy.userData['isCustom']) {
           worldNormal = localNormal.clone();
        } else {
           worldNormal = localNormal.clone().applyQuaternion(modelQuat);
        }
        const viewDir = this.camera.position.clone().sub(worldPosition).normalize();
        isFacingCamera = worldNormal.dot(viewDir) > 0.05;
      }

      // 2. Line-of-sight raycast: detect if organ tissue blocks the view
      let isBlocked = false;
      if (isFacingCamera) {
        const camPos = this.camera.position;
        const dir = worldPosition.clone().sub(camPos).normalize();
        const dist = camPos.distanceTo(worldPosition);
        this.occlusionRaycaster.set(camPos, dir);
        const hits = this.occlusionRaycaster.intersectObject(this.model, true);
        if (hits.length > 0 && hits[0].distance < dist - 0.03) {
          isBlocked = true;
        }
      }

      const projected = worldPosition.clone().project(this.camera);

      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const inFrustum = projected.z < 1 && projected.z > -1;
      const visible = inFrustum && isFacingCamera && !isBlocked;

      newHotspots2D.push({ data: hotspot, x, y, visible });
    }

    this.hotspots2D.set(newHotspots2D);
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

    if (!width || !height) {
      return;
    }

    this.camera.aspect = width / height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  };

  private updateMouse(event: PointerEvent): void {
    const container = this.canvasContainer.nativeElement;
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.placementMode()) {
      this.updateMouse(event);
      this.interactionRaycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.interactionRaycaster.intersectObject(this.model!, true);
      const container = this.canvasContainer.nativeElement;
      if (intersects.length > 0) {
        container.style.cursor = 'crosshair';
      } else {
        container.style.cursor = 'default';
      }
    }
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return; // Only left click
    
    // Only proceed if clicking on the canvas directly
    if (event.target !== this.renderer.domElement) return;

    if (this.placementMode()) {
      if (this.pendingHotspot()) return; // Wait until current point is handled

      this.updateMouse(event);
      this.interactionRaycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.interactionRaycaster.intersectObject(this.model!, true);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.face) {
          // Use world space position directly from raycaster
          const point = hit.point.clone(); 
          // Extract normal in world space
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          
          this.pendingHotspot.set({ position: point, normal: worldNormal });
        }
      }
    }
  };
  
  togglePlacementMode(): void {
    const isPlacing = !this.placementMode();
    this.placementMode.set(isPlacing);
    this.controls.enabled = !isPlacing; // Disable camera rotation while placing
    if (!isPlacing) {
      this.cancelPlacement();
      this.canvasContainer.nativeElement.style.cursor = 'default';
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
    if (!data || !this.pendingName.trim()) return;

    const newHotspot: Hotspot = {
      id: `custom-${Date.now()}`,
      name: this.pendingName.trim(),
      description: this.pendingDescription.trim(),
      value: this.pendingValue,
      position: { x: data.position.x, y: data.position.y, z: data.position.z },
      normal: { x: data.normal.x, y: data.normal.y, z: data.normal.z },
      isCustom: true
    };

    if (!this.organ().hotspots) {
      this.organ().hotspots = [];
    }
    
    // Update active model array
    this.organ().hotspots!.push(newHotspot);
    
    // Persist
    this.hotspotStorage.saveCustomHotspots(this.organ().id, this.organ().hotspots!);
    
    // Reload model to inject the new mesh
    this.loadModel(this.organ().model);

    this.togglePlacementMode(); // Exit mode
  }

  deleteHotspot(id: string): void {
    if (!this.organ().hotspots) return;
    
    // Remove from array
    this.organ().hotspots = this.organ().hotspots!.filter(h => h.id !== id);
    
    // Save to storage
    this.hotspotStorage.saveCustomHotspots(this.organ().id, this.organ().hotspots!);
    
    this.clearHotspot();
    
    // Reload model to remove the mesh
    this.loadModel(this.organ().model);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);

    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
      canvas.removeEventListener('pointermove', this.handlePointerMove);
    }

    window.removeEventListener('resize', this.handleResize);

    ++this.modelRequestId;

    if (this.model) {
      this.disposeModel(this.model);
    }

    this.controls?.dispose();

    this.renderer?.dispose();
  }
}
