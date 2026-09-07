import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganInfoComponent } from './organ-info.component';

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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
