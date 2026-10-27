import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeModel, disposeMaterials } from './resource-disposer';

export interface ModelLoadCallbacks {
  loaded(object: THREE.Object3D, waitForTextures: boolean): void;
  texturesReady(): void;
  error(error: unknown): void;
  unsupported(): void;
}

export class ModelLoader {
  private modelRequestId = 0;
  private destroyed = false;
  private readonly loadingManager = new THREE.LoadingManager(
    () => this.requestRender(), () => this.requestRender(),
  );
  private readonly gltfLoader = new GLTFLoader(this.loadingManager).setMeshoptDecoder(MeshoptDecoder);
  private readonly tdsLoader = new TDSLoader(this.loadingManager);

  constructor(private readonly requestRender: () => void) {}

  load(path: string, callbacks: ModelLoadCallbacks): void {
    if (this.destroyed) return;
    const requestId = ++this.modelRequestId;
    const lowerPath = path.toLowerCase();
    const onLoad = (object: THREE.Object3D, waitForTextures = false) => {
      if (!this.isCurrent(requestId)) {
        disposeModel(object);
        return;
      }
      callbacks.loaded(object, waitForTextures);
    };
    const onError = (error: unknown) => {
      if (this.isCurrent(requestId)) callbacks.error(error);
    };
    if (lowerPath.endsWith('.gltf') || lowerPath.endsWith('.glb')) {
      this.gltfLoader.load(path, gltf => onLoad(gltf.scene), undefined, onError);
    } else if (lowerPath.endsWith('.3ds')) {
      this.tdsLoader.load(path, object => onLoad(object), undefined, onError);
    } else if (lowerPath.endsWith('.obj')) {
      this.loadObj(path, requestId, onLoad, onError, callbacks.texturesReady);
    } else {
      callbacks.unsupported();
    }
  }

  dispose(): void {
    this.destroyed = true;
    ++this.modelRequestId;
  }

  private isCurrent(requestId: number): boolean {
    return !this.destroyed && requestId === this.modelRequestId;
  }

  private loadObj(
    path: string,
    requestId: number,
    onLoad: (object: THREE.Object3D, waitForTextures?: boolean) => void,
    onError: (error: unknown) => void,
    onTexturesReady: () => void,
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
      if (!transferred && (failed || !this.isCurrent(requestId))) {
        disposeMaterials(ownedMaterials);
        ownedMaterials = [];
      }
      if (!failed && this.isCurrent(requestId)) {
        onTexturesReady();
      }
    };

    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setResourcePath(basePath);

    mtlLoader.load(
      mtlPath,
      (materials) => {
        if (!this.isCurrent(requestId)) {
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
        if (!this.isCurrent(requestId)) {
          return;
        }
        console.warn('Failed to load MTL for OBJ, falling back to geometry only.', error);
        new OBJLoader(this.loadingManager).load(path, (obj) => onLoad(obj), undefined, onError);
      }
    );
  }
}
