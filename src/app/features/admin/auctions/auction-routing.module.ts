import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ZoneSetupComponent } from './zone-setup/zone-setup';
import { LiveAuctionsComponent } from './live-auctions/live-auctions';
import { AuctionHistoryComponent } from './auction-history/auction-history';
import { AuctionConfigComponent } from './auction-config/auction-config';

const routes: Routes = [
  { path: 'zone-setup', component: ZoneSetupComponent },
  { path: 'live',       component: LiveAuctionsComponent },
  { path: 'history',    component: AuctionHistoryComponent },
  { path: 'config',     component: AuctionConfigComponent },
  { path: '', redirectTo: 'zone-setup', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuctionRoutingModule {}
