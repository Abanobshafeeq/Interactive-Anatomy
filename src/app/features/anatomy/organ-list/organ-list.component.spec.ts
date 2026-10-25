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
    fixture.componentRef.setInput('selectedOrgan', component.organs[0]);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filters names without case or whitespace sensitivity', () => {
    component.updateSearchTerm('  HEART  ');
    fixture.detectChanges();
    expect(component.filteredOrgans().map(organ => organ.id)).toEqual(['heart']);
    expect(fixture.nativeElement.querySelectorAll('.organ-item').length).toBe(1);
  });

  it('shows an empty state and restores the full list', () => {
    component.updateSearchTerm('absent');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('No organs');
    component.updateSearchTerm('');
    expect(component.filteredOrgans()).toEqual(component.organs);
  });

  it('emits the clicked organ and marks the selected input', () => {
    const selected = spyOn(component.organSelected, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('.organ-item');
    expect(buttons[0].classList.contains('active')).toBeTrue();
    buttons[1].click();
    expect(selected).toHaveBeenCalledWith(component.organs[1]);
  });
});
