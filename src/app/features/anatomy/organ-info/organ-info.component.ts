import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Organ, OrganScreenshot } from '../../../core/models/organ.model';
import { OrganScreenshotService } from '../../../core/services/organ-screenshot.service';

@Component({
  selector: 'app-organ-info',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './organ-info.component.html',
  styleUrl: './organ-info.component.css'
})
export class OrganInfoComponent {
  private readonly screenshotService = inject(OrganScreenshotService);

  readonly organ = input.required<Organ>();
  readonly screenshotError = signal<string | null>(null);

  readonly organScreenshots = computed(() =>
    this.screenshotService
      .screenshots()
      .filter((shot) => shot.organId === this.organ().id)
  );

  hasNoRecordedData(organ: Organ): boolean {
    if (!organ.hotspots || organ.hotspots.length === 0) {
      return true;
    }
    return organ.hotspots.every(h => h.value === undefined || h.value === null);
  }

  downloadScreenshot(shot: OrganScreenshot): void {
    const link = document.createElement('a');
    const ext = shot.imageDataUrl.startsWith('data:image/webp') ? 'webp' : 'png';
    link.href = shot.imageDataUrl;
    link.download = `${shot.organId}-${shot.id}.${ext}`;
    link.click();
  }

  deleteScreenshot(id: string): void {
    this.screenshotError.set(this.screenshotService.deleteScreenshot(id)
      ? null : 'Screenshot was not deleted. Browser storage is unavailable.');
  }
}

