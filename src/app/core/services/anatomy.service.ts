import { Injectable } from '@angular/core';
import { Organ } from '../models/organ.model';

@Injectable({
  providedIn: 'root'
})
export class AnatomyService {
 private readonly organs: Organ[] = [
  {
    id: 'brain',
    name: 'Brain',
    description: 'The brain controls most activities of the body and processes information.',
    function: 'Controls the body',
    image: '/anatomy/brain/thumb.webp',
    model: '/models/brain.glb',
    hotspots: [
      {
        id: 'cerebrum',
        name: 'Cerebrum',
        description: 'Controls thought, memory, and voluntary actions.',
        position: { x: -0.08, y: 0.65, z: 0.37 },
        normal: { x: -0.30, y: -0.17, z: 0.94 }
      },
      {
        id: 'cerebellum',
        name: 'Cerebellum',
        description: 'Coordinates movement and balance.',
        position: { x: 0.22, y: 0.26, z: 0.23 },
        normal: { x: -0.17, y: -0.25, z: 0.95 }
      }
    ]
  },
  {
    id: 'heart',
    name: 'Heart',
    description: 'The heart pumps blood throughout the body.',
    function: 'Pumps blood',
    image: '/anatomy/heart/thumb.webp',
    model: '/models/heart.glb',
    hotspots: [
      {
        id: 'left-atrium',
        name: 'Left Atrium',
        description: 'Receives oxygenated blood from the lungs.',
        position: { x: 0.14, y: 0.60, z: 0.08 },
        normal: { x: 0.98, y: -0.02, z: 0.18 }
      },
      {
        id: 'right-ventricle',
        name: 'Right Ventricle',
        description: 'Pumps deoxygenated blood to the lungs.',
        position: { x: -0.05, y: 0.40, z: 0.28 },
        normal: { x: -0.36, y: 0.15, z: 0.92 }
      }
    ]
  },
  {
    id: 'lungs',
    name: 'Lungs',
    description: 'The lungs exchange oxygen and carbon dioxide.',
    function: 'Gas exchange',
    image: '/anatomy/lungs/thumb.webp',
    model: '/models/lungs.glb',
    hotspots: [
      {
        id: 'trachea',
        name: 'Trachea',
        description: 'Transports inhaled air directly to the bronchial tree.',
        position: { x: 0.00, y: 0.78, z: 0.04 },
        normal: { x: -0.05, y: -0.25, z: 0.96 }
      },
      {
        id: 'right-lung',
        name: 'Right Lung',
        description: 'Divided into three lobes to maximize respiratory gas exchange.',
        position: { x: -0.22, y: 0.50, z: 0.25 },
        normal: { x: -0.30, y: 0.34, z: 0.89 }
      },
      {
        id: 'left-lung',
        name: 'Left Lung',
        description: 'Two-lobed lung shaped with a cardiac notch for the heart.',
        position: { x: 0.22, y: 0.50, z: 0.25 },
        normal: { x: 0.08, y: 0.39, z: 0.92 }
      }
    ]
  },
  {
    id: 'liver',
    name: 'Liver',
    description: 'The liver performs metabolic and detoxification functions.',
    function: 'Metabolism',
    image: '/anatomy/liver/thumb.webp',
    model: '/models/liver.glb',
    hotspots: [
      {
        id: 'right-lobe',
        name: 'Right Lobe',
        description: 'Largest lobe performing primary detoxification and glycogen storage.',
        position: { x: -0.25, y: 0.50, z: 0.24 },
        normal: { x: -0.19, y: 0.21, z: 0.96 }
      },
      {
        id: 'left-lobe',
        name: 'Left Lobe',
        description: 'Smaller flattened lobe covering the superior part of the stomach.',
        position: { x: 0.18, y: 0.60, z: 0.21 },
        normal: { x: 0.35, y: 0.15, z: 0.92 }
      },
      {
        id: 'gallbladder',
        name: 'Gallbladder',
        description: 'Small pouch situated under the liver that stores concentrated bile.',
        position: { x: -0.04, y: 0.35, z: 0.045 },
        normal: { x: 0.05, y: 0.15, z: 0.98 }
      }
    ]
  },
  {
    id: 'skeleton-3ds',
    name: 'Skeleton (3DS)',
    description: 'Human skeleton in 3DS format.',
    function: 'Structural support and protection',
    image: '/anatomy/skeleton/skeleton.png',
    model: '/models/human/skeleton.3DS',
    hotspots: [
      {
        id: 'skull',
        name: 'Skull',
        description: 'Protects the brain and forms the shape of the face.',
        position: { x: 0, y: 0.8, z: 0.1 },
        normal: { x: 0, y: 0.5, z: 0.866 }
      },
      {
        id: 'ribcage',
        name: 'Ribcage',
        description: 'Protects the heart, lungs, and other major organs.',
        position: { x: 0, y: 0.3, z: 0.15 },
        normal: { x: 0, y: 0.2, z: 0.98 }
      },
      {
        id: 'pelvis',
        name: 'Pelvis',
        description: 'Connects the spine to the lower limbs.',
        position: { x: 0, y: -0.1, z: 0.1 },
        normal: { x: 0, y: -0.5, z: 0.866 }
      },
      {
        id: 'right-femur',
        name: 'Right Femur',
        description: 'The longest and strongest bone in the body.',
        position: { x: -0.15, y: -0.5, z: 0.05 },
        normal: { x: -0.866, y: 0, z: 0.5 }
      }
    ]
  },
  {
    id: 'skeleton-obj',
    name: 'Skeleton (OBJ)',
    description: 'Human skeleton in OBJ format.',
    function: 'Structural support and protection',
    image: '/anatomy/skeleton/skeleton.png',
    model: '/models/human/skeleton.obj',
    hotspots: [
      {
        id: 'skull-obj',
        name: 'Skull',
        description: 'Protects the brain and forms the shape of the face.',
        position: { x: 0, y: 0.8, z: 0.1 },
        normal: { x: 0, y: 0.5, z: 0.866 }
      },
      {
        id: 'ribcage-obj',
        name: 'Ribcage',
        description: 'Protects the heart, lungs, and other major organs.',
        position: { x: 0, y: 0.3, z: 0.15 },
        normal: { x: 0, y: 0.2, z: 0.98 }
      },
      {
        id: 'pelvis-obj',
        name: 'Pelvis',
        description: 'Connects the spine to the lower limbs.',
        position: { x: 0, y: -0.1, z: 0.1 },
        normal: { x: 0, y: -0.5, z: 0.866 }
      },
      {
        id: 'right-femur-obj',
        name: 'Right Femur',
        description: 'The longest and strongest bone in the body.',
        position: { x: -0.15, y: -0.5, z: 0.05 },
        normal: { x: -0.866, y: 0, z: 0.5 }
      }
    ]
  }
  //,
  // {
  //   id: 'skeleton-mtl',
  //   name: 'Skeleton (MTL)',
  //   description: 'Materials for the human skeleton.',
  //   function: 'Defines surface properties',
  //   image: '/anatomy/skeleton/skeleton.png',
  //   model: '/models/human/skeleton.mtl',
  //   hotspots: []
  // }
];
  getOrgans(): Organ[] {
    return this.organs;
  }
}