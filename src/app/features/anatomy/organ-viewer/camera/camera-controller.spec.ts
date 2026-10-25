import * as THREE from 'three';
import { CameraController } from './camera-controller';

describe('CameraController', () => {
  const create = () => {
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
    camera.position.z = 4;
    return { camera, controls: { target: new THREE.Vector3(), minDistance: .4, maxDistance: 8,
      update: jasmine.createSpy('update').and.returnValue(false) }, controller: new CameraController() };
  };

  it('preserves pan scale, relative camera distance, recenter, and reset', () => {
    const { camera, controls, controller } = create();
    expect(controller.step(camera, controls, 'right', 1)).toBeTrue();
    expect(camera.position.x).toBeCloseTo(.1, 8);
    expect(controls.target.x).toBeCloseTo(.1, 8);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(4, 8);
    controller.step(camera, controls, 'up', .2);
    expect(controls.target.y).toBeCloseTo(.02, 8);
    controller.recenter(camera, controls);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(camera.position.toArray()).toEqual([0, 0, 4]);
    controller.reset(camera, controls);
    expect(camera.position.toArray()).toEqual([0, 0, 4]);
  });

  it('retains pan radius and zoom distance limits', () => {
    const { camera, controls, controller } = create();
    controls.target.x = 3.2;
    camera.position.x = 3.2;
    expect(controller.step(camera, controls, 'right', 1)).toBeFalse();
    expect(controls.target.x).toBe(3.2);
    for (let i = 0; i < 100; i++) controller.step(camera, controls, 'zoomIn', 1);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(.4, 8);
    for (let i = 0; i < 100; i++) controller.step(camera, controls, 'zoomOut', 1);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(8, 8);
    camera.position.copy(controls.target);
    expect(controller.step(camera, controls, 'zoomIn', 1)).toBeFalse();
  });
});
