import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganListComponent } from './organ-list.component';

describe('OrganListComponent', () => {
  let component: OrganListComponent;
  let fixture: ComponentFixture<OrganListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
