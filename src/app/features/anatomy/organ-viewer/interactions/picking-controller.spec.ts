import * as THREE from 'three';
import { PickingController } from './picking-controller';
import { disposeModel } from '../scene/resource-disposer';

describe('PickingController', () => {
  let camera: THREE.PerspectiveCamera;
  let model: THREE.Group;
  const rect = { left: 10, top: 20, width: 100, height: 100 };
  const event = { clientX: 60, clientY: 70 };
  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
    camera.position.z = 4;
    camera.updateMatrixWorld();
    model = new THREE.Group();
    for (const [name, z] of [['front', 1], ['back', 0]] as const) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = name;
      mesh.position.z = z;
      model.add(mesh);
    }
    model.updateMatrixWorld(true);
  });
  afterEach(() => disposeModel(model));

  it('preserves nearest-hit picking and applies allowed-mesh and gum filters only when configured', () => {
    const gum = jasmine.createSpy('gum').and.callFake((hit: THREE.Intersection) => hit.object.name === 'front');
    const picking = new PickingController(gum);
    expect(picking.pick(event, rect, camera, model, null)?.object.name).toBe('front');
    expect(gum).not.toHaveBeenCalled();
    expect(picking.pick(event, rect, camera, model, new Set(['back']))?.object.name).toBe('back');
    expect(picking.pick(event, rect, camera, model, new Set(['front', 'back']))?.object.name).toBe('back');
    expect(picking.pick({ clientX: -1000, clientY: -1000 }, rect, camera, model, null)).toBeUndefined();
  });

  it('preserves world-normal transformation without changing the source normal', () => {
    const source = new THREE.Vector3(1, 1, 0);
    const result = new PickingController(() => false).surfaceNormal(source, new THREE.Matrix4().makeScale(2, 1, .5));
    expect(result.x).toBeCloseTo(1 / Math.sqrt(5), 8);
    expect(result.y).toBeCloseTo(2 / Math.sqrt(5), 8);
    expect(source.toArray()).toEqual([1, 1, 0]);
  });
});
