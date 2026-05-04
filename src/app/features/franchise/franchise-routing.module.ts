import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../guards/auth.guard';

import { FranchiseLoginComponent } from './auth/franchise-login';
import { FranchiseLayoutShellComponent } from '../../layout/franchise-layout-shell/franchise-layout-shell';
import { FranchiseDashboard } from './dashboard/franchise-dashboard';
import { ProductDemoComponent } from './product-demo/product-demo';
import { RequirementsEducationComponent } from './requirements-education/requirements-education';
import { ContractComponent } from './contract/contract';
import { PricingComponent } from './pricing/pricing';
import { RegistrationFormComponent } from './registration-form/registration-form';
import { FranchiseRoleComponent } from './franchise-role/franchise-role';
import { PlaceBidComponent } from './place-bid/place-bid';

const routes: Routes = [
  { path: 'login', component: FranchiseLoginComponent },
  {
    path: '',
    component: FranchiseLayoutShellComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'home', component: FranchiseDashboard },
      { path: 'product-demo', component: ProductDemoComponent },
      {
        path: 'requirements-education',
        redirectTo: 'eligibility-requirements',
        pathMatch: 'full',
      },
      {
        path: 'eligibility-requirements',
        component: RequirementsEducationComponent,
      },
      { path: 'contract', component: ContractComponent },
      { path: 'pricing', redirectTo: 'investment-earnings', pathMatch: 'full' },
      { path: 'investment-earnings', component: PricingComponent },
      {
        path: 'registration-form',
        redirectTo: 'franchise-application',
        pathMatch: 'full',
      },
      { path: 'franchise-application', component: RegistrationFormComponent },
      { path: 'franchise-role', redirectTo: 'roles-responsibilities', pathMatch: 'full' },
      { path: 'roles-responsibilities', component: FranchiseRoleComponent },
      { path: 'place-bid', component: PlaceBidComponent },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FranchiseRoutingModule {}

