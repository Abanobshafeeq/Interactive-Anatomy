import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ModelLoader, ModelLoadCallbacks } from './model-loader';
import { disposeModel } from './resource-disposer';

describe('ModelLoader', () => {
  let callbacks: jasmine.SpyObj<ModelLoadCallbacks>;
  let loader: ModelLoader;
  let pending: { complete: Parameters<GLTFLoader['load']>[1]; error: Parameters<GLTFLoader['load']>[3] }[];
  beforeEach(() => {
    callbacks = jasmine.createSpyObj<ModelLoadCallbacks>('callbacks', ['loaded', 'texturesReady', 'error', 'unsupported']);
    pending = [];
    spyOn(GLTFLoader.prototype, 'load').and.callFake((_url, complete, _progress, error) => { pending.push({ complete, error }); });
    loader = new ModelLoader(() => {});
  });
  afterEach(() => loader.dispose());
  const gltf = (scene: THREE.Group) => jasmine.createSpyObj<GLTF>('gltf', [], { scene });

  it('keeps Meshopt decoder configuration', () => {
    const decoder = spyOn(GLTFLoader.prototype, 'setMeshoptDecoder').and.callThrough();
    const other = new ModelLoader(() => {});
    expect(decoder).toHaveBeenCalledWith(MeshoptDecoder);
    other.dispose();
  });

  it('disposes stale results and transfers only the latest model', () => {
    loader.load('/models/brain.glb', callbacks);
    loader.load('/models/heart.glb', callbacks);
    const stale = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const geometry = (stale.children[0] as THREE.Mesh).geometry;
    const dispose = spyOn(geometry, 'dispose').and.callThrough();
    pending[0].complete(gltf(stale));
    expect(callbacks.loaded).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    const current = new THREE.Group();
    pending[1].complete(gltf(current));
    expect(callbacks.loaded).toHaveBeenCalledOnceWith(current, false);
    disposeModel(current);
  });

  it('ignores stale errors and rejects late results after destruction', () => {
    loader.load('/models/brain.glb', callbacks);
    loader.load('/models/heart.glb', callbacks);
    pending[0].error?.(new Error('old failure'));
    expect(callbacks.error).not.toHaveBeenCalled();
    loader.dispose();
    pending[1].complete(gltf(new THREE.Group()));
    loader.load('/models/lungs.glb', callbacks);
    expect(pending.length).toBe(2);
    expect(callbacks.loaded).not.toHaveBeenCalled();
  });

  it('reports current errors and unsupported formats through separate callbacks', () => {
    loader.load('/models/brain.glb', callbacks);
    const error = new Error('Network failure');
    pending[0].error?.(error);
    expect(callbacks.error).toHaveBeenCalledWith(error);
    loader.load('/models/unsupported.xyz', callbacks);
    expect(callbacks.unsupported).toHaveBeenCalledTimes(1);
  });

  it('keeps OBJ fallback paths and transfers geometry without waiting for MTL textures', () => {
    spyOn(console, 'warn');
    const paths: string[] = [];
    spyOn(MTLLoader.prototype, 'load').and.callFake((url, _complete, _progress, error) => {
      paths.push(url);
      error?.(new Error('MTL missing'));
    });
    const object = new THREE.Group();
    spyOn(OBJLoader.prototype, 'load').and.callFake((url, complete) => { paths.push(url); complete(object); });
    loader.load('/models/teeth.OBJ', callbacks);
    expect(paths).toEqual(['/models/teeth.mtl', '/models/teeth.OBJ']);
    expect(callbacks.loaded).toHaveBeenCalledWith(object, false);
  });

  it('keeps textured OBJ hidden until its dedicated loading manager completes', () => {
    const materials = new MTLLoader().parse('', '/models/');
    let manager: THREE.LoadingManager | undefined;
    spyOn(MTLLoader.prototype, 'load').and.callFake(function(this: MTLLoader, _url, complete) {
      manager = this.manager;
      complete(materials);
    });
    const object = new THREE.Group();
    spyOn(OBJLoader.prototype, 'load').and.callFake((_url, complete) => complete(object));
    loader.load('/models/teeth.OBJ', callbacks);
    expect(callbacks.loaded).toHaveBeenCalledOnceWith(object, true);
    expect(object.visible).toBeFalse();
    expect(callbacks.texturesReady).not.toHaveBeenCalled();
    if (!manager) throw new Error('Dedicated OBJ loading manager missing');
    manager.onLoad();
    expect(callbacks.texturesReady).toHaveBeenCalledTimes(1);
  });

  it('disposes untransferred OBJ materials and textures if geometry loading fails', () => {
    const materials = new MTLLoader().parse('', '/models/');
    const texture = new THREE.Texture();
    const material = new THREE.MeshPhongMaterial({ map: texture, normalMap: texture });
    materials.materials['dental'] = material;
    const disposeMaterial = spyOn(material, 'dispose').and.callThrough();
    const disposeTexture = spyOn(texture, 'dispose').and.callThrough();
    let manager: THREE.LoadingManager | undefined;
    spyOn(MTLLoader.prototype, 'load').and.callFake(function(this: MTLLoader, _url, complete) {
      manager = this.manager;
      complete(materials);
    });
    spyOn(OBJLoader.prototype, 'load').and.callFake((_url, _complete, _progress, error) => error?.(new Error('OBJ unavailable')));
    loader.load('/models/teeth.OBJ', callbacks);
    if (!manager) throw new Error('Dedicated OBJ loading manager missing');
    manager.onLoad();
    expect(callbacks.error).toHaveBeenCalled();
    expect(callbacks.loaded).not.toHaveBeenCalled();
    expect(callbacks.texturesReady).not.toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });
});
