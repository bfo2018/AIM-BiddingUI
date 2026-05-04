import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

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
  selector: 'app-franchise-side-layout',
  standalone: false,
  templateUrl: './franchise-side-layout.html',
  styleUrl: './franchise-side-layout.scss',
})
export class FranchiseSideLayoutComponent implements OnInit, OnDestroy {
  @Input() navItems: FranchiseNavItem[] = [];
  @Input() user: FranchiseUser | null = null;
  @Output() logout = new EventEmitter<void>();

  isMobile = false;
  sidebarOpened = true;
  private readonly destroy$ = new Subject<void>();

  constructor(private breakpointObserver: BreakpointObserver) {}

  // Keep the Home route/component as-is, but hide it from the left side menu.
  get filteredNavItems(): FranchiseNavItem[] {
    return this.navItems.filter((item) => item.route !== '/franchise/home');
  }

  get userInitial(): string {
    const n = (this.user?.name || '').trim();
    return n ? n.charAt(0).toUpperCase() : '';
  }

  ngOnInit(): void {
    this.breakpointObserver
      .observe('(max-width: 960px)')
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.isMobile = state.matches;
        this.sidebarOpened = !state.matches;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onMenuToggle(): void {
    this.sidebarOpened = !this.sidebarOpened;
  }

  onNavClick(): void {
    if (this.isMobile) this.sidebarOpened = false;
  }
}
