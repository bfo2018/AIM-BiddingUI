import { Component, HostListener, OnDestroy } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AdminAuthService } from '../../features/admin/auth/admin-auth.service';
import { BiddingRealtimeService } from '../../core/services/bidding-realtime.service';

@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayoutComponent implements OnDestroy {
  isMobile = false;
  isSidebarOpen = false;
  isSidebarCollapsed = false;
  pageTitle = 'Dashboard';
  adminName = 'AIM Admin';

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly adminAuth: AdminAuthService,
    private readonly realtime: BiddingRealtimeService,
  ) {
    this.updateViewportState();
    this.setPageTitleFromRoute();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.setPageTitleFromRoute();
        if (this.isMobile) {
          this.isSidebarOpen = false;
        }
      });

    // Bootstrap admin socket once for the whole admin shell lifecycle.
    this.realtime.connect({ role: 'admin' });
    console.debug('[admin-layout] bootstrap admin socket');
  }

  ngOnDestroy(): void {
    // Keep shared admin socket lifecycle managed by auth/logout boundaries.
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportState();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  toggleSidebarCollapse(): void {
    if (this.isMobile) return;
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  onLogout(): void {
    this.adminAuth.logout();
    this.router.navigateByUrl('/admin/login');
  }

  private updateViewportState(): void {
    this.isMobile = window.innerWidth < 992;
    this.isSidebarOpen = !this.isMobile;
    if (this.isMobile) {
      this.isSidebarCollapsed = false;
    }
  }

  private setPageTitleFromRoute(): void {
    this.pageTitle = this.getDeepestRouteTitle(this.route) ?? this.resolveTitleFromUrl(this.router.url);
  }

  private resolveTitleFromUrl(url: string): string {
    if (url.includes('/users')) return 'Users';
    if (url.includes('/reports')) return 'Reports';
    if (url.includes('/settings')) return 'Settings';
    return 'Dashboard';
  }

  private getDeepestRouteTitle(route: ActivatedRoute | null): string | null {
    let current = route;
    let title: string | null = null;

    while (current) {
      const data = current.snapshot?.data;
      if (typeof data?.['title'] === 'string') {
        title = data['title'];
      }
      current = current.firstChild ?? null;
    }

    return title;
  }
}
