import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
} from '@angular/core';


import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { Organ } from '../../../core/models/organ.model';

@Component({
  selector: 'app-organ-viewer',
  standalone: true,
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

  private readonly loader = new GLTFLoader();

  private modelRequestId = 0;

  readonly isLoading = input(false);

  private autoRotate = false;

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

    window.addEventListener('resize', this.handleResize);
  }

  private loadModel(path: string): void {
    const requestId = ++this.modelRequestId;

    if (this.model) {
      this.disposeModel(this.model);

      this.scene.remove(this.model);

      this.model = undefined;
    }

    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.loader.load(
      path,

      (gltf) => {
        if (requestId !== this.modelRequestId) {
          this.disposeModel(gltf.scene);
          return;
        }

        this.model = gltf.scene;

        this.prepareModel(this.model);

        this.scene.add(this.model);

        this.resetCamera();
      },

      undefined,

      (error) => {
        if (requestId !== this.modelRequestId) {
          return;
        }

        console.error('Failed to load anatomy model:', error);
      },
    );
  }

  private prepareModel(model: THREE.Object3D): void {
    model.position.set(0, 0, 0);

    model.rotation.set(0, 0, 0);

    model.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(model);

    const center = box.getCenter(new THREE.Vector3());

    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);

    const maxSize = Math.max(size.x, size.y, size.z);

    if (maxSize > 0) {
      const scale = 2 / maxSize;

      model.scale.setScalar(scale);
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
        object.material.forEach((material) => {
          material.dispose();
        });
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
    }
  };

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

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);

    window.removeEventListener('resize', this.handleResize);

    ++this.modelRequestId;

    if (this.model) {
      this.disposeModel(this.model);
    }

    this.controls?.dispose();

    this.renderer?.dispose();
  }
}
