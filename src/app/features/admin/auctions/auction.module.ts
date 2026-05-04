import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NgSelectModule } from '@ng-select/ng-select';

import { AuctionRoutingModule } from './auction-routing.module';
import { AuctionLayoutComponent } from './auction-layout/auction-layout';
import { ZoneSetupComponent } from './zone-setup/zone-setup';
import { LiveAuctionsComponent } from './live-auctions/live-auctions';
import { AuctionHistoryComponent } from './auction-history/auction-history';
import { AuctionConfigComponent } from './auction-config/auction-config';
import { ConfirmAuctionDialogComponent } from './confirm-auction-dialog/confirm-auction-dialog.component';

@NgModule({
  declarations: [
    AuctionLayoutComponent,
    ZoneSetupComponent,
    LiveAuctionsComponent,
    AuctionHistoryComponent,
    AuctionConfigComponent,
    ConfirmAuctionDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatDialogModule,
    MatSnackBarModule,
    NgSelectModule,
    AuctionRoutingModule,
  ],
})
export class AuctionModule {}
