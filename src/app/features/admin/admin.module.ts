import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { AdminRoutingModule } from './admin-routing.module';
import { AdminLoginComponent } from './auth/admin-login';
import { AdminLayoutComponent } from '../../layout/admin-layout/admin-layout';
import { AdminSidebarComponent } from '../../layout/admin-layout/admin-sidebar.component';
import { AdminHeaderComponent } from '../../layout/admin-layout/admin-header.component';
import { AdminDashboard } from './dashboard/admin-dashboard';
import { AdminUsers } from './users/admin-users';
import { UserDetailsDialogComponent } from './users/user-details-dialog.component';
import { AdminReports } from './reports/admin-reports';
import { AdminSettings } from './settings/admin-settings';

@NgModule({
  declarations: [
    AdminLoginComponent,
    AdminLayoutComponent,
    AdminSidebarComponent,
    AdminHeaderComponent,
    AdminDashboard,
    AdminUsers,
    UserDetailsDialogComponent,
    AdminReports,
    AdminSettings,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatDialogModule,
    MatSnackBarModule,
    AdminRoutingModule,
  ],
})
export class AdminModule {}

