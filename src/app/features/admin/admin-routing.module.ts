import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminAuthGuard } from '../../core/guards/admin-auth.guard';
import { AdminLoginGuard } from '../../core/guards/admin-login.guard';

import { AdminLoginComponent } from './auth/admin-login';
import { AdminLayoutComponent } from '../../layout/admin-layout/admin-layout';
import { AdminDashboard } from './dashboard/admin-dashboard';
import { AdminUsers } from './users/admin-users';
import { AdminReports } from './reports/admin-reports';
import { AdminSettings } from './settings/admin-settings';

const routes: Routes = [
  { path: 'login', component: AdminLoginComponent, canActivate: [AdminLoginGuard] },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [AdminAuthGuard],
    children: [
      { path: 'dashboard', component: AdminDashboard, data: { title: 'Dashboard' } },
      { path: 'users', component: AdminUsers, data: { title: 'Users' } },
      { path: 'reports', component: AdminReports, data: { title: 'Reports' } },
      { path: 'settings', component: AdminSettings, data: { title: 'Settings' } },
      {
        path: 'auctions',
        loadChildren: () =>
          import('./auctions/auction.module').then(m => m.AuctionModule),
        data: { title: 'Auction Management' },
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}

