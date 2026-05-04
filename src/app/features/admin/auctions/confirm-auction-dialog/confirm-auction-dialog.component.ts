import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuctionConfig, AuctionGlobalConfig, ExternalZone } from '../shared/auction.types';

export type ConfirmAuctionDialogData = {
  zones: ExternalZone[];
  config: AuctionConfig;
  /** Saved global rules from Admin → Configuration (read-only in this dialog). */
  globalRules?: AuctionGlobalConfig;
};

@Component({
  selector: 'app-confirm-auction-dialog',
  standalone: false,
  templateUrl: './confirm-auction-dialog.component.html',
  styleUrl: './confirm-auction-dialog.component.scss',
})
export class ConfirmAuctionDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmAuctionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmAuctionDialogData
  ) {}

  formatZoneBasePrice(z: ExternalZone): string {
    const n = z.amountCharge;
    if (n == null || n <= 0) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  }

  get formattedMinIncrement(): string {
    return `₹${this.data.config.minIncrement.toLocaleString('en-IN')}`;
  }

  get globalReminderLine(): string {
    const g = this.data.globalRules;
    if (!g) return '';
    const m = g.reminderBeforeCloseMinutes;
    return `Reminder to bidders ${m} minute${m !== 1 ? 's' : ''} before close.`;
  }

  get globalAutoExtendLine(): string {
    const g = this.data.globalRules;
    if (!g) return '';
    if (!g.autoExtendEnabled) {
      return 'Auto-extend when bids arrive near close: Off.';
    }
    const ext = g.autoExtendMinutes;
    const within = g.autoExtendOnBidWithin;
    const max = g.maxExtensions;
    return `Auto-extend: +${ext} min when a bid lands within ${within} min of close (max ${max} extension${max !== 1 ? 's' : ''}).`;
  }

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
