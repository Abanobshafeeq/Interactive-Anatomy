import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'anatomy',
    pathMatch: 'full'
  },
  {
    path: 'anatomy',
    loadComponent: () =>
      import('./features/anatomy/anatomy-page/anatomy-page.component')
        .then(m => m.AnatomyPageComponent)
  }
];