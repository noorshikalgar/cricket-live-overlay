import type { Routes } from '@angular/router';

// Output and Studio are separate lazy chunks: interact.js and all editor code
// stay out of the page OBS loads.
export const routes: Routes = [
  { path: 'output', title: 'Output · Overlay Studio', loadComponent: () => import('./output/output.page') },
  { path: 'output/:sceneId', title: 'Output · Overlay Studio', loadComponent: () => import('./output/output.page') },
  { path: 'studio', title: 'Studio · Overlay Studio', loadComponent: () => import('./studio/studio.page') },
  { path: '', pathMatch: 'full', redirectTo: 'studio' },
  { path: '**', redirectTo: 'studio' },
];
