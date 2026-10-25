import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganViewerComponent } from './organ-viewer.component';
import { AnatomyService } from '../../../core/services/anatomy.service';
import { DentalService } from '../../../core/services/dental.service';
import { OrganScreenshotService } from '../../../core/services/organ-screenshot.service';
import { HotspotStorageService } from '../../../core/services/hotspot-storage.service';
import * as THREE from 'three';
import { subdivideGeometry } from './dental/dental-geometry';
import { disposeModel } from './scene/resource-disposer';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Organ } from '../../../core/models/organ.model';

interface ViewerTestBoundary {
  loadedOrgan?: Organ;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraHoldStartTime: number;
  renderer: {
    domElement: HTMLCanvasElement;
    render: jasmine.Spy;
    dispose: jasmine.Spy;
    forceContextLoss: jasmine.Spy;
    setSize: jasmine.Spy;
  };
  controls: {
    update: jasmine.Spy<() => boolean>;
    target: THREE.Vector3;
    autoRotate: boolean;
    minDistance: number;
    maxDistance: number;
    removeEventListener: jasmine.Spy;
    dispose: jasmine.Spy;
  };
  resizeObserver: { disconnect: jasmine.Spy };
  animate: FrameRequestCallback;
  requestRender(): void;
  handleControlsChange(): void;
  handlePointerMove(event: PointerEvent): void;
  handlePointerLeave(): void;
  processPointerMove(event: PointerEvent): void;
  loadModel(organ: Organ): void;
  initScene(): void;
}

