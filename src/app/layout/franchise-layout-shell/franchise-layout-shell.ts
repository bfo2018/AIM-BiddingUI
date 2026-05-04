import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { UserSessionService } from '../../core/services/user-session.service';

type FranchiseNavItem = {
  label: string;
  route: string;
  icon: string;
};

type FranchiseUser = {
  name: string;
  mobile?: string;
  email: string;
};

@Component({
  selector: 'app-franchise-layout-shell',
  standalone: false,
  templateUrl: './franchise-layout-shell.html',
  styleUrl: './franchise-layout-shell.scss',
})
export class FranchiseLayoutShellComponent {
  readonly user: FranchiseUser | null;

  readonly navItems: FranchiseNavItem[] = [
    { label: 'Home', route: '/franchise/home', icon: 'home' },
    { label: 'Product Demo', route: '/franchise/product-demo', icon: 'smart_display' },
    {
      label: 'Eligibility',
      route: '/franchise/eligibility-requirements',
      icon: 'fact_check',
    },
    {
      label: 'Roles & Responsibilities',
      route: '/franchise/roles-responsibilities',
      icon: 'groups',
    },
    {
      label: 'Investment & Earnings',
      route: '/franchise/investment-earnings',
      icon: 'trending_up',
    },
    {
      label: 'Franchise Application',
      route: '/franchise/franchise-application',
      icon: 'how_to_reg',
    },
    { label: 'Place Bid', route: '/franchise/place-bid', icon: 'gavel' },
    { label: 'Contract', route: '/franchise/contract', icon: 'handshake' },
  ];

  constructor(
    private session: UserSessionService,
    private router: Router
  ) {
    const token = this.session.getToken();
    const user = this.session.getUserFromToken();

    if (!token || !user) {
      this.user = null;
      void this.router.navigateByUrl('/franchise/login');
      return;
    }

    this.user = {
      name: user.name || 'Franchise User',
      mobile: user.mobile || '',
      email: user.email || '',
    };
  }

  onLogout(): void {
    this.session.logout();
  }
}
