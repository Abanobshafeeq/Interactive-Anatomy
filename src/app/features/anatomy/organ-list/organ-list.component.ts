import {
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';

import { AnatomyService } from '../../../core/services/anatomy.service';
import { Organ } from '../../../core/models/organ.model';

@Component({
  selector: 'app-organ-list',
  standalone: true,
  imports: [],
  templateUrl: './organ-list.component.html',
  styleUrl: './organ-list.component.css'
})
export class OrganListComponent {
  private readonly anatomyService = inject(AnatomyService);

  readonly organs = this.anatomyService.getOrgans();

  readonly selectedOrgan = input.required<Organ>();

  readonly searchTerm = signal('');

  readonly filteredOrgans = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();

    if (!term) {
      return this.organs;
    }

    return this.organs.filter((organ) =>
      organ.name.toLowerCase().includes(term)
    );
  });

  readonly organSelected = output<Organ>();

  selectOrgan(organ: Organ): void {
    this.organSelected.emit(organ);
  }

  updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }
}