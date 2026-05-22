import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, asyncScheduler, of } from 'rxjs';
import { catchError, finalize, observeOn, takeUntil, timeout } from 'rxjs/operators';
import { ApiBaseService } from '../../../../core/services/api-base.service';
import { AuctionHistoryRecord } from '../shared/auction.types';

@Component({
  selector: 'app-auction-history',
  standalone: false,
  templateUrl: './auction-history.html',
  styleUrl: './auction-history.scss',
})
export class AuctionHistoryComponent implements OnInit, OnDestroy {
  records: AuctionHistoryRecord[] = [];
  loading = false;
  loadError: string | null = null;

  filterStatus: 'all' | 'won' | 'no_bid' | 'cancelled' = 'all';
  filterState = '';
  filterSearch = '';
  filterFromDate = '';
  filterToDate = '';

  expandedId: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private viewAlive = true;

  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService,
    private readonly snackBar: MatSnackBar,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  /** Defer view mutations + run CD (same pattern as Live Auctions / Zone Setup). */
  private scheduleViewUpdate(fn: () => void): void {
    Promise.resolve().then(() => {
      setTimeout(() => {
        if (!this.viewAlive) return;
        this.ngZone.run(() => {
          fn();
          this.cdr.detectChanges();
        });
      }, 0);
    });
  }

  ngOnInit(): void {
    this.scheduleViewUpdate(() => this.loadHistory());
  }

  ngOnDestroy(): void {
    this.viewAlive = false;
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadHistory(): void {
    this.loading = true;
    this.loadError = null;
    this.cdr.detectChanges();

    const url = `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/auctions/history`;

    this.http
      .get<{ records: AuctionHistoryRecord[] }>(url)
      .pipe(
        timeout(15000),
        takeUntil(this.destroy$),
        observeOn(asyncScheduler),
        catchError((err: HttpErrorResponse) => {
          const msg =
            err.status === 401 || err.status === 403
              ? 'Admin session expired or unauthorized. Please log in again.'
              : err.error?.message || err.message || 'Failed to load auction history.';
          return of({ records: [] as AuctionHistoryRecord[], error: msg });
        }),
        finalize(() => {
          this.scheduleViewUpdate(() => {
            this.loading = false;
          });
        })
      )
      .subscribe((res) => {
        this.scheduleViewUpdate(() => {
          if (!this.viewAlive) return;
          const err = (res as { error?: string })?.error;
          if (err) {
            this.loadError = err;
            this.records = [];
            this.snackBar.open(err, 'Close', { duration: 4000 });
            return;
          }
          if (!res || typeof res !== 'object') return;
          this.records = (res.records ?? []).map((r) => this.normalizeRecord(r));
          this.loadError = null;
        });
      });
  }

  private normalizeRecord(raw: AuctionHistoryRecord): AuctionHistoryRecord {
    return {
      ...raw,
      zoneName: String(raw.zoneName ?? 'Zone').trim() || 'Zone',
      city: String(raw.city ?? '').trim(),
      state: String(raw.state ?? '').trim(),
      winner: String(raw.winner ?? '—').trim() || '—',
      winnerMobile: String(raw.winnerMobile ?? '—').trim() || '—',
      finalBid: Math.max(0, Number(raw.finalBid) || 0),
      basePrice: Math.max(0, Number(raw.basePrice) || 0),
      totalBids: Math.max(0, Number(raw.totalBids) || 0),
      totalBidders: Math.max(0, Number(raw.totalBidders) || 0),
      durationMinutes: Math.max(0, Number(raw.durationMinutes) || 0),
      startedAt: raw.startedAt ? String(raw.startedAt) : '',
      closedAt: raw.closedAt ? String(raw.closedAt) : '',
      status:
        raw.status === 'won' || raw.status === 'no_bid' || raw.status === 'cancelled'
          ? raw.status
          : 'no_bid',
    };
  }

  /** States from full dataset (filter dropdown). */
  get uniqueStates(): string[] {
    return [...new Set(this.records.map((r) => r.state).filter((s) => s.length > 0))].sort();
  }

  get filteredRecords(): AuctionHistoryRecord[] {
    const q = this.filterSearch.trim().toLowerCase();
    const fromMs = this.filterFromDate
      ? new Date(`${this.filterFromDate}T00:00:00`).getTime()
      : null;
    const toMs = this.filterToDate
      ? new Date(`${this.filterToDate}T23:59:59.999`).getTime()
      : null;

    return this.records.filter((r) => {
      if (this.filterStatus !== 'all' && r.status !== this.filterStatus) return false;
      if (this.filterState && r.state !== this.filterState) return false;

      if (q) {
        const hay = `${r.zoneName} ${r.city} ${r.state} ${r.winner} ${r.winnerMobile} ${r.zoneId}`
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (fromMs != null || toMs != null) {
        const closedMs = r.closedAt ? new Date(r.closedAt).getTime() : NaN;
        if (!Number.isFinite(closedMs)) return false;
        if (fromMs != null && closedMs < fromMs) return false;
        if (toMs != null && closedMs > toMs) return false;
      }

      return true;
    });
  }

  get wonCount(): number {
    return this.filteredRecords.filter((r) => r.status === 'won').length;
  }

  get noBidCount(): number {
    return this.filteredRecords.filter((r) => r.status === 'no_bid').length;
  }

  get cancelledCount(): number {
    return this.filteredRecords.filter((r) => r.status === 'cancelled').length;
  }

  get totalRevenue(): number {
    return this.filteredRecords
      .filter((r) => r.status === 'won')
      .reduce((s, r) => s + r.finalBid, 0);
  }

  resetFilters(): void {
    this.filterStatus = 'all';
    this.filterState = '';
    this.filterSearch = '';
    this.filterFromDate = '';
    this.filterToDate = '';
  }

  toggleExpand(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
  }

  fmtCurrency(n: number): string {
    return n === 0 ? '—' : `₹${n.toLocaleString('en-IN')}`;
  }

  fmtDuration(mins: number): string {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    return parts.join(' ') || '< 1h';
  }

  statusLabel(s: AuctionHistoryRecord['status']): string {
    if (s === 'won') return 'Won';
    if (s === 'no_bid') return 'No Bid';
    return 'Cancelled';
  }

  trackByRecord(_: number, r: AuctionHistoryRecord): string {
    return r.id;
  }
}
