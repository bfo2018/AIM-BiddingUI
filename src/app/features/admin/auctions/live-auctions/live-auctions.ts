import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of, asyncScheduler } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { observeOn } from 'rxjs/operators';
import { ApiBaseService } from '../../../../core/services/api-base.service';
import { BiddingRealtimeService } from '../../../../core/services/bidding-realtime.service';
import { LiveAuction } from '../shared/auction.types';

type BidUpdatedPayload = {
  externalZoneId: string;
  currentHighestBid: number;
  bidderName?: string;
  lastBidAt: number;
  bidsDelta?: number;
  biddersCount?: number;
};

@Component({
  selector: 'app-live-auctions',
  standalone: false,
  templateUrl: './live-auctions.html',
  styleUrl: './live-auctions.scss',
})
export class LiveAuctionsComponent implements OnInit, OnDestroy {
  auctions: LiveAuction[] = [];
  flashIds = new Set<string>();
  actionLoading: Record<string, boolean> = {};

  activeCount = 0;
  closingSoonCount = 0;
  totalBidsAcross = 0;
  highestBid = 0;
  nowMs = Date.now();
  liveConnected = false;

  private readonly destroy$ = new Subject<void>();
  private viewAlive = true;
  private tickTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private listenerRetryTimer?: ReturnType<typeof setTimeout>;
  private loadInFlight = false;
  private pendingReload = false;
  private readonly launchSignalKey = 'admin_auctions_launch_signal_v1';
  private readonly fallbackPollMs = 60000;

  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService,
    private readonly realtime: BiddingRealtimeService,
    private readonly ngZone: NgZone,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private scheduleViewUpdate(fn: () => void): void {
    Promise.resolve().then(() => {
      setTimeout(() => {
        if (!this.viewAlive) return;
        this.ngZone.run(fn);
        this.cdr.detectChanges();
      }, 0);
    });
  }

  ngOnInit(): void {
    this.realtime.connected$
      .pipe(
        takeUntil(this.destroy$),
        // BehaviorSubject emits synchronously on subscribe; defer to next task
        // so we never mutate template state in the same initial check cycle.
        observeOn(asyncScheduler),
      )
      .subscribe((connected) => {
        if (!this.viewAlive) return;
        this.scheduleViewUpdate(() => {
          this.liveConnected = connected;
          if (connected) {
            this.setupRealtime();
            this.triggerReload(true);
          }
        });
      });

    this.setupRealtime();
    this.scheduleViewUpdate(() => this.triggerReload(true));

    window.addEventListener('storage', this.onStorageEvent);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.tickTimer = setInterval(() => {
      this.nowMs = Date.now();
    }, 1000);

    // Phase 2: event-driven first. Poll only as a lightweight fallback when
    // socket is offline for a prolonged period.
    this.pollTimer = setInterval(() => {
      if (!this.liveConnected) {
        this.triggerReload(true);
      }
    }, this.fallbackPollMs);
  }

  ngOnDestroy(): void {
    this.viewAlive = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.listenerRetryTimer) clearTimeout(this.listenerRetryTimer);
    window.removeEventListener('storage', this.onStorageEvent);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const sock = this.realtime.getClient();
    if (sock) {
      sock.off('bid-updated');
      sock.off('zone-catalog-update');
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  private triggerReload(silent = true): void {
    if (this.loadInFlight) {
      this.pendingReload = true;
      return;
    }
    this.loadLiveAuctions(silent);
  }

  private loadLiveAuctions(silent = false): void {
    if (this.loadInFlight) return;
    this.loadInFlight = true;
    const url = `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/auctions/live`;

    this.http
      .get<{ auctions: LiveAuction[] }>(url, { observe: 'response' })
      .pipe(
        takeUntil(this.destroy$),
        timeout(8000),
        catchError((err: HttpErrorResponse | Error) => {
          const status = (err as HttpErrorResponse)?.status;
          if (status === 401 || status === 403) {
            this.scheduleViewUpdate(() => {
              this.snackBar.open(
                'Admin session expired or unauthorized. Please login again.',
                'Close',
                { duration: 3500 }
              );
            });
          }
          return of(null);
        }),
        finalize(() => {
          this.loadInFlight = false;
          if (this.pendingReload && this.viewAlive) {
            this.pendingReload = false;
            this.loadLiveAuctions(true);
          }
        })
      )
      .subscribe((res) => {
        this.scheduleViewUpdate(() => {
          const httpRes = res as HttpResponse<{ auctions: LiveAuction[] }> | null;
          if (!this.viewAlive) return;
          if (!httpRes?.body) {
            // First-load resilience: keep retrying until backend/auth/socket
            // startup settles after hard refresh.
            if (!this.loadInFlight) {
              setTimeout(() => {
                if (!this.viewAlive) return;
                this.triggerReload(true);
              }, 1200);
            }
            return;
          }

          const rows = Array.isArray(httpRes.body.auctions) ? httpRes.body.auctions : [];
          const prev = new Map(this.auctions.map((a) => [a.zoneId, a]));
          this.auctions = rows.map((r) => ({
            ...r,
            status: this.normalizeStatus(r.status),
            topBidder: r.topBidder || prev.get(r.zoneId)?.topBidder || '—',
          }));
          this.recomputeStats();
          if (this.auctions.length) this.joinAllZones();

          if (!silent) {
            this.snackBar.open('Live auctions synchronized.', 'Close', { duration: 1200 });
          }
        });
      });
  }

  private setupRealtime(): void {
    const sock = this.realtime.getClient();
    if (!sock) {
      console.debug('[live-auctions] socket unavailable, retry listener attach');
      this.scheduleListenerAttachRetry();
      return;
    }
    if (this.listenerRetryTimer) {
      clearTimeout(this.listenerRetryTimer);
      this.listenerRetryTimer = undefined;
    }
    this.scheduleViewUpdate(() => {
      this.liveConnected = !!sock.connected;
    });
    console.debug('[live-auctions] attaching socket listeners', { connected: sock.connected, id: sock.id });

    sock.off('bid-updated');
    sock.on('bid-updated', (raw: unknown) => {
      this.scheduleViewUpdate(() => {
        const p = this.normalizeBidUpdatedPayload(raw);
        if (p) this.handleBidUpdated(p);
      });
    });

    sock.off('zone-catalog-update');
    sock.on('zone-catalog-update', () => {
      if (!this.viewAlive) return;
      this.triggerReload(true);
    });
  }

  private scheduleListenerAttachRetry(): void {
    if (this.listenerRetryTimer || !this.viewAlive) return;
    this.listenerRetryTimer = setTimeout(() => {
      this.listenerRetryTimer = undefined;
      if (!this.viewAlive) return;
      this.setupRealtime();
    }, 500);
  }

  private readonly onStorageEvent = (event: StorageEvent): void => {
    if (!this.viewAlive) return;
    if (event.key !== this.launchSignalKey) return;
    this.triggerReload(true);
  };

  private readonly onVisibilityChange = (): void => {
    if (!this.viewAlive) return;
    if (document.visibilityState === 'visible') {
      this.triggerReload(true);
    }
  };

  private joinAllZones(): void {
    const sock = this.realtime.getClient();
    if (!sock) return;
    for (const a of this.auctions) {
      if (a.status === 'closed') continue;
      sock.emit('join-zone', {
        externalZoneId: a.zoneId,
        name: a.zoneName,
        city: a.city,
        state: a.state,
        basePrice: a.basePrice,
      });
    }
  }

  private normalizeBidUpdatedPayload(raw: unknown): BidUpdatedPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const externalZoneId = String(o['externalZoneId'] ?? o['external_zone_id'] ?? '').trim();
    const currentHighestBid = Math.round(Number(o['currentHighestBid'] ?? o['current_highest_bid']));
    const lastBidAt = Number(o['lastBidAt'] ?? o['last_bid_at']);
    if (!externalZoneId || !Number.isFinite(currentHighestBid) || !Number.isFinite(lastBidAt)) return null;
    return {
      externalZoneId,
      currentHighestBid,
      bidderName: typeof o['bidderName'] === 'string' ? o['bidderName'] : undefined,
      lastBidAt,
      bidsDelta: typeof o['bidsDelta'] === 'number' ? o['bidsDelta'] : undefined,
      biddersCount: typeof o['biddersCount'] === 'number' ? o['biddersCount'] : undefined,
    };
  }

  private handleBidUpdated(p: BidUpdatedPayload): void {
    const idx = this.auctions.findIndex((a) => a.zoneId === p.externalZoneId);
    if (idx < 0) return;
    const prev = this.auctions[idx];
    const next: LiveAuction = {
      ...prev,
      currentBid: p.currentHighestBid,
      totalBids: prev.totalBids + (p.bidsDelta ?? 1),
      totalBidders: p.biddersCount ?? prev.totalBidders,
      topBidder: p.bidderName || prev.topBidder,
      recentBidAt: new Date(p.lastBidAt).toISOString(),
    };
    this.auctions = [...this.auctions.slice(0, idx), next, ...this.auctions.slice(idx + 1)];
    this.recomputeStats();
    this.flashIds.add(next.id);
    setTimeout(() => this.flashIds.delete(next.id), 1200);
  }

  private normalizeStatus(status: string): LiveAuction['status'] {
    const s = String(status || '').toLowerCase();
    if (s === 'scheduled') return 'scheduled';
    if (s === 'paused') return 'paused';
    if (s === 'closed' || s === 'cancelled') return 'closed';
    if (s === 'closing_soon') return 'closing_soon';
    if (s === 'extended') return 'extended';
    if (s === 'live' || s === 'active') return 'active';
    return 'active';
  }

  timeLeft(endsAt: string): string {
    const ms = new Date(endsAt).getTime() - this.nowMs;
    if (ms <= 0) return 'Ended';
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
  }

  bidGrowth(auction: LiveAuction): string {
    const pct = ((auction.currentBid - auction.basePrice) / auction.basePrice) * 100;
    return `+${pct.toFixed(1)}%`;
  }

  pauseAuction(auction: LiveAuction): void { this.applyAction(auction, 'pause'); }
  resumeAuction(auction: LiveAuction): void { this.applyAction(auction, 'resume'); }
  extendAuction(auction: LiveAuction): void { this.applyAction(auction, 'extend'); }
  forceClose(auction: LiveAuction): void { this.applyAction(auction, 'close'); }

  private applyAction(auction: LiveAuction, action: 'pause' | 'resume' | 'close' | 'extend'): void {
    const id = auction.zoneId;
    if (this.actionLoading[id]) return;
    this.actionLoading = { ...this.actionLoading, [id]: true };
    const url = `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/auctions/${encodeURIComponent(id)}/action`;
    const body = action === 'extend' ? { action, minutes: 15 } : { action };

    this.http
      .post<{ ok?: boolean; message?: string }>(url, body)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) =>
          of({
            ok: false,
            message: err?.error?.message || err?.message || 'Action failed.',
          })
        )
      )
      .subscribe((res) => {
        this.scheduleViewUpdate(() => {
          const nextLoading = { ...this.actionLoading };
          delete nextLoading[id];
          this.actionLoading = nextLoading;
          if (!res?.ok) {
            this.snackBar.open(String(res?.message || 'Action failed.'), 'Close', { duration: 3000 });
            return;
          }
          this.snackBar.open(`${auction.zoneName}: ${action} success`, 'Close', { duration: 2000 });
          this.triggerReload(true);
        });
      });
  }

  fmtCurrency(n: number): string {
    return `₹${n.toLocaleString('en-IN')}`;
  }

  trackByAuction(_: number, a: LiveAuction): string { return a.id; }

  private recomputeStats(): void {
    this.activeCount = this.auctions.filter(
      (a) => a.status === 'active' || a.status === 'closing_soon' || a.status === 'extended'
    ).length;
    this.closingSoonCount = this.auctions.filter((a) => a.status === 'closing_soon').length;
    this.totalBidsAcross = this.auctions.reduce((s, a) => s + a.totalBids, 0);
    this.highestBid = this.auctions.length ? Math.max(...this.auctions.map((a) => a.currentBid)) : 0;
  }
}
