import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastrService } from 'ngx-toastr';
import { Subject, of, asyncScheduler } from 'rxjs';
import { catchError, observeOn, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { BiddingRealtimeService } from '../../../core/services/bidding-realtime.service';
import { PlaceBidUiService } from './place-bid-ui.service';
import { PlaceBidZonesService } from './place-bid-zones.service';

/** Sentinel for zone list HTTP failure (avoid sync catchError side-effects + NG0100). */
const ZONES_LIST_HTTP_FAILED = Symbol('zonesListHttpFailed');

/** Normalize API / socket ids: string, number, or `{ $oid }` from JSON. */
function normalizeEntityId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    const oid = (raw as { $oid: unknown }).$oid;
    return oid != null ? String(oid).trim() : '';
  }
  return '';
}

/** Zero-width-only suffix so duplicate suppression stays unique without showing ids in the UI. */
function invisibleDedupeSuffix(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const n = (h % 16) + 1;
  return '\u200b'.repeat(n);
}

type BidUpdatedPayload = {
  externalZoneId: string;
  currentHighestBid: number;
  currentHighestBidderId: string;
  /** Present on server broadcast — use for de-dup + debugging. */
  eventId?: string;
  bidderName?: string;
  lastBidAt: number;
  bidsDelta?: number;
  minBidIncrement?: number;
  /** Distinct users who have bid (from Redis set / snapshot). */
  biddersCount?: number;
};

type ZoneLeaderboardItem = {
  rank: number;
  bidderName: string;
  bidAmount: number;
  bidTime: Date;
};

/** One row per pincode from API `pincodes`; areas from `pincodeDetails` / `pincodeData`. */
type PincodeAreaGroup = {
  pincode: string;
  areas: string[];
  /** Pincode document `_id` (matches Kafka pincode update + catalog). */
  pincodeDocId?: string;
};

type ZoneBidModel = {
  id: string;
  name: string;
  areaNames: string[];
  pincodes: string[];
  pincodeGroups: PincodeAreaGroup[];
  basePrice: number;
  currentBid: number;
  minBidIncrement: number;
  /** From server: registration paid + live auction window */
  canBid: boolean;
  paymentRequired: boolean;
  biddersCount: number;
  bidsCount: number;
  deadline: Date;
  lastBidAt: Date;
  leaderboard: ZoneLeaderboardItem[];
  uiStatus: 'active' | 'closing' | 'urgent' | 'closed' | 'inactive';
  uiStatusLabel: string;
  uiTimeLabel: string;
  uiLastBidAgo: string;
  /** Countdown urgency for premium timer styling (<60s / <20s). */
  uiTimerUrgency: 'calm' | 'warning' | 'critical';
  auctionConfigured: boolean;
  auctionDbStatus: 'not_configured' | 'scheduled' | 'live' | 'closed' | 'cancelled';
  bidStartTime: Date | null;
  bidEndTime: Date | null;
};

type ZoneConfigStatusRow = {
  configured: boolean;
  status: 'not_configured' | 'scheduled' | 'live' | 'closed' | 'cancelled';
  canBid: boolean;
  paymentRequired: boolean;
  bid_start_time: string | null;
  bid_end_time: string | null;
  minBidIncrement: number;
};

type CityBidModel = {
  name: string;
  zones: ZoneBidModel[];
};

type StateBidModel = {
  name: string;
  cities: CityBidModel[];
};

type SelectOption = {
  id: string;
};

