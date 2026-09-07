import { Component, input } from '@angular/core';
import { Organ } from '../../../core/models/organ.model';

@Component({
  selector: 'app-organ-info',
  standalone: true,
  imports: [],
  templateUrl: './organ-info.component.html',
  styleUrl: './organ-info.component.css'
})
export class OrganInfoComponent {
    organ = input.required<Organ>();

}
