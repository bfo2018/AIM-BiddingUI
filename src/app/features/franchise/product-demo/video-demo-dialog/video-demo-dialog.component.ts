import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type VideoDemoDialogData = {
  title?: string;
  src: string;
};

@Component({
  selector: 'app-video-demo-dialog',
  standalone: false,
  templateUrl: './video-demo-dialog.component.html',
  styleUrl: './video-demo-dialog.component.scss',
})
export class VideoDemoDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<VideoDemoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VideoDemoDialogData
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}

