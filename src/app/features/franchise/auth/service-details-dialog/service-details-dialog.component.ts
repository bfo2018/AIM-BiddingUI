import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HealthcareServiceItem } from '../franchise-login';

@Component({
  selector: 'app-service-details-dialog',
  templateUrl: './service-details-dialog.component.html',
  styleUrls: ['./service-details-dialog.component.scss'],
  standalone: false,
})
export class ServiceDetailsDialogComponent {
  constructor(
    public readonly ref: MatDialogRef<ServiceDetailsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: HealthcareServiceItem
  ) {}

  close(): void {
    this.ref.close();
  }
}

