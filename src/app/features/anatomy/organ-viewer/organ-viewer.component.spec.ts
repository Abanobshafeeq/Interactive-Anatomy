import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganViewerComponent } from './organ-viewer.component';

describe('OrganViewerComponent', () => {
  let component: OrganViewerComponent;
  let fixture: ComponentFixture<OrganViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
