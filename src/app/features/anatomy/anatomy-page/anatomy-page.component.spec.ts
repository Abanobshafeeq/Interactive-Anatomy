import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AnatomyPageComponent } from './anatomy-page.component';
import { OrganViewerComponent } from '../organ-viewer/organ-viewer.component';
import { By } from '@angular/platform-browser';
import { OrganInfoComponent } from '../organ-info/organ-info.component';

describe('AnatomyPageComponent', () => {
  let component: AnatomyPageComponent;
  let fixture: ComponentFixture<AnatomyPageComponent>;

  beforeEach(async () => {
    spyOn(OrganViewerComponent.prototype, 'ngAfterViewInit').and.stub();
    await TestBed.configureTestingModule({
      imports: [AnatomyPageComponent], providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnatomyPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('passes organ selection from the list to the viewer and info panel', () => {
    fixture.nativeElement.querySelectorAll('.organ-item')[1].click();
    fixture.detectChanges();
    expect(component.selectedOrgan().id).toBe('heart');
    expect(fixture.debugElement.query(By.directive(OrganViewerComponent)).componentInstance.organ().id).toBe('heart');
    expect(fixture.debugElement.query(By.directive(OrganInfoComponent)).componentInstance.organ().id).toBe('heart');
  });

  it('switches organs through the compact selector and ignores invalid IDs', () => {
    const select = fixture.nativeElement.querySelector('.mobile-organ-picker select');
    select.value = 'teeth-obj';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedOrgan().id).toBe('teeth-obj');
    component.selectOrganById('missing');
    expect(component.selectedOrgan().id).toBe('teeth-obj');
  });
});
