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

    hasNoRecordedData(organ: Organ): boolean {
      if (!organ.hotspots || organ.hotspots.length === 0) {
        return true;
      }
      return organ.hotspots.every(h => h.value === undefined || h.value === null);
    }
}
