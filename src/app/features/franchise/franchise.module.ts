import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { LayoutModule } from '@angular/cdk/layout';
import { NgSelectModule } from '@ng-select/ng-select';

import { FranchiseRoutingModule } from './franchise-routing.module';
import { FranchiseLoginComponent } from './auth/franchise-login';
import { FranchiseLayoutShellComponent } from '../../layout/franchise-layout-shell/franchise-layout-shell';
import { FranchiseSideLayoutComponent } from '../../layout/franchise-side-layout/franchise-side-layout';
import { FranchiseDashboard } from './dashboard/franchise-dashboard';
import { ProductDemoComponent } from './product-demo/product-demo';
import { RequirementsEducationComponent } from './requirements-education/requirements-education';
import { ContractComponent } from './contract/contract';
import { PricingComponent } from './pricing/pricing';
import { RegistrationFormComponent } from './registration-form/registration-form';
import { FranchiseRoleComponent } from './franchise-role/franchise-role';
import { PlaceBidComponent } from './place-bid/place-bid';
import { ServiceDetailsDialogComponent } from './auth/service-details-dialog/service-details-dialog.component';
import { VideoDemoDialogComponent } from './product-demo/video-demo-dialog/video-demo-dialog.component';

@NgModule({
  declarations: [
    FranchiseLoginComponent,
    FranchiseLayoutShellComponent,
    FranchiseSideLayoutComponent,
    FranchiseDashboard,
    ProductDemoComponent,
    RequirementsEducationComponent,
    ContractComponent,
    PricingComponent,
    RegistrationFormComponent,
    FranchiseRoleComponent,
    PlaceBidComponent,
    ServiceDetailsDialogComponent,
    VideoDemoDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LayoutModule,
    FranchiseRoutingModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatMenuModule,
    MatDialogModule,
    MatSelectModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    NgSelectModule,
  ],
})
export class FranchiseModule {}

