import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type UserRecord = {
  id: string;
  name: string;
  mobile: string;
  city: string;
  state: string;
  applicationStatus: 'not_started' | 'in_progress' | 'completed';
  paymentStatus: 'pending' | 'paid';
  eligibility: 'eligible' | 'not_eligible';
  totalBids: number;
  lastActivityLabel: string;
  joinedAt: string;
  registrationFee: number;
  lastPaymentAt?: string | null;
  zones: string[];
  createdAt?: string;
  updatedAt?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
};

export type UserBidEvent = {
  zone: string;
  amount: number;
  timeLabel: string;
};

export type UserDetailDialogData = {
  user: UserRecord;
  bidHistory: UserBidEvent[];
};

@Component({
  selector: 'app-user-details-dialog',
  standalone: false,
  templateUrl: './user-details-dialog.component.html',
  styleUrl: './user-details-dialog.component.scss',
})
export class UserDetailsDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: UserDetailDialogData,
    private readonly dialogRef: MatDialogRef<UserDetailsDialogComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  get applicationStatusLabel(): string {
    if (this.data.user.applicationStatus === 'completed') return 'Completed';
    if (this.data.user.applicationStatus === 'in_progress') return 'In Progress';
    return 'Not Started';
  }
}
