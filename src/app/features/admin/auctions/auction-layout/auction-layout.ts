import { Component } from '@angular/core';

type AuctionNavItem = {
  label: string;
  route: string;
  icon: string;
  exact: boolean;
};

@Component({
  selector: 'app-auction-layout',
  standalone: false,
  templateUrl: './auction-layout.html',
  styleUrl: './auction-layout.scss',
})
export class AuctionLayoutComponent {
  readonly navItems: AuctionNavItem[] = [
    { label: 'Zone Selection & Setup', route: '/admin/auctions/zone-setup', icon: 'map', exact: false },
    { label: 'Live Auctions',          route: '/admin/auctions/live',        icon: 'wifi_tethering', exact: false },
    { label: 'Auction History',        route: '/admin/auctions/history',     icon: 'history', exact: false },
    { label: 'Configuration',          route: '/admin/auctions/config',      icon: 'tune', exact: false },
  ];
}
