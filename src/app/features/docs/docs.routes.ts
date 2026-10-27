import { Routes } from '@angular/router';
import { DocsLayoutComponent } from './docs-layout.component';
import { DocsPageComponent } from './docs-page.component';

export const DOCS_ROUTES: Routes = [{
  path: '', component: DocsLayoutComponent,
  children: [
    { path: 'source/:sourceId', loadComponent: () => import('./docs-source.component').then(module => module.DocsSourceComponent) },
    { path: '**', component: DocsPageComponent },
  ],
}];
