import * as THREE from 'three';
import { Hotspot } from '../../../../core/models/organ.model';
import { HotspotProjection } from './hotspot-projection';
import { disposeModel } from '../scene/resource-disposer';

describe('HotspotProjection', () => {
  let overlay: HTMLDivElement;
  let projection: HotspotProjection;
  let camera: THREE.PerspectiveCamera;
  let model: THREE.Group;
  const point: Hotspot = { id: 'point', name: 'Point', description: '',
    position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
  beforeEach(() => {
    overlay = document.createElement('div');
    document.body.appendChild(overlay);
    projection = new HotspotProjection(() => overlay);
    camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
    camera.position.z = 4;
    camera.updateMatrixWorld();
    model = new THREE.Group();
    model.updateMatrixWorld();
  });
  afterEach(() => { overlay.remove(); disposeModel(model); });

  it('transforms built-in anchors and leaves custom anchors in world space', () => {
    model.position.x = .5;
    model.scale.setScalar(2);
    model.updateMatrixWorld(true);
    const custom = { ...point, id: 'custom', isCustom: true };
    projection.register(point, model);
    projection.register(custom, model);
    const result = projection.project([point, custom], model, camera, 100, 100, []);
    if (!result) throw new Error('Expected initial projection');
    const expected = new THREE.Vector3(.5, 0, 0).project(camera);
    expect(result[0].x).toBeCloseTo((expected.x * .5 + .5) * 100, 8);
    expect(result[1].x).toBe(50);
    expect(result.every(entry => entry.visible)).toBeTrue();
  });

  it('updates existing coordinates and DOM without requesting a new signal list', () => {
    const element = document.createElement('div');
    element.dataset['hotspotId'] = point.id;
    overlay.appendChild(element);
    projection.register(point, model);
    const previous = projection.project([point], model, camera, 100, 100, []);
    if (!previous) throw new Error('Expected initial projection');
    camera.position.x = .1;
    camera.updateMatrixWorld();
    expect(projection.project([point], model, camera, 100, 100, previous)).toBeNull();
    expect(previous[0].x).toBeLessThan(50);
    expect(Number.parseFloat(element.style.left)).toBeCloseTo(previous[0].x, 3);
  });

  it('retains occlusion, backface rejection, and camera-distance cache thresholds', () => {
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    blocker.position.z = 1;
    model.add(blocker);
    model.updateMatrixWorld(true);
    const raycast = spyOn(THREE.Raycaster.prototype, 'intersectObject').and.callThrough();
    projection.register(point, model);
    const previous = projection.project([point], model, camera, 100, 100, []);
    if (!previous) throw new Error('Expected initial projection');
    expect(previous[0].visible).toBeFalse();
    camera.position.x = .05;
    camera.updateMatrixWorld();
    projection.project([point], model, camera, 100, 100, previous);
    expect(raycast).toHaveBeenCalledTimes(1);
    camera.position.x = .3;
    camera.updateMatrixWorld();
    projection.project([point], model, camera, 100, 100, previous);
    expect(raycast).toHaveBeenCalledTimes(2);
    projection.register({ ...point, normal: { x: 0, y: 0, z: -1 } }, model);
    projection.project([point], model, camera, 100, 100, previous);
    expect(raycast).toHaveBeenCalledTimes(2);
  });

  it('clears anchors and projection state on removal and replacement', () => {
    projection.register(point, model);
    const previous = projection.project([point], model, camera, 100, 100, []);
    if (!previous) throw new Error('Expected initial projection');
    projection.remove(point.id);
    expect(projection.project([point], model, camera, 100, 100, previous)).toEqual([]);
    projection.register(point, model);
    projection.clear();
    expect(projection.project([point], model, camera, 100, 100, previous)).toEqual([]);
    expect(projection.project([], undefined, camera, 100, 100, previous)).toEqual([]);
  });
});
