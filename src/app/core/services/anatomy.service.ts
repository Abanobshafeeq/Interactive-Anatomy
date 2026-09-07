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
    model: '/models/brain.glb'
  },
  {
    id: 'heart',
    name: 'Heart',
    description: 'The heart pumps blood throughout the body.',
    function: 'Pumps blood',
    image: '/anatomy/heart/thumb.webp',
    model: '/models/heart.glb'
  },
  {
    id: 'lungs',
    name: 'Lungs',
    description: 'The lungs exchange oxygen and carbon dioxide.',
    function: 'Gas exchange',
    image: '/anatomy/lungs/thumb.webp',
    model: '/models/lungs.glb'
  },
  {
    id: 'liver',
    name: 'Liver',
    description: 'The liver performs metabolic and detoxification functions.',
    function: 'Metabolism',
    image: '/anatomy/liver/thumb.webp',
    model: '/models/liver.glb'
  }
];
  getOrgans(): Organ[] {
    return this.organs;
  }
}