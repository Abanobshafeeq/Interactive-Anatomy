import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { OrganViewerComponent } from './features/anatomy/organ-viewer/organ-viewer.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    spyOn(OrganViewerComponent.prototype, 'ngAfterViewInit').and.stub();
    await TestBed.configureTestingModule({
      imports: [AppComponent], providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('renders the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(RouterOutlet))).toBeTruthy();
  });

  it('redirects the initial route and loads the anatomy page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/anatomy');
    expect(fixture.nativeElement.querySelector('app-anatomy-page')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Brain');
  });
});
