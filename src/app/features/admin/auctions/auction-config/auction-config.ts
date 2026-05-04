import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of, TimeoutError } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuctionGlobalSettingsService } from '../../../../core/services/auction-global-settings.service';
import { ApiBaseService } from '../../../../core/services/api-base.service';
import { AuctionGlobalConfig } from '../shared/auction.types';

const LOAD_TIMEOUT_MS = 20000;

@Component({
  selector: 'app-auction-config',
  standalone: false,
  templateUrl: './auction-config.html',
  styleUrl: './auction-config.scss',
})
export class AuctionConfigComponent implements OnInit, OnDestroy {
  config: AuctionGlobalConfig = {
    defaultDurationMinutes: 10080,
    minIncrementDefault: 25000,
    autoExtendEnabled: true,
    autoExtendMinutes: 15,
    autoExtendOnBidWithin: 10,
    maxExtensions: 3,
    reminderBeforeCloseMinutes: 30,
  };

  isSaving = false;
  isLoading = true;
  loadError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly snackBar: MatSnackBar,
    private readonly auctionSettings: AuctionGlobalSettingsService,
    private readonly apiBase: ApiBaseService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.auctionSettings
      .get()
      .pipe(
        takeUntil(this.destroy$),
        timeout(LOAD_TIMEOUT_MS),
        catchError((err: unknown) => {
          const adminUrl = this.apiBase.getAdminBaseUrl();
          if (err instanceof TimeoutError || (err as { name?: string })?.name === 'TimeoutError') {
            this.loadError = `Loading timed out (${LOAD_TIMEOUT_MS / 1000}s). Confirm the admin API is running and reachable at ${adminUrl}, and that MongoDB is connected on the server. You can still edit defaults below and save when the API is healthy.`;
          } else {
            this.loadError =
              'Could not load settings. Using local defaults — save will create them on the server (requires admin login and working API).';
          }
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe((s) => {
        if (s) {
          this.config = { ...s };
          this.loadError = null;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get defaultDurationLabel(): string {
    const d = Math.floor(this.config.defaultDurationMinutes / 1440);
    const h = Math.floor((this.config.defaultDurationMinutes % 1440) / 60);
    const parts: string[] = [];
    if (d) parts.push(`${d} day${d > 1 ? 's' : ''}`);
    if (h) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
    return parts.join(' ') || '< 1h';
  }

  saveConfig(): void {
    this.isSaving = true;
    this.cdr.detectChanges();
    this.auctionSettings
      .save({ ...this.config })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (saved) => {
          this.config = { ...saved };
          this.snackBar.open('Configuration saved successfully', 'Close', {
            duration: 2500,
            panelClass: 'snack-success',
          });
        },
        error: () => {
          this.snackBar.open('Save failed. Check admin API and login.', 'Close', {
            duration: 4000,
          });
        },
      });
  }

  resetDefaults(): void {
    this.config = {
      defaultDurationMinutes: 10080,
      minIncrementDefault: 25000,
      autoExtendEnabled: true,
      autoExtendMinutes: 15,
      autoExtendOnBidWithin: 10,
      maxExtensions: 3,
      reminderBeforeCloseMinutes: 30,
    };
    this.snackBar.open('Form reset to defaults — click Save to persist.', 'Close', { duration: 2500 });
  }
}