@Component({
  selector: 'app-place-bid',
  standalone: false,
  templateUrl: './place-bid.html',
  styleUrl: './place-bid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBidComponent implements OnInit, OnDestroy {
  readonly statesData: StateBidModel[] = this.buildDummyData();
  private readonly defaultCountry = 'IN';
  states: SelectOption[] = [];
  cityOptions: SelectOption[] = [];
  selectedState: string | null = null;
  selectedCity: string | null = null;
  cities: CityBidModel[] = [];
  zones: ZoneBidModel[] = [];
  selectedZone: ZoneBidModel | null = null;
  bidForm: FormGroup;
  bidError: string | null = null;
  successMessage: string | null = null;
  isZoneDetailsOpen = false;
  isPlaceBidOpen = false;
  zonesLoading = false;
  zonesError: string | null = null;
  private nowMs = Date.now();
  private readonly destroy$ = new Subject<void>();
  private zoneLoadSeq = 0;
  recentlyUpdatedZoneId: string | null = null;
  highlightedLeaderboardZoneId: string | null = null;
  /** Visual pulse on current bid value (socket). */
  bidPulseZoneId: string | null = null;
  /** Green flash / glow when bid increases. */
  bidUpFlashZoneId: string | null = null;
  /** Short “You are leading” chip after your bid wins the top. */
  leadingBadgeZoneId: string | null = null;
  bidSubmitting = false;
  registrationPaid = false;
  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;

  /** zoneId → last time user placed a bid on that zone (ms). Used for ordering + highlight while bidding is open. */
  private userBidActivityAt = new Map<string, number>();

  constructor(
    private fb: FormBuilder,
    private placeBidZones: PlaceBidZonesService,
    private http: HttpClient,
    private biddingRealtime: BiddingRealtimeService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly snackBar: MatSnackBar,
    private readonly toastr: ToastrService,
    private readonly placeBidUi: PlaceBidUiService
  ) {
    this.bidForm = this.fb.group({
      bidAmount: [null, [Validators.required, Validators.min(1)]],
    });

    this.states = this.statesData.map((state) => ({ id: state.name }));
  }

  ngOnInit(): void {
    this.nowMs = Date.now();
    this.loadUserBidActivityFromStorage();
    this.refreshZoneUiState();
    this.loadStatesFromApi();
    this.loadRegistrationPayment();
    this.bidForm
      .get('bidAmount')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());
    this.countdownIntervalId = window.setInterval(() => {
      this.ngZone.run(() => {
        this.nowMs = Date.now();
        this.refreshZoneUiState();
        this.cdr.markForCheck();
      });
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownIntervalId != null) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    this.biddingRealtime.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private apiBase(): string {
    return environment.franchiseRegistrationApiUrl.replace(/\/$/, '');
  }

  /**
   * Defer work past Angular dev-mode "after checked" pass (HTTP, Socket.IO, sync `of()` from catchError).
   * Microtask + macrotask avoids grouping with the parent ngModelChange CD turn (NG0100 with ng-select).
   */
  private scheduleViewUpdate(fn: () => void): void {
    Promise.resolve().then(() => {
      setTimeout(() => {
        if (this.destroy$.closed) {
          return;
        }
        this.ngZone.run(() => {
          fn();
          this.cdr.markForCheck();
        });
      }, 0);
    });
  }

  /** After async HTTP / socket work: ensure template refreshes (avoids “stuck until click”). */
  private runInZoneAndDetect(fn: () => void): void {
    this.ngZone.run(() => {
      fn();
      this.cdr.markForCheck();
    });
  }

  private loadRegistrationPayment(): void {
    this.http
      .get<{ payment: { status: string } | null }>(`${this.apiBase()}/api/payment/latest`)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((r) => {
        this.runInZoneAndDetect(() => {
          this.registrationPaid = r?.payment?.status === 'paid';
          this.rejoinAllBiddingZones();
        });
      });
  }

  get hasZoneData(): boolean {
    return !!this.selectedState && !!this.selectedCity;
  }

  /**
   * Zones where the user has bid (and auction still open) sort first, most recent activity first.
   * After deadline, those cards lose highlight and return to normal order.
   */
  get sortedZonesForDisplay(): ZoneBidModel[] {
    const list = [...this.zones];
    if (list.length <= 1) return list;
    const origOrder = new Map(list.map((z, i) => [z.id, i]));
    const prioritizedByMyBids = list.filter(
      (z) => this.isZoneBiddingActive(z) && this.userBidActivityAt.has(z.id)
    );
    prioritizedByMyBids.sort(
      (a, b) =>
        (this.userBidActivityAt.get(b.id) ?? 0) - (this.userBidActivityAt.get(a.id) ?? 0)
    );
    const take = new Set(prioritizedByMyBids.map((z) => z.id));
    const rest = list.filter((z) => !take.has(z.id));
    rest.sort((a, b) => {
      const aStarted = a.auctionConfigured ? 1 : 0;
      const bStarted = b.auctionConfigured ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;
      const aLive = a.auctionDbStatus === 'live' ? 1 : 0;
      const bLive = b.auctionDbStatus === 'live' ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return (origOrder.get(a.id) ?? 0) - (origOrder.get(b.id) ?? 0);
    });
    return [...prioritizedByMyBids, ...rest];
  }

  /** Distinct card style while user has bid and countdown not ended. */
  shouldHighlightUserBidZone(zone: ZoneBidModel): boolean {
    return this.isZoneBiddingActive(zone) && this.userBidActivityAt.has(zone.id);
  }

  private isZoneBiddingActive(zone: ZoneBidModel): boolean {
    return zone.deadline.getTime() > this.nowMs;
  }

  private loadUserBidActivityFromStorage(): void {
    const uid = this.placeBidUi.getFranchiseUserId();
    if (!uid || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(`placeBid_userBidZones_v1_${uid}`);
      if (!raw) return;
      const o = JSON.parse(raw) as Record<string, number>;
      this.userBidActivityAt = new Map(
        Object.entries(o).filter(([, t]) => typeof t === 'number' && Number.isFinite(t))
      );
    } catch {
      /* noop */
    }
  }

  private persistUserBidActivity(): void {
    const uid = this.placeBidUi.getFranchiseUserId();
    if (!uid || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        `placeBid_userBidZones_v1_${uid}`,
        JSON.stringify(Object.fromEntries(this.userBidActivityAt))
      );
    } catch {
      /* noop */
    }
  }

  private recordUserBidOnZone(zoneId: string, atMs?: number): void {
    const t = atMs != null && Number.isFinite(atMs) ? Number(atMs) : Date.now();
    this.userBidActivityAt.set(zoneId, t);
    this.persistUserBidActivity();
    this.cdr.markForCheck();
  }

  private pruneUserBidActivityToLoadedZones(): void {
    const ids = new Set(this.zones.map((z) => z.id));
    let changed = false;
    for (const id of [...this.userBidActivityAt.keys()]) {
      if (!ids.has(id)) {
        this.userBidActivityAt.delete(id);
        changed = true;
      }
    }
    if (changed) this.persistUserBidActivity();
  }

  isBiddingSocketConnected(): boolean {
    return !!this.biddingRealtime.getClient()?.connected;
  }

  canPlaceBidOnZone(zone: ZoneBidModel): boolean {
    return (
      zone.auctionConfigured &&
      this.isBiddingSocketConnected() &&
      zone.canBid &&
      zone.uiStatus !== 'closed' &&
      zone.uiStatus !== 'inactive'
    );
  }

  placeBidBlockedReason(zone: ZoneBidModel): string | null {
    if (!zone.auctionConfigured) {
      return 'Bidding has not been started by admin for this zone yet.';
    }
    if (zone.uiStatus === 'closed') {
      return 'Bidding has closed for this zone.';
    }
    if (zone.uiStatus === 'inactive') {
      return 'Bidding is scheduled but not active in the current time window.';
    }
    if (!this.isBiddingSocketConnected()) {
      return 'Sign in to connect to live bidding.';
    }
    if (!zone.canBid) {
      return zone.paymentRequired ? 'Complete registration fee payment to bid.' : 'Bidding is not open for this zone.';
    }
    return null;
  }

  private rejoinAllBiddingZones(): void {
    if (!this.zones.length) return;
    const sock = this.biddingRealtime.getClient();
    if (!sock?.connected) {
      this.setupBiddingRealtime();
      return;
    }
    for (const z of this.zones) {
      if (!z.auctionConfigured) continue;
      this.joinZoneChannel(z);
    }
  }

  private setupBiddingRealtime(): void {
    const sock = this.biddingRealtime.connect({ role: 'franchise' });
    if (!sock) return;

    /* Catalog updates (Kafka → server → Socket.IO): listen even when zone list is empty (e.g. new zone add). */
    sock.off('zone-catalog-update');
    sock.on('zone-catalog-update', (evt: unknown) => {
      this.scheduleViewUpdate(() => this.onZoneCatalogLiveEvent(evt));
    });

    if (!this.zones.length) return;

    /* Re-bind on every setup so a replaced/reconnected socket never misses events. */
    sock.off('bid-updated');
    sock.on('bid-updated', (payload: unknown) => {
      this.scheduleViewUpdate(() => {
        const normalized = this.normalizeBidUpdatedPayload(payload);
        if (normalized) this.onBidUpdated(normalized);
      });
    });
    for (const z of this.zones) {
      if (!z.auctionConfigured) continue;
      this.joinZoneChannel(z);
    }
  }

  private joinZoneChannel(zone: ZoneBidModel): void {
    const sock = this.biddingRealtime.getClient();
    if (!sock) return;
    sock.emit(
      'join-zone',
      {
        externalZoneId: zone.id,
        name: zone.name,
        city: this.selectedCity,
        state: this.selectedState,
        basePrice: zone.basePrice,
      },
      (res: { ok?: boolean; zone?: Record<string, unknown> }) => {
        this.scheduleViewUpdate(() => {
          if (res?.ok && res.zone) {
            this.applyJoinPayload(zone, res.zone);
            this.nowMs = Date.now();
            this.computeZoneUiState(zone);
          }
        });
      }
    );
  }

  private applyJoinPayload(zone: ZoneBidModel, payload: Record<string, unknown>): void {
    const snap = payload['snapshot'] as Record<string, unknown> | null | undefined;
    if (snap && typeof snap === 'object') {
      const high = snap['current_highest_bid'];
      if (typeof high === 'number') {
        zone.currentBid = high;
      }
      const bc = snap['bids_count'];
      if (typeof bc === 'number') {
        zone.bidsCount = bc;
      }
      const biddersCt = snap['bidders_count'];
      if (typeof biddersCt === 'number') {
        zone.biddersCount = biddersCt;
      }
      const endMs = snap['bid_end_ms'];
      if (typeof endMs === 'number' && endMs > 0) {
        zone.deadline = new Date(endMs);
      }
      const lastAt = snap['last_bid_at'];
      if (typeof lastAt === 'number' && lastAt > 0) {
        zone.lastBidAt = new Date(lastAt);
      }
    }
    const inc = payload['minBidIncrement'];
    if (typeof inc === 'number' && inc > 0) {
      zone.minBidIncrement = inc;
    }
    zone.canBid = !!payload['canBid'];
    zone.paymentRequired = !!payload['paymentRequired'];
  }

  private findZoneByExternalId(externalZoneId: string): ZoneBidModel | undefined {
    const want = normalizeEntityId(externalZoneId);
    return this.zones.find((z) => normalizeEntityId(z.id) === want);
  }

  /**
   * Accept camelCase or snake_case keys and Mongo-style ids so the handler never
   * no-ops on a matching zone (which would skip Toastr + UI updates).
   */
  private normalizeBidUpdatedPayload(raw: unknown): BidUpdatedPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const externalZoneId = normalizeEntityId(o['externalZoneId'] ?? o['external_zone_id']);
    if (!externalZoneId) return null;

    const bidRaw = o['currentHighestBid'] ?? o['current_highest_bid'];
    const currentHighestBid = Math.round(Number(bidRaw));
    if (!Number.isFinite(currentHighestBid)) return null;

    const bidderRaw =
      o['currentHighestBidderId'] ?? o['current_highest_bidder_id'] ?? o['user_id'] ?? o['userId'];
    const currentHighestBidderId = normalizeEntityId(bidderRaw);

    const lastRaw = o['lastBidAt'] ?? o['last_bid_at'];
    const lastBidAt = typeof lastRaw === 'number' && Number.isFinite(lastRaw) ? lastRaw : Number(lastRaw);
    if (!Number.isFinite(lastBidAt)) return null;

    const bidsDelta = o['bidsDelta'];
    const minBidIncrement = o['minBidIncrement'];
    const biddersCount = o['biddersCount'];
    const eventId = o['eventId'] != null ? String(o['eventId']).trim() : undefined;

    return {
      externalZoneId,
      currentHighestBid,
      currentHighestBidderId,
      eventId: eventId || undefined,
      bidderName: typeof o['bidderName'] === 'string' ? o['bidderName'] : undefined,
      lastBidAt,
      bidsDelta: typeof bidsDelta === 'number' ? bidsDelta : undefined,
      minBidIncrement: typeof minBidIncrement === 'number' ? minBidIncrement : undefined,
      biddersCount: typeof biddersCount === 'number' ? biddersCount : undefined,
    };
  }

  private onBidUpdated(p: BidUpdatedPayload): void {
    const zone = this.findZoneByExternalId(p.externalZoneId);
    if (!zone) return;
    const prevBid = zone.currentBid;
    const myId = this.placeBidUi.getFranchiseUserId();
    const bidderId = String(p.currentHighestBidderId ?? '').trim();
    /** Only treat as "my" bid when we can resolve a logged-in id and it matches the socket payload. */
    const isMyBid = !!(myId && bidderId && this.placeBidUi.sameUser(bidderId, myId));

    zone.currentBid = p.currentHighestBid;
    zone.bidsCount += p.bidsDelta ?? 1;
    zone.lastBidAt = new Date(p.lastBidAt);
    if (p.minBidIncrement) zone.minBidIncrement = p.minBidIncrement;
    if (typeof p.biddersCount === 'number') {
      zone.biddersCount = p.biddersCount;
    }
    const row: ZoneLeaderboardItem = {
      rank: 1,
      bidderName: p.bidderName || 'Bidder',
      bidAmount: p.currentHighestBid,
      bidTime: new Date(p.lastBidAt),
    };
    zone.leaderboard = [row, ...zone.leaderboard.map((item, index) => ({ ...item, rank: index + 2 }))].slice(0, 20);

    const bidIncreased = p.currentHighestBid > prevBid;
    if (bidIncreased) {
      this.bidPulseZoneId = zone.id;
      this.bidUpFlashZoneId = zone.id;
      window.setTimeout(() => {
        if (this.bidPulseZoneId === zone.id) this.bidPulseZoneId = null;
        if (this.bidUpFlashZoneId === zone.id) this.bidUpFlashZoneId = null;
        this.cdr.markForCheck();
      }, 1000);
    }

    if (isMyBid) {
      this.recordUserBidOnZone(zone.id, p.lastBidAt);
      this.leadingBadgeZoneId = zone.id;
      window.setTimeout(() => {
        if (this.leadingBadgeZoneId === zone.id) this.leadingBadgeZoneId = null;
        this.cdr.markForCheck();
      }, 2000);
    }

    if (bidderId && !isMyBid) {
      const bidderLabel = (p.bidderName ?? '').trim() || 'Another bidder';
      const dedupeSeed = p.eventId ?? `${p.lastBidAt}|${p.currentHighestBid}|${bidderId}`;
      this.toastr.info(
        `New highest bid ${this.formatCurrency(p.currentHighestBid)}${invisibleDedupeSuffix(dedupeSeed)}`,
        `New bid placed by ${bidderLabel}`,
        {
          timeOut: 4000,
          toastClass: 'ngx-toastr place-bid-live-toast',
          titleClass: 'place-bid-live-toast__title',
          messageClass: 'place-bid-live-toast__message',
          tapToDismiss: true,
          onActivateTick: true,
          progressBar: true,
          progressAnimation: 'decreasing',
        }
      );
      this.placeBidUi.playOtherBidTick();
    }

    this.markZoneUpdated(zone.id);
    this.nowMs = Date.now();
    this.computeZoneUiState(zone);
  }

  /** Socket.IO: Kafka-backed catalog (zone add/update/delete, pincode update). Backend ignores pincode add. */
  private onZoneCatalogLiveEvent(evt: unknown): void {
    if (!evt || typeof evt !== 'object') return;
    const e = evt as Record<string, unknown>;
    const entityType = String(e['entityType'] ?? '').toLowerCase();
    const actionType = String(e['actionType'] ?? '').toLowerCase();

    if (entityType === 'zone' && actionType === 'delete') {
      const zoneId = this.zoneIdFromCatalogEvent(e);
      if (!zoneId) return;
      const idx = this.zones.findIndex((z) => normalizeEntityId(z.id) === zoneId);
      if (idx < 0) return;
      const removedId = this.zones[idx].id;
      this.zones = [...this.zones.slice(0, idx), ...this.zones.slice(idx + 1)];
      this.syncSelectedZoneAfterRemoval(removedId);
      this.pruneUserBidActivityToLoadedZones();
      this.nowMs = Date.now();
      this.refreshZoneUiState();
      return;
    }

    const data = e['data'];
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;

    if (entityType === 'zone' && (actionType === 'add' || actionType === 'update')) {
      if (!this.catalogZoneDocMatchesFilters(d)) return;
      const mapped = this.mapApiZoneToBidModel(data);
      if (!mapped) return;
      const idx = this.zones.findIndex((z) => z.id === mapped.id);
      if (idx >= 0) {
        const merged = this.mergeCatalogZoneWithExisting(this.zones[idx], mapped);
        this.zones = [...this.zones.slice(0, idx), merged, ...this.zones.slice(idx + 1)];
        this.syncSelectedZoneIfSame(merged.id);
      } else {
        this.zones = [...this.zones, mapped];
        this.syncSelectedZoneIfSame(mapped.id);
      }
      this.nowMs = Date.now();
      this.refreshZoneUiState();
      this.applyBiddingConfigStatusFromServer();
      return;
    }

    if (entityType === 'pincode' && actionType === 'update') {
      if (!this.catalogPincodeDocMatchesFilters(d)) return;
      let changed = false;
      this.zones = this.zones.map((zone) => {
        const next = this.mergePincodeUpdateIntoZoneIfApplicable(zone, d);
        if (next !== zone) changed = true;
        return next;
      });
      if (changed) {
        if (this.selectedZone) this.syncSelectedZoneIfSame(this.selectedZone.id);
        this.nowMs = Date.now();
        this.refreshZoneUiState();
      }
    }
  }

  private catalogZoneDocMatchesFilters(d: Record<string, unknown>): boolean {
    if (!this.selectedState || !this.selectedCity) return false;
    const st = String(d['state'] ?? '').trim();
    const city = String(d['city'] ?? '').trim();
    return st === this.selectedState && city === this.selectedCity;
  }

  private catalogPincodeDocMatchesFilters(d: Record<string, unknown>): boolean {
    if (!this.selectedState || !this.selectedCity) return false;
    const st = String(d['state'] ?? '').trim();
    const city = String(d['region'] ?? d['city'] ?? '').trim();
    return st === this.selectedState && city === this.selectedCity;
  }

  private mergeCatalogZoneWithExisting(prev: ZoneBidModel, fresh: ZoneBidModel): ZoneBidModel {
    return {
      ...fresh,
      currentBid: prev.currentBid,
      minBidIncrement: prev.minBidIncrement,
      canBid: prev.canBid,
      paymentRequired: prev.paymentRequired,
      biddersCount: prev.biddersCount,
      bidsCount: prev.bidsCount,
      deadline: prev.deadline,
      lastBidAt: prev.lastBidAt,
      leaderboard: prev.leaderboard,
      uiStatus: prev.uiStatus,
      uiStatusLabel: prev.uiStatusLabel,
      uiTimeLabel: prev.uiTimeLabel,
      uiLastBidAgo: prev.uiLastBidAgo,
      uiTimerUrgency: prev.uiTimerUrgency,
    };
  }

  private mergePincodeUpdateIntoZoneIfApplicable(zone: ZoneBidModel, pin: Record<string, unknown>): ZoneBidModel {
    const pinDocId = normalizeEntityId(pin['_id']);
    const pc = String(pin['pincode'] ?? '').trim();
    if (!pinDocId && !pc) return zone;

    let matched = false;
    const newGroups = zone.pincodeGroups.map((g) => {
      const byDoc = !!(pinDocId && g.pincodeDocId && pinDocId === g.pincodeDocId);
      const byPin = !!(pc && g.pincode === pc);
      if (!byDoc && !byPin) return g;
      matched = true;
      const area = String(pin['area'] ?? '').trim();
      const nextPin = pc || g.pincode;
      /** Kafka pincode `area` is the current value for this row — replace, do not append to prior names. */
      const areas = area ? [area] : [...g.areas];
      return {
        pincode: nextPin,
        areas,
        pincodeDocId: pinDocId || g.pincodeDocId,
      };
    });
    if (!matched) return zone;
    return {
      ...zone,
      pincodeGroups: newGroups,
      pincodes: newGroups.map((g) => g.pincode),
      areaNames: Array.from(new Set(newGroups.flatMap((gr) => gr.areas))),
    };
  }

  private syncSelectedZoneIfSame(zoneId: string): void {
    if (!this.selectedZone || this.selectedZone.id !== zoneId) return;
    const z = this.zones.find((x) => x.id === zoneId);
    if (z) this.selectedZone = z;
  }

  /** Kafka catalog payloads may put the id on `entityId` and/or `data._id`. */
  private zoneIdFromCatalogEvent(e: Record<string, unknown>): string {
    const top = normalizeEntityId(e['entityId']);
    if (top) return top;
    const raw = e['data'];
    if (raw && typeof raw === 'object') {
      const d = raw as Record<string, unknown>;
      return normalizeEntityId(d['_id'] ?? d['id']);
    }
    return '';
  }

  private syncSelectedZoneAfterRemoval(removedId: string): void {
    if (!this.selectedZone || this.selectedZone.id !== removedId) return;
    this.selectedZone = null;
    this.isZoneDetailsOpen = false;
    this.isPlaceBidOpen = false;
    this.setBodyScrollLock(false);
  }

  private loadBidHistory(zone: ZoneBidModel): void {
    this.http
      .get<{
        bids: { bidderName: string; bid_amount: number; timestamp: string; user_id?: unknown }[];
      }>(`${this.apiBase()}/api/bidding/history/${zone.id}`)
      .pipe(takeUntil(this.destroy$), observeOn(asyncScheduler))
      .subscribe({
        next: (r) => {
          this.runInZoneAndDetect(() => {
            const bids = r.bids || [];
            const list = [...bids].sort((a, b) => b.bid_amount - a.bid_amount);
            zone.leaderboard = list.map((b, i) => ({
              rank: i + 1,
              bidderName: b.bidderName,
              bidAmount: b.bid_amount,
              bidTime: new Date(b.timestamp),
            }));
            const uid = (b: (typeof bids)[0]) => (b?.user_id != null ? String(b.user_id) : '');
            const uniqueBidders = new Set(bids.map(uid).filter((s) => s.length > 0));
            if (uniqueBidders.size > 0) {
              zone.biddersCount = Math.max(zone.biddersCount, uniqueBidders.size);
            }
          });
        },
        error: () => {},
      });
  }

  onStateModelChange(stateName: string | null): void {
    this.selectedState = stateName;
    this.selectedCity = null;
    this.cityOptions = [];
    this.cities = [];
    this.zones = [];
    this.zonesError = null;
    this.zonesLoading = false;

    if (stateName) {
      /** Defer fetch so ng-select's CD turn finishes before `items` updates (NG0100). */
      this.scheduleViewUpdate(() => this.loadCitiesFromApi(stateName));
    }
  }

  onCityModelChange(cityName: string | null): void {
    this.selectedCity = cityName;
    if (!cityName) {
      this.zones = [];
      this.zonesError = null;
      this.zonesLoading = false;
      return;
    }

    const stateName = this.selectedState;
    if (!stateName) {
      this.zones = [];
      return;
    }

    this.zonesError = null;
    this.zones = [];
    this.zonesLoading = true;
    this.scheduleViewUpdate(() => this.loadZonesFromApi(stateName, cityName));
  }

  clearFilters(): void {
    this.selectedState = null;
    this.selectedCity = null;
    this.cityOptions = [];
    this.cities = [];
    this.zones = [];
    this.zonesError = null;
    this.zonesLoading = false;
    this.successMessage = null;
  }

  private loadStatesFromApi(): void {
    this.placeBidZones
      .getStateList(this.defaultCountry)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.runInZoneAndDetect(() => {
          const apiStates = this.extractSelectOptions(res, ['state', 'name', 'id', 'value', 'title']);
          if (apiStates.length) {
            this.states = apiStates;
            return;
          }
          this.states = this.statesData.map((state) => ({ id: state.name }));
        });
      });
  }

  private loadCitiesFromApi(state: string): void {
    this.placeBidZones
      .getCities(this.defaultCountry, state)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.runInZoneAndDetect(() => {
          const apiCities = this.extractSelectOptions(res, ['city', 'district', 'name', 'id', 'value', 'title']);
          if (apiCities.length) {
            this.cityOptions = apiCities;
            return;
          }
          const fallbackState = this.statesData.find((item) => item.name === state);
          this.cities = fallbackState?.cities ?? [];
          this.cityOptions = this.cities.map((city) => ({ id: city.name }));
        });
      });
  }

  private extractSelectOptions(res: unknown, candidateKeys: string[]): SelectOption[] {
    const values = this.extractPrimitiveItems(this.extractList(res), candidateKeys);
    const uniq = Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
    return uniq.map((id) => ({ id }));
  }

  private extractList(res: unknown): unknown[] {
    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object') {
      const o = res as Record<string, unknown>;
      for (const key of ['data', 'result', 'list', 'records', 'states', 'cities']) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
      }
    }
    return [];
  }

  private extractPrimitiveItems(list: unknown[], candidateKeys: string[]): string[] {
    const out: string[] = [];
    for (const item of list) {
      if (typeof item === 'string' || typeof item === 'number') {
        out.push(String(item));
        continue;
      }
      if (!item || typeof item !== 'object') {
        continue;
      }
      const obj = item as Record<string, unknown>;
      for (const key of candidateKeys) {
        const v = obj[key];
        if (typeof v === 'string' || typeof v === 'number') {
          out.push(String(v));
          break;
        }
      }
    }
    return out;
  }

  private loadZonesFromApi(state: string, city: string): void {
    const seq = ++this.zoneLoadSeq;
    this.zonesLoading = true;
    this.zonesError = null;
    this.zones = [];

    this.placeBidZones
      .getZonesList({ state, city })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(ZONES_LIST_HTTP_FAILED)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.runInZoneAndDetect(() => {
          if (seq !== this.zoneLoadSeq) {
            return;
          }
          this.zonesLoading = false;

          if (res === ZONES_LIST_HTTP_FAILED) {
            this.zonesError = 'Unable to load zones. Please try again.';
            this.zones = [];
            return;
          }

          if (this.isZonesResponseFailure(res)) {
            this.zonesError = this.readZonesErrorMessage(res);
            this.zones = [];
            return;
          }

          const arr = this.extractZonesArray(res);
          this.zones = arr
            .map((item) => this.mapApiZoneToBidModel(item))
            .filter((z): z is ZoneBidModel => z !== null);
          this.applyBiddingConfigStatusFromServer();
          this.pruneUserBidActivityToLoadedZones();
          this.nowMs = Date.now();
          this.refreshZoneUiState();
        });
      });
  }

  private applyBiddingConfigStatusFromServer(): void {
    const ids = this.zones.map((z) => z.id).filter(Boolean);
    if (!ids.length) {
      this.setupBiddingRealtime();
      return;
    }
    const params = new HttpParams().set('ids', ids.join(','));
    this.http
      .get<{ statuses: Record<string, ZoneConfigStatusRow> }>(
        `${this.apiBase()}/api/bidding/zones/status`,
        { params }
      )
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.runInZoneAndDetect(() => {
          const statuses = res?.statuses ?? {};
          this.zones = this.zones.map((z) =>
            this.mergeZoneWithConfigStatus(z, statuses[z.id] ?? null)
          );
          this.nowMs = Date.now();
          this.refreshZoneUiState();
          this.setupBiddingRealtime();
        });
      });
  }

  private mergeZoneWithConfigStatus(zone: ZoneBidModel, row: ZoneConfigStatusRow | null): ZoneBidModel {
    if (!row || !row.configured) {
      return {
        ...zone,
        auctionConfigured: false,
        auctionDbStatus: 'not_configured',
        canBid: false,
        paymentRequired: false,
        uiStatus: 'inactive',
        uiStatusLabel: 'Not Started',
        uiTimeLabel: '--:--:--',
        bidStartTime: null,
        bidEndTime: null,
      };
    }
    const bidStartTime = row.bid_start_time ? new Date(row.bid_start_time) : null;
    const bidEndTime = row.bid_end_time ? new Date(row.bid_end_time) : null;
    const minBidIncrement =
      Number(row.minBidIncrement) > 0 ? Math.round(Number(row.minBidIncrement)) : zone.minBidIncrement;
    return {
      ...zone,
      auctionConfigured: true,
      auctionDbStatus: row.status,
      canBid: !!row.canBid,
      paymentRequired: !!row.paymentRequired,
      minBidIncrement,
      bidStartTime,
      bidEndTime,
      deadline: bidEndTime ?? zone.deadline,
    };
  }

  private isZonesResponseFailure(res: unknown): boolean {
    if (!res || typeof res !== 'object') return false;
    const status = (res as Record<string, unknown>)['status'];
    return status === false || status === 'false';
  }

  private readZonesErrorMessage(res: unknown): string {
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      if (typeof m === 'string' && m.trim()) return m;
    }
    return 'Unable to load zones. Please try again.';
  }

  /**
   * Maps `admin/getzonesList` zone document to UI model.
   * Zone id = `_id`, name = `name`, base price = `amount_charge`.
   * Areas: prefer `pincodeDetails` + `pincodesRef` (pincode `_id` per row); else `pincodeData`.
   */
  private mapApiZoneToBidModel(raw: unknown): ZoneBidModel | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const id = normalizeEntityId(o['_id']);
    if (!id) return null;

    const name = String(o['name'] ?? 'Zone').trim() || 'Zone';
    const basePrice = Math.max(0, Math.round(Number(o['amount_charge']) || 0));

    const pincodesRaw = o['pincodes'];
    const pincodes: string[] = Array.isArray(pincodesRaw)
      ? pincodesRaw.map((p) => String(p).trim()).filter((s) => s.length > 0)
      : [];

    const pincodeDataRaw = o['pincodeData'];
    const pincodeData: Record<string, unknown>[] = Array.isArray(pincodeDataRaw)
      ? pincodeDataRaw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];

    const pincodeDetailsRaw = o['pincodeDetails'];
    const pincodeDetails: Record<string, unknown>[] = Array.isArray(pincodeDetailsRaw)
      ? pincodeDetailsRaw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];

    const pincodesRefRaw = o['pincodesRef'];
    const pincodesRef: string[] = Array.isArray(pincodesRefRaw)
      ? pincodesRefRaw.map((r) => normalizeEntityId(r)).filter((s) => s.length > 0)
      : [];

    let pincodeGroups: PincodeAreaGroup[];
    if (pincodeDetails.length > 0) {
      pincodeGroups =
        pincodes.length > 0
          ? this.buildPincodeAreaGroupsFromDetails(pincodes, pincodesRef, pincodeDetails)
          : this.buildPincodeAreaGroupsFromDetailsOnly(pincodeDetails);
    } else {
      pincodeGroups = this.buildPincodeAreaGroups(pincodes, pincodeData);
    }
    const areaNames = Array.from(new Set(pincodeGroups.flatMap((g) => g.areas)));
    const pincodesOut = pincodeGroups.map((g) => g.pincode).filter((s) => s.length > 0);

    const now = Date.now();
    return {
      id,
      name,
      pincodes: pincodesOut.length ? pincodesOut : pincodes,
      areaNames,
      pincodeGroups,
      basePrice,
      currentBid: basePrice,
      minBidIncrement: 1000,
      canBid: false,
      paymentRequired: false,
      biddersCount: 0,
      bidsCount: 0,
      deadline: new Date(now),
      lastBidAt: new Date(now),
      uiStatus: 'inactive',
      uiStatusLabel: 'Not Started',
      uiTimeLabel: '--:--:--',
      uiLastBidAgo: '—',
      uiTimerUrgency: 'calm',
      leaderboard: [],
      auctionConfigured: false,
      auctionDbStatus: 'not_configured',
      bidStartTime: null,
      bidEndTime: null,
    };
  }

  private buildPincodeAreaGroups(
    pincodes: string[],
    pincodeData: Record<string, unknown>[]
  ): PincodeAreaGroup[] {
    return pincodes.map((pc) => {
      const normalized = String(pc).trim();
      const areas = new Set<string>();
      let docId = '';
      for (const row of pincodeData) {
        const rowPc = String(row['pincode'] ?? '').trim();
        if (rowPc !== normalized) continue;
        const area = String(row['area'] ?? '').trim();
        if (area) areas.add(area);
        const id = normalizeEntityId(row['_id']);
        if (id) docId = id;
      }
      return {
        pincode: normalized,
        areas: Array.from(areas),
        pincodeDocId: docId || undefined,
      };
    });
  }

  /**
   * Prefer `pincodeDetails` + `pincodesRef` (aligns pincode row `_id` with zone `pincodes` order).
   */
  private buildPincodeAreaGroupsFromDetails(
    pincodes: string[],
    pincodesRef: string[],
    pincodeDetails: Record<string, unknown>[]
  ): PincodeAreaGroup[] {
    const byId = new Map<string, Record<string, unknown>>();
    const byPin = new Map<string, Record<string, unknown>>();
    for (const row of pincodeDetails) {
      const id = normalizeEntityId(row['_id']);
      const pc = String(row['pincode'] ?? '').trim();
      if (id) byId.set(id, row);
      if (pc) byPin.set(pc, row);
    }

    return pincodes.map((pcRaw, i) => {
      const normalized = String(pcRaw).trim();
      let row: Record<string, unknown> | undefined;
      const refId = pincodesRef[i];
      if (refId) {
        row = byId.get(refId);
      }
      if (!row) {
        row = byPin.get(normalized);
      }
      const areas: string[] = [];
      if (row) {
        const area = String(row['area'] ?? '').trim();
        if (area) areas.push(area);
      }
      const docId = row ? normalizeEntityId(row['_id']) : '';
      return {
        pincode: normalized,
        areas,
        pincodeDocId: docId || undefined,
      };
    });
  }

  /** When the API sends `pincodeDetails` but no `pincodes` array yet. */
  private buildPincodeAreaGroupsFromDetailsOnly(pincodeDetails: Record<string, unknown>[]): PincodeAreaGroup[] {
    return pincodeDetails.map((row) => {
      const pc = String(row['pincode'] ?? '').trim();
      const area = String(row['area'] ?? '').trim();
      const docId = normalizeEntityId(row['_id']);
      return {
        pincode: pc,
        areas: area ? [area] : [],
        pincodeDocId: docId || undefined,
      };
    });
  }

  /**
   * Accepts several common API envelopes until the real response shape is confirmed.
   */
  private extractZonesArray(res: unknown): unknown[] {
    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object') {
      const o = res as Record<string, unknown>;
      for (const key of ['data', 'zones', 'list', 'result', 'records']) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
      }
    }
    return [];
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  openDetails(zone: ZoneBidModel): void {
    this.selectedZone = zone;
    this.isPlaceBidOpen = false;
    this.isZoneDetailsOpen = true;
    this.setBodyScrollLock(true);
    if (zone.auctionConfigured) {
      this.loadBidHistory(zone);
    }
    this.cdr.markForCheck();
  }

  openBid(zone: ZoneBidModel): void {
    if (!this.canPlaceBidOnZone(zone)) return;
    this.selectedZone = zone;
    this.bidError = null;
    this.bidForm.reset({ bidAmount: this.getMinimumNextBid(zone) });
    this.isZoneDetailsOpen = false;
    this.isPlaceBidOpen = true;
    this.setBodyScrollLock(true);
    this.cdr.markForCheck();
  }

  openBidFromDetails(): void {
    if (!this.selectedZone) return;
    this.bidError = null;
    this.bidForm.reset({ bidAmount: this.getMinimumNextBid(this.selectedZone) });
    this.isZoneDetailsOpen = false;
    this.isPlaceBidOpen = true;
    this.setBodyScrollLock(true);
    this.cdr.markForCheck();
  }

  closeZoneDetails(): void {
    this.isZoneDetailsOpen = false;
    this.setBodyScrollLock(this.isPlaceBidOpen);
    this.cdr.markForCheck();
  }

  closePlaceBid(): void {
    this.isPlaceBidOpen = false;
    this.setBodyScrollLock(this.isZoneDetailsOpen);
    this.cdr.markForCheck();
  }

  onModalBackdropClick(): void {
    this.isZoneDetailsOpen = false;
    this.isPlaceBidOpen = false;
    this.setBodyScrollLock(false);
    this.cdr.markForCheck();
  }

  getMinimumNextBid(zone: ZoneBidModel): number {
    const inc = zone.minBidIncrement > 0 ? zone.minBidIncrement : 1000;
    return zone.currentBid + inc;
  }

  submitBid(): void {
    if (!this.selectedZone) return;

    if (this.bidForm.invalid) {
      this.snackBar.open('❌ Enter a valid bid amount.', 'OK', {
        duration: 2800,
        panelClass: ['place-bid-snack', 'place-bid-snack--error'],
      });
      return;
    }

    const inputAmount = Number(this.bidForm.value.bidAmount ?? 0);
    const minNextBid = this.getMinimumNextBid(this.selectedZone);
    if (inputAmount < minNextBid) {
      const msg = `❌ Bid must be higher than current — minimum ${this.formatCurrency(minNextBid)}.`;
      this.bidError = msg;
      this.snackBar.open(msg, 'OK', {
        duration: 3200,
        panelClass: ['place-bid-snack', 'place-bid-snack--error'],
      });
      return;
    }

    const sock = this.biddingRealtime.getClient();
    if (!sock?.connected) {
      const msg = 'Connect to the bidding server to submit (sign in if needed).';
      this.bidError = msg;
      this.snackBar.open(msg, 'OK', {
        duration: 3500,
        panelClass: ['place-bid-snack', 'place-bid-snack--error'],
      });
      return;
    }

    this.bidError = null;
    const zone = this.selectedZone;
    this.bidSubmitting = true;
    this.cdr.markForCheck();
    const startedAt = Date.now();
    let ackHandled = false;
    const ackTimeout = window.setTimeout(() => {
      if (ackHandled) return;
      ackHandled = true;
      this.scheduleViewUpdate(() => {
        this.bidSubmitting = false;
        this.bidError = 'Bid request timed out. Please check connection and try again.';
        this.snackBar.open('❌ Bid request timed out. Please retry.', 'OK', {
          duration: 4200,
          panelClass: ['place-bid-snack', 'place-bid-snack--error'],
        });
      });
    }, 8000);

    sock.emit(
      'place-bid',
      {
        externalZoneId: zone.id,
        amount: inputAmount,
        basePrice: zone.basePrice,
      },
      (res: { ok?: boolean; message?: string }) => {
        if (ackHandled) return;
        ackHandled = true;
        clearTimeout(ackTimeout);
        const elapsed = Date.now() - startedAt;
        const waitMore = Math.max(0, 600 - elapsed);
        window.setTimeout(() => {
          this.scheduleViewUpdate(() => {
            this.bidSubmitting = false;
            if (!res?.ok) {
              const err = res?.message || 'Could not place bid.';
              this.bidError = err;
              this.snackBar.open(`❌ ${err}`, 'OK', {
                duration: 4000,
                panelClass: ['place-bid-snack', 'place-bid-snack--error'],
              });
              return;
            }
            this.snackBar.open(`✅ Your bid ${this.formatCurrency(inputAmount)} placed successfully`, 'OK', {
              duration: 3000,
              panelClass: ['place-bid-snack', 'place-bid-snack--success'],
            });
            this.recordUserBidOnZone(zone.id);
            this.successMessage = `Bid submitted for ${zone.name} at ${this.formatCurrency(inputAmount)}.`;
            this.closePlaceBid();
          });
        }, waitMore);
      }
    );
  }

  /** Live bid input hint in modal (red / green). */
  getBidAmountValidationHint(zone: ZoneBidModel | null): { ok: boolean; text: string } | null {
    if (!zone || !this.isPlaceBidOpen) return null;
    const raw = this.bidForm.get('bidAmount')?.value;
    const inputAmount = Number(raw ?? 0);
    if (raw === null || raw === '' || Number.isNaN(inputAmount) || inputAmount <= 0) {
      return null;
    }
    const minNext = this.getMinimumNextBid(zone);
    if (inputAmount < minNext) {
      return {
        ok: false,
        text: `Below minimum — add ${this.formatCurrency(minNext - inputAmount)} to meet ${this.formatCurrency(minNext)}.`,
      };
    }
    return { ok: true, text: `Ready to bid — meets minimum ${this.formatCurrency(minNext)}.` };
  }

  private buildDummyData(): StateBidModel[] {
    const now = Date.now();
    const zone = (
      id: string,
      name: string,
      areas: string[],
      pincodes: string[],
      basePrice: number,
      currentBid: number,
      bidders: number,
      bids: number,
      minutesLeft: number
    ): ZoneBidModel => ({
      id,
      name,
      areaNames: areas,
      pincodes,
      pincodeGroups: pincodes.map((pincode, idx) => ({
        pincode,
        areas: idx < areas.length && areas[idx] ? [areas[idx]] : [],
      })),
      basePrice,
      currentBid,
      minBidIncrement: 1000,
      canBid: true,
      paymentRequired: false,
      biddersCount: bidders,
      bidsCount: bids,
      deadline: new Date(now + minutesLeft * 60 * 1000),
      lastBidAt: new Date(now - Math.floor(Math.random() * 45000 + 5000)),
      uiStatus: 'active',
      uiStatusLabel: 'Active',
      uiTimeLabel: '00:00:00',
      uiLastBidAgo: '0s ago',
      uiTimerUrgency: 'calm',
      auctionConfigured: true,
      auctionDbStatus: 'live',
      bidStartTime: new Date(now - 30 * 60 * 1000),
      bidEndTime: new Date(now + minutesLeft * 60 * 1000),
      leaderboard: [
        { rank: 1, bidderName: 'Ravi Infra Group', bidAmount: currentBid, bidTime: new Date(now - 900000) },
        {
          rank: 2,
          bidderName: 'Urban Axis Ventures',
          bidAmount: currentBid - 10000,
          bidTime: new Date(now - 1200000),
        },
        {
          rank: 3,
          bidderName: 'BlueBridge Partners',
          bidAmount: currentBid - 15000,
          bidTime: new Date(now - 1800000),
        },
      ],
    });

    return [
      {
        name: 'Maharashtra',
        cities: [
          {
            name: 'Pune',
            zones: [
              zone(
                'MH-PN-01',
                'Pune North Cluster',
                ['Baner', 'Aundh', 'Wakad', 'Pashan', 'Balewadi'],
                ['411045', '411007', '411057', '411021', '411045'],
                250000,
                292000,
                8,
                14,
                72
              ),
              zone(
                'MH-PN-02',
                'Pune East Prime',
                ['Kharadi', 'Viman Nagar', 'Kalyani Nagar', 'Mundhwa'],
                ['411014', '411014', '411006', '411036'],
                220000,
                245000,
                6,
                11,
                28
              ),
            ],
          },
          {
            name: 'Nashik',
            zones: [
              zone(
                'MH-NS-01',
                'Nashik Central',
                ['College Road', 'Gangapur Road', 'Canada Corner'],
                ['422005', '422013', '422002'],
                160000,
                178000,
                4,
                7,
                13
              ),
            ],
          },
        ],
      },
      {
        name: 'Karnataka',
        cities: [
          {
            name: 'Bengaluru',
            zones: [
              zone(
                'KA-BL-01',
                'Bengaluru Tech Belt',
                ['Whitefield', 'Marathahalli', 'Bellandur', 'Sarjapur'],
                ['560066', '560037', '560103', '562125'],
                310000,
                361000,
                10,
                19,
                49
              ),
              zone(
                'KA-BL-02',
                'Bengaluru North Elite',
                ['Hebbal', 'Yelahanka', 'Sahakar Nagar'],
                ['560024', '560064', '560092'],
                275000,
                300000,
                7,
                13,
                9
              ),
            ],
          },
        ],
      },
    ];
  }

  private setBodyScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  getBidLeadFeedback(zone: ZoneBidModel | null): { type: 'leading' | 'warning'; message: string } | null {
    if (!zone) return null;
    const inputAmount = Number(this.bidForm.value.bidAmount ?? 0);
    if (!inputAmount) return null;
    const minNext = this.getMinimumNextBid(zone);
    if (inputAmount >= minNext) {
      return { type: 'leading', message: 'You are leading! Submit now to secure this zone.' };
    }
    return {
      type: 'warning',
      message: `You need ${this.formatCurrency(minNext - inputAmount)} more to lead.`,
    };
  }

  private markZoneUpdated(zoneId: string): void {
    this.recentlyUpdatedZoneId = zoneId;
    this.highlightedLeaderboardZoneId = zoneId;
    setTimeout(() => {
      if (this.recentlyUpdatedZoneId === zoneId) this.recentlyUpdatedZoneId = null;
    }, 1200);
    setTimeout(() => {
      if (this.highlightedLeaderboardZoneId === zoneId) this.highlightedLeaderboardZoneId = null;
    }, 1800);
  }

  private refreshZoneUiState(): void {
    for (const zone of this.zones) {
      this.computeZoneUiState(zone);
    }
  }

  private computeZoneUiState(zone: ZoneBidModel): void {
    if (!zone.auctionConfigured) {
      zone.uiStatus = 'inactive';
      zone.uiStatusLabel = 'Not Started';
      zone.uiTimeLabel = '--:--:--';
      zone.uiTimerUrgency = 'calm';
      zone.uiLastBidAgo = '—';
      return;
    }
    if (zone.auctionDbStatus === 'scheduled') {
      zone.uiStatus = 'inactive';
      zone.uiStatusLabel = 'Scheduled';
      zone.uiTimeLabel = '--:--:--';
      zone.uiTimerUrgency = 'calm';
      zone.uiLastBidAgo = '—';
      return;
    }
    if (zone.auctionDbStatus === 'closed' || zone.auctionDbStatus === 'cancelled') {
      zone.uiStatus = 'closed';
      zone.uiStatusLabel = 'Closed';
      zone.uiTimeLabel = '00:00:00';
      zone.uiTimerUrgency = 'calm';
      zone.uiLastBidAgo = '—';
      return;
    }

    const ms = Math.max(zone.deadline.getTime() - this.nowMs, 0);
    const status: ZoneBidModel['uiStatus'] =
      ms <= 0 ? 'closed' : ms <= 15 * 60 * 1000 ? 'urgent' : ms <= 45 * 60 * 1000 ? 'closing' : 'active';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const diffSec = Math.max(Math.floor((this.nowMs - zone.lastBidAt.getTime()) / 1000), 0);
    const minsAgo = Math.floor(diffSec / 60);
    const hoursAgo = Math.floor(minsAgo / 60);

    zone.uiStatus = status;
    zone.uiStatusLabel =
      status === 'active' ? 'Active' : status === 'closing' ? 'Closing Soon' : status === 'urgent' ? 'Urgent' : 'Closed';
    zone.uiTimeLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
    zone.uiLastBidAgo = diffSec < 60 ? `${diffSec}s ago` : minsAgo < 60 ? `${minsAgo}m ago` : `${hoursAgo}h ago`;

    let urgency: ZoneBidModel['uiTimerUrgency'] = 'calm';
    if (ms > 0) {
      if (totalSeconds < 20) urgency = 'critical';
      else if (totalSeconds < 60) urgency = 'warning';
    }
    zone.uiTimerUrgency = urgency;
  }
}
