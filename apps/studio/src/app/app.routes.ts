import type { Routes } from '@angular/router';

// Output and Studio are separate lazy chunks: interact.js and all editor code
// stay out of the page OBS loads.
export const routes: Routes = [
  { path: 'output', loadComponent: () => import('./output/output.page') },
  { path: 'output/:sceneId', loadComponent: () => import('./output/output.page') },
  { path: 'studio', loadComponent: () => import('./studio/studio.page') },
  { path: '', pathMatch: 'full', redirectTo: 'studio' },
  { path: '**', redirectTo: 'studio' },
];
