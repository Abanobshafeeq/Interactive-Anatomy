import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganInfoComponent } from './organ-info.component';
import { AnatomyService } from '../../../core/services/anatomy.service';
import { OrganScreenshotService } from '../../../core/services/organ-screenshot.service';

describe('OrganInfoComponent', () => {
  let component: OrganInfoComponent;
  let fixture: ComponentFixture<OrganInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganInfoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('organ', TestBed.inject(AnatomyService).getOrgans()[0]);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('updates the displayed organ when its input changes', () => {
    fixture.componentRef.setInput('organ', TestBed.inject(AnatomyService).getOrgans()[1]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain('Heart');
  });

  it('reports deletion failures', () => {
    spyOn(TestBed.inject(OrganScreenshotService), 'deleteScreenshot').and.returnValue(false);
    component.deleteScreenshot('capture');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('not deleted');
  });
});
