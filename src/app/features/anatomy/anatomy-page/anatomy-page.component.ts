import {
  Component,
  inject,
  signal
} from '@angular/core';

import { OrganListComponent } from '../organ-list/organ-list.component';
import { OrganViewerComponent } from '../organ-viewer/organ-viewer.component';
import { OrganInfoComponent } from '../organ-info/organ-info.component';

import { AnatomyService } from '../../../core/services/anatomy.service';
import { Organ } from '../../../core/models/organ.model';

@Component({
  selector: 'app-anatomy-page',
  standalone: true,
  imports: [
    OrganListComponent,
    OrganViewerComponent,
    OrganInfoComponent
  ],
  templateUrl: './anatomy-page.component.html',
  styleUrl: './anatomy-page.component.css'
})
export class AnatomyPageComponent {
  private readonly anatomyService = inject(AnatomyService);

  readonly selectedOrgan = signal<Organ>(
    this.anatomyService.getOrgans()[0]
  );

  selectOrgan(organ: Organ): void {
    this.selectedOrgan.set(organ);
  }
}