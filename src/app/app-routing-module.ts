import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'franchise',
    loadChildren: () =>
      import('./features/franchise/franchise.module').then((m) => m.FranchiseModule),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/admin/admin.module').then((m) => m.AdminModule),
  },
  { path: '', redirectTo: '/franchise/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/franchise/login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
