import { Component, EventEmitter, Input, Output } from '@angular/core';

type AdminNavItem = {
  label: string;
  route: string;
  icon: string;
};

type AdminNavGroup = {
  label: string;
  icon: string;
  baseRoute: string;
  children: AdminNavItem[];
};

@Component({
  selector: 'app-admin-sidebar',
  standalone: false,
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.scss',
})
export class AdminSidebarComponent {
  @Input() isMobile = false;
  @Input() isOpen = false;
  @Input() isCollapsed = false;
  @Input() adminName = 'System Admin';
  @Output() closeSidebar = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  readonly navItems: AdminNavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Users',     route: '/admin/users',     icon: 'groups' },
    // { label: 'Reports',  route: '/admin/reports',  icon: 'insights' },
    // { label: 'Settings', route: '/admin/settings', icon: 'settings' },
  ];

  readonly navGroups: AdminNavGroup[] = [
    {
      label: 'Auction Management',
      icon: 'gavel',
      baseRoute: '/admin/auctions',
      children: [
        { label: 'Zone Selection & Setup', route: '/admin/auctions/zone-setup', icon: 'map' },
        { label: 'Live Auctions',          route: '/admin/auctions/live',        icon: 'wifi_tethering' },
        { label: 'Auction History',        route: '/admin/auctions/history',     icon: 'history' },
        { label: 'Configuration',          route: '/admin/auctions/config',      icon: 'tune' },
      ],
    },
  ];

  openGroups = new Set<string>(['Auction Management']);

  get adminInitials(): string {
    return this.adminName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  toggleGroup(label: string): void {
    this.openGroups.has(label) ? this.openGroups.delete(label) : this.openGroups.add(label);
  }

  isGroupOpen(label: string): boolean {
    return this.openGroups.has(label);
  }

  onMenuItemClick(): void {
    if (this.isMobile) {
      this.closeSidebar.emit();
    }
  }
}