describe('OrganViewerComponent', () => {
  let component: OrganViewerComponent;
  let fixture: ComponentFixture<OrganViewerComponent>;
  let viewer: ViewerTestBoundary;
  let trackedFrame: FrameRequestCallback | undefined;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const flushFrame = () => {
    const first = frames.entries().next().value;
    if (!first) throw new Error('No frame scheduled');
    frames.delete(first[0]);
    first[1](performance.now());
  };

  beforeEach(async () => {
    trackedFrame = undefined;
    spyOn(OrganViewerComponent.prototype, 'ngAfterViewInit').and.stub();
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    frames = new Map();
    nextFrame = 1000000;
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      if (callback !== trackedFrame) return nativeRequest(callback);
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake(id => {
      if (frames.has(id)) frames.delete(id);
      else nativeCancel(id);
    });
    await TestBed.configureTestingModule({
      imports: [OrganViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganViewerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('organ', TestBed.inject(AnatomyService).getOrgans()[0]);
    fixture.detectChanges();
    viewer = component as unknown as ViewerTestBoundary;
    trackedFrame = viewer.animate;
    viewer.loadedOrgan = component.organ();
    viewer.scene = new THREE.Scene();
    viewer.camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
    viewer.camera.position.set(0, 0, 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    viewer.renderer = { domElement: canvas, render: jasmine.createSpy('render'),
      dispose: jasmine.createSpy('dispose'), forceContextLoss: jasmine.createSpy('forceContextLoss'),
      setSize: jasmine.createSpy('setSize') };
    viewer.controls = { update: jasmine.createSpy('update').and.returnValue(false),
      target: new THREE.Vector3(), autoRotate: false, minDistance: .4, maxDistance: 8,
      removeEventListener: jasmine.createSpy('removeEventListener'), dispose: jasmine.createSpy('dispose') };
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('coalesces render requests and stops scheduling when idle', () => {
    viewer.requestRender();
    viewer.requestRender();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(viewer.renderer.render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('continues while controls damp and settles without duplicate frames', () => {
    viewer.controls.update.and.callFake(() => {
      viewer.handleControlsChange();
      return true;
    });
    viewer.requestRender();
    flushFrame();
    expect(frames.size).toBe(1);
    viewer.controls.update.and.returnValue(false);
    flushFrame();
    expect(frames.size).toBe(0);
  });

  it('resumes for auto-rotation and stops when disabled', () => {
    component.toggleAutoRotate();
    fixture.detectChanges();
    expect(viewer.controls.autoRotate).toBeTrue();
    flushFrame();
    expect(frames.size).toBe(1);
    component.toggleAutoRotate();
    fixture.detectChanges();
    flushFrame();
    expect(frames.size).toBe(0);
  });

  it('pauses rotation for hotspot interactions and resumes afterward', () => {
    component.toggleAutoRotate();
    fixture.detectChanges();
    component.selectHotspot(component.organ().hotspots![0]);
    fixture.detectChanges();
    expect(viewer.controls.autoRotate).toBeFalse();
    component.clearHotspot();
    fixture.detectChanges();
    expect(viewer.controls.autoRotate).toBeTrue();
  });

  it('continues held camera actions and resumes after keyboard nudges', () => {
    component.startCameraControl('right');
    viewer.cameraHoldStartTime = performance.now() - 200;
    const initialX = viewer.camera.position.x;
    flushFrame();
    expect(viewer.camera.position.x).toBeGreaterThan(initialX);
    expect(frames.size).toBe(1);
    component.stopCameraControl();
    flushFrame();
    expect(frames.size).toBe(0);
    component.nudgeCamera('zoomIn');
    expect(frames.size).toBe(1);
    expect(viewer.camera.position.distanceTo(viewer.controls.target)).toBeLessThan(4);
    component.recenterCamera();
    expect(viewer.controls.target.length()).toBe(0);
    component.resetCamera();
    expect(viewer.camera.position.toArray()).toEqual([0, 0, 4]);
  });

  it('coalesces pointer picking and clears pending hover work on leave', () => {
    viewer.loadedOrgan = { ...component.organ(), id: 'teeth-obj' };
    const process = spyOn(viewer, 'processPointerMove');
    const first = new PointerEvent('pointermove', { clientX: 10 });
    const latest = new PointerEvent('pointermove', { clientX: 20 });
    viewer.handlePointerMove(first);
    viewer.handlePointerMove(latest);
    expect(frames.size).toBe(1);
    flushFrame();
    expect(process).toHaveBeenCalledOnceWith(latest);
    viewer.handlePointerMove(first);
    viewer.handlePointerLeave();
    flushFrame();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('does not show saved feedback when screenshot persistence fails', () => {
    spyOn(TestBed.inject(OrganScreenshotService), 'saveScreenshot').and.returnValue(null);
    component.captureScreenshot();
    expect(component.lastCapturedScreenshot()).toBeNull();
    expect(component.storageError()).toContain('not saved');
    expect(component.isCapturingFlash()).toBeFalse();
  });

  it('handles screenshot canvas encoding errors', () => {
    spyOn(HTMLCanvasElement.prototype, 'toDataURL').and.throwError('Canvas unavailable');
    spyOn(console, 'error');
    expect(() => component.captureScreenshot()).not.toThrow();
    expect(component.storageError()).toContain('could not be captured');
  });

  it('persists edited custom point values', () => {
    const point = { ...component.organ().hotspots![0], id: 'custom-test', isCustom: true, value: 5 };
    viewer.loadedOrgan = { ...component.organ(), hotspots: [point] };
    const save = spyOn(TestBed.inject(HotspotStorageService), 'saveCustomHotspots').and.returnValue(true);
    component.selectHotspot(point);
    component.saveHotspotValue(point);
    expect(save).toHaveBeenCalledWith(component.organ().id, [point]);
    expect(component.activeHotspot()).toBeNull();
  });

  it('preserves custom point state on failed creation and deletion', () => {
    spyOn(TestBed.inject(HotspotStorageService), 'saveCustomHotspots').and.returnValue(false);
    const original = component.organ().hotspots!.slice();
    component.pendingHotspot.set({ position: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1) });
    component.pendingName = 'New point';
    component.confirmPlacement();
    expect(component.organ().hotspots).toEqual(original);
    expect(component.pendingHotspot()).not.toBeNull();
    component.deleteHotspot(original[0].id);
    expect(component.organ().hotspots).toEqual(original);
  });

  it('applies dental colors, divisions, and grid preferences using the existing state format', () => {
    const dental = TestBed.inject(DentalService);
    const save = spyOn(dental, 'saveToothStates').and.returnValue(true);
    const grid = spyOn(dental, 'saveGridLinesPreference').and.returnValue(true);
    component.selectTooth(dental.getTooth(8)!);
    component.setDivisionMode(2);
    component.togglePart('right');
    component.applyColor('#ff0000');
    expect(component.toothColors().get(8)?.zones).toEqual({ q1: '#ff0000', q3: '#ff0000' });
    component.setDivisionMode(3);
    component.applyColor('#abc');
    expect(component.toothColors().get(8)?.zones['middle']).toBe('#abc');
    component.toggleGridLines();
    expect(grid).toHaveBeenCalledWith(false);
    expect(save).toHaveBeenCalled();
    component.resetCurrentTooth();
    expect(component.toothColors().size).toBe(0);
  });

  it('preserves UVs, normals, groups, and bounds through dental subdivision', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([0,0,1]).flat(), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,0, 1,1, 0,1], 2));
    geometry.addGroup(0, 6, 1);
    geometry.userData = { asset: 'dental' };
    const result = subdivideGeometry(geometry, 1);
    expect(result.attributes['position'].count).toBe(24);
    expect(result.attributes['normal'].count).toBe(24);
    expect(result.attributes['uv'].count).toBe(24);
    expect(result.groups).toEqual([{ start: 0, count: 24, materialIndex: 1 }]);
    expect(result.userData).toEqual(geometry.userData);
    result.computeBoundingBox();
    expect(result.boundingBox!.min.toArray()).toEqual([0, 0, 0]);
    expect(result.boundingBox!.max.toArray()).toEqual([1, 1, 0]);
    geometry.dispose();
    result.dispose();
  });

  it('reports unsaved dental edits and grid preferences when storage fails', () => {
    const dental = TestBed.inject(DentalService);
    spyOn(dental, 'saveToothStates').and.returnValue(false);
    spyOn(dental, 'saveGridLinesPreference').and.returnValue(false);
    component.selectTooth(dental.getTooth(8)!);
    component.applyColor('#abc');
    expect(component.storageError()).toContain('could not be saved');
    expect(component.toothColors().get(8)?.zones['q1']).toBe('#abc');
    component.toggleGridLines();
    expect(component.storageError()).toContain('Grid preference could not be saved');
  });

  it('disposes resources shared by meshes only once', () => {
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const disposeGeometry = spyOn(geometry, 'dispose');
    const disposeMaterial = spyOn(material, 'dispose');
    const disposeTexture = spyOn(texture, 'dispose');
    disposeModel(root);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('disposes late model loads after destruction and never restarts rendering', () => {
    let finish: Parameters<GLTFLoader['load']>[1] | undefined;
    spyOn(GLTFLoader.prototype, 'load').and.callFake((_path, callback) => { finish = callback; });
    viewer.loadModel(component.organ());
    fixture.destroy();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const dispose = spyOn(geometry, 'dispose');
    if (!finish) throw new Error('Model load was not started');
    const scene = new THREE.Group().add(new THREE.Mesh(geometry, material));
    finish(jasmine.createSpyObj<GLTF>('gltf', [], { scene }));
    expect(dispose).toHaveBeenCalled();
    viewer.requestRender();
    expect(frames.size).toBe(0);
  });

  it('cancels pending frames, observers, controls, and the renderer on destruction', () => {
    viewer.resizeObserver = { disconnect: jasmine.createSpy('disconnect') };
    viewer.requestRender();
    const renderer = viewer.renderer;
    const observer = viewer.resizeObserver;
    fixture.destroy();
    expect(frames.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(viewer.controls.dispose).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalled();
  });

  it('shows a retryable error when loading fails', () => {
    let fail: ((error: unknown) => void) | undefined;
    const load = spyOn(GLTFLoader.prototype, 'load').and.callFake((_path, _load, _progress, error) => { fail = error; });
    spyOn(console, 'error');
    viewer.loadModel(component.organ());
    if (!fail) throw new Error('Model error callback was not supplied');
    fail(new Error('Network unavailable'));
    expect(component.isLoading()).toBeFalse();
    expect(component.loadError()).toContain('Unable to load Brain');
    component.retryLoad();
    expect(load).toHaveBeenCalledTimes(2);
    expect(component.loadError()).toBeNull();
    expect(component.isLoading()).toBeTrue();
  });

  it('handles WebGL initialization failures without throwing', () => {
    (OrganViewerComponent.prototype.ngAfterViewInit as jasmine.Spy).and.callThrough();
    spyOn(viewer, 'initScene').and.throwError('WebGL unavailable');
    spyOn(console, 'error');
    expect(() => component.ngAfterViewInit()).not.toThrow();
    expect(component.loadError()).toContain('WebGL');
    expect(component.isLoading()).toBeFalse();
  });
});
