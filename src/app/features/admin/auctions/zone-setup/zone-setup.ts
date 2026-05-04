import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of, asyncScheduler } from 'rxjs';
import { catchError, finalize, observeOn, takeUntil } from 'rxjs/operators';
import { AuctionLaunchService } from '../../../../core/services/auction-launch.service';
import { BiddingRealtimeService } from '../../../../core/services/bidding-realtime.service';
import { PlaceBidZonesService } from '../../../franchise/place-bid/place-bid-zones.service';
import {
  AuctionConfig,
  AuctionGlobalConfig,
  ExternalZone,
  ZoneStatus,
} from '../shared/auction.types';
import { AuctionGlobalSettingsService } from '../../../../core/services/auction-global-settings.service';
import { BiddingZoneStatusService } from '../../../../core/services/bidding-zone-status.service';
import { BiddingZoneStatusRow } from '../../../../core/services/bidding-zone-status.service';
import { ApiBaseService } from '../../../../core/services/api-base.service';
import {
  ConfirmAuctionDialogComponent,
  ConfirmAuctionDialogData,
} from '../confirm-auction-dialog/confirm-auction-dialog.component';
import {
  extractZonesArrayFromResponse,
  mapZoneDocumentToExternalZone,
  normalizeEntityId,
} from '../shared/zone-catalog-mapper';

const ZONES_LIST_HTTP_FAILED = Symbol('zonesListHttpFailed');

type SelectOption = { id: string };

type BidUpdatedPayload = {
  externalZoneId: string;
  currentHighestBid: number;
  lastBidAt: number;
  bidderName?: string;
  bidsDelta?: number;
  biddersCount?: number;
};

type AdminZoneBidRow = {
  rank: number;
  bidderName: string;
  bidAmount: number;
  bidTime: string | null;
};

type AdminZoneDetails = {
  bidEndTime?: string | null;
  minBidIncrement: number | null;
  currentHighestBid: number | null;
  currentLeader: string | null;
  bidsCount: number | null;
  biddersCount: number | null;
  lastBidAt: number | null;
  leaderboard: AdminZoneBidRow[];
};

@Component({
  selector: 'app-zone-setup',
  standalone: false,
  templateUrl: './zone-setup.html',
  styleUrl: './zone-setup.scss',
})
export class ZoneSetupComponent implements OnInit, OnDestroy {
  private readonly launchSignalKey = 'admin_auctions_launch_signal_v1';
  private readonly defaultCountry = 'IN';
  private readonly destroy$ = new Subject<void>();
  private zoneLoadSeq = 0;
  private biddingStatusSeq = 0;

  /** Zones returned from API for the selected state + city (socket keeps this fresh). */
  zones: ExternalZone[] = [];

  stateOptions: SelectOption[] = [];
  cityOptions: SelectOption[] = [];
  selectedState = '';
  selectedCity = '';

  /** Client-side only: filters loaded `zones` by name / pincode / area. */
  filterSearch = '';

  selectedIds = new Set<string>();

  auctionConfig: AuctionConfig = {
    startDateTime: '',
    endDateTime: '',
    minIncrement: 25000,
  };

  /** Loaded from Admin → Configuration (DB); used for defaults and confirm summary. */
  globalSettings: AuctionGlobalConfig | null = null;

  private prevSelectionSize = 0;

  detailsZone: ExternalZone | null = null;
  isDetailsOpen = false;
  detailsLoading = false;
  detailsError: string | null = null;
  detailsData: AdminZoneDetails | null = null;
  isLoading = false;
  zonesLoading = false;
  zonesError: string | null = null;
  statesLoading = false;
  citiesLoading = false;

  liveConnected = false;
  /** Brief row highlight on socket bid update. */
  pulseZoneId: string | null = null;

  private refreshTimer?: ReturnType<typeof setInterval>;
  private pulseClearTimer?: ReturnType<typeof setTimeout>;
  private biddingSyncTimer?: ReturnType<typeof setInterval>;
  private detailsSyncTimer?: ReturnType<typeof setInterval>;
  private nowMs = Date.now();

  constructor(
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
    private readonly http: HttpClient,
    private readonly placeBidZones: PlaceBidZonesService,
    private readonly biddingRealtime: BiddingRealtimeService,
    private readonly auctionGlobalSettings: AuctionGlobalSettingsService,
    private readonly auctionLaunch: AuctionLaunchService,
    private readonly biddingZoneStatus: BiddingZoneStatusService,
    private readonly apiBase: ApiBaseService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAuctionGlobalSettings();
    this.loadStatesFromApi();
    this.refreshTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.nowMs = Date.now();
        this.liveConnected = !!this.biddingRealtime.getClient()?.connected;
        this.cdr.markForCheck();
      });
    }, 2000);
    this.biddingSyncTimer = setInterval(() => {
      if (!this.zones.length || !this.selectedState || !this.selectedCity) return;
      this.ngZone.run(() => this.requestBiddingStatusMergeForCurrentZones());
    }, 3000);
    this.detailsSyncTimer = setInterval(() => {
      if (!this.isDetailsOpen || !this.detailsZone || this.detailsLoading) return;
      this.ngZone.run(() => this.loadDetailsData(this.detailsZone!.id, true));
    }, 3000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.biddingSyncTimer) clearInterval(this.biddingSyncTimer);
    if (this.detailsSyncTimer) clearInterval(this.detailsSyncTimer);
    if (this.pulseClearTimer) clearTimeout(this.pulseClearTimer);
    this.teardownSocket();
    this.setBodyScrollLock(false);
  }

  private teardownSocket(): void {
    // Intentionally a no-op: the admin socket is a shared singleton owned by
    // `BiddingRealtimeService` and must remain connected across admin
    // screens (Zone Setup → Live Auctions, etc.). Disconnecting here was
    // causing the sibling Live Auctions page to briefly show "Socket Offline"
    // on navigation. We simply leave component-level listeners to be
    // overwritten on next `connect()` call (service uses a single client).
  }

  get filteredZones(): ExternalZone[] {
    const q = this.filterSearch.trim().toLowerCase();
    if (!q) return this.zones;
    return this.zones.filter((z) => {
      return (
        z.name.toLowerCase().includes(q) ||
        z.city.toLowerCase().includes(q) ||
        z.state.toLowerCase().includes(q) ||
        z.pincodes.some((p) => p.includes(q)) ||
        z.areaNames.some((a) => a.toLowerCase().includes(q))
      );
    });
  }

  get selectedZones(): ExternalZone[] {
    return this.zones.filter((z) => this.selectedIds.has(z.id));
  }

  /** Zones in the current filter that can be included in a new launch (not already live). */
  get selectableFilteredZones(): ExternalZone[] {
    return this.filteredZones.filter((z) => z.status !== 'active');
  }

  get allFilteredSelected(): boolean {
    const sel = this.selectableFilteredZones;
    return sel.length > 0 && sel.every((z) => this.selectedIds.has(z.id));
  }

  get someFilteredSelected(): boolean {
    return this.filteredZones.some((z) => this.selectedIds.has(z.id)) && !this.allFilteredSelected;
  }

  get canLoadZones(): boolean {
    return !!this.selectedState && !!this.selectedCity;
  }

  private loadAuctionGlobalSettings(): void {
    this.auctionGlobalSettings
      .get()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((cfg) => {
        this.ngZone.run(() => {
          if (cfg) {
            this.globalSettings = cfg;
            if (this.selectedIds.size === 0) {
              this.auctionConfig.minIncrement = cfg.minIncrementDefault;
              this.auctionConfig.startDateTime = '';
              this.auctionConfig.endDateTime = '';
            }
          } else {
            this.globalSettings = null;
            if (this.selectedIds.size === 0) {
              this.setFallbackDateTimesWhenApiFails();
            }
          }
          this.cdr.markForCheck();
        });
      });
  }

  /** If auction-settings API fails, pre-fill bulk bar dates only when nothing is selected (bulk bar hidden until selection). */
  private setFallbackDateTimesWhenApiFails(): void {
    const now = new Date();
    const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    this.auctionConfig.startDateTime = fmt(now);
    this.auctionConfig.endDateTime = fmt(later);
    this.auctionConfig.minIncrement = 25000;
  }

  private formatDateTimeLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private applyGlobalSettingsToAuctionForm(): void {
    const durMin = this.globalSettings?.defaultDurationMinutes ?? 10080;
    const minDef = this.globalSettings?.minIncrementDefault ?? 25000;
    const now = new Date();
    const end = new Date(now.getTime() + Math.max(1, durMin) * 60 * 1000);
    this.auctionConfig.startDateTime = this.formatDateTimeLocal(now);
    this.auctionConfig.endDateTime = this.formatDateTimeLocal(end);
    this.auctionConfig.minIncrement = minDef;
  }

  private afterSelectionChange(): void {
    const n = this.selectedIds.size;
    if (this.prevSelectionSize === 0 && n > 0) {
      this.applyGlobalSettingsToAuctionForm();
    }
    this.prevSelectionSize = n;
  }

  private scheduleViewUpdate(fn: () => void): void {
    Promise.resolve().then(() => {
      setTimeout(() => {
        if (this.destroy$.closed) return;
        this.ngZone.run(() => {
          fn();
          this.cdr.markForCheck();
        });
      }, 0);
    });
  }

  /** Merge catalog rows with `BiddingZoneConfig` so status survives refresh (active / closed / …). */
  private requestBiddingStatusMergeForCurrentZones(): void {
    const ids = this.zones.map((z) => z.id).filter(Boolean);
    if (!ids.length) return;
    const seq = ++this.biddingStatusSeq;
    this.biddingZoneStatus
      .getStatusesForZoneIds(ids)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((statuses) => {
        this.ngZone.run(() => {
          if (seq !== this.biddingStatusSeq || !statuses) return;
          this.applyBiddingStatusMap(statuses as Record<string, BiddingZoneStatusRow>);
        });
      });
  }

  private applyBiddingStatusMap(statuses: Record<string, BiddingZoneStatusRow>): void {
    this.zones = this.zones.map((z) => {
      const row = statuses[z.id];
      if (!row?.uiStatus) return z;
      return {
        ...z,
        status: row.uiStatus,
        liveHighestBid:
          row.currentHighestBid != null && Number.isFinite(Number(row.currentHighestBid))
            ? Number(row.currentHighestBid)
            : z.liveHighestBid,
        liveBidsCount:
          row.bidsCount != null && Number.isFinite(Number(row.bidsCount))
            ? Number(row.bidsCount)
            : z.liveBidsCount,
        liveBiddersCount:
          row.biddersCount != null && Number.isFinite(Number(row.biddersCount))
            ? Number(row.biddersCount)
            : z.liveBiddersCount,
        liveLastBidAt:
          row.lastBidAt != null && Number.isFinite(Number(row.lastBidAt))
            ? Number(row.lastBidAt)
            : z.liveLastBidAt,
      };
    });
    for (const id of [...this.selectedIds]) {
      const z = this.zones.find((x) => x.id === id);
      if (z?.status === 'active') this.selectedIds.delete(id);
    }
    this.prevSelectionSize = this.selectedIds.size;
    this.joinConfiguredZones();
    this.cdr.markForCheck();
  }

  onStateChange(state: string | null): void {
    this.selectedState = state ?? '';
    this.selectedCity = '';
    this.cityOptions = [];
    this.zones = [];
    this.zonesError = null;
    this.zonesLoading = false;
    this.pruneSelectionToLoadedZones();
    this.teardownSocket();

    if (this.selectedState) {
      this.scheduleViewUpdate(() => this.loadCitiesFromApi(this.selectedState));
    }
  }

  onCityChange(city: string | null): void {
    this.selectedCity = city ?? '';
    this.zonesError = null;
    this.pruneSelectionToLoadedZones();
    this.teardownSocket();

    if (!this.selectedCity || !this.selectedState) {
      this.zones = [];
      this.zonesLoading = false;
      return;
    }

    this.zonesLoading = true;
    this.zones = [];
    this.scheduleViewUpdate(() =>
      this.loadZonesFromApi(this.selectedState, this.selectedCity)
    );
  }

  private loadStatesFromApi(): void {
    this.statesLoading = true;
    this.placeBidZones
      .getStateList(this.defaultCountry)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.ngZone.run(() => {
          this.statesLoading = false;
          const opts = this.extractSelectOptions(res, ['state', 'name', 'id', 'value', 'title']);
          if (opts.length) this.stateOptions = opts;
          this.cdr.markForCheck();
        });
      });
  }

  private loadCitiesFromApi(state: string): void {
    this.citiesLoading = true;
    this.placeBidZones
      .getCities(this.defaultCountry, state)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.ngZone.run(() => {
          this.citiesLoading = false;
          const opts = this.extractSelectOptions(res, ['city', 'district', 'name', 'id', 'value', 'title']);
          this.cityOptions = opts.length ? opts : [];
          this.cdr.markForCheck();
        });
      });
  }

  private extractSelectOptions(res: unknown, candidateKeys: string[]): SelectOption[] {
    const values = this.extractPrimitiveItems(this.extractList(res), candidateKeys);
    const uniq = Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
    return uniq.map((id) => ({ id }));
  }

  private extractList(res: unknown): unknown[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      const o = res as Record<string, unknown>;
      for (const key of ['data', 'result', 'list', 'records', 'states', 'cities']) {
        const v = o[key];
        if (Array.isArray(v)) return v;
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
      if (!item || typeof item !== 'object') continue;
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

    this.placeBidZones
      .getZonesList({ state, city })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(ZONES_LIST_HTTP_FAILED)),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.ngZone.run(() => {
          if (seq !== this.zoneLoadSeq) return;
          this.zonesLoading = false;

          if (res === ZONES_LIST_HTTP_FAILED) {
            this.zonesError = 'Unable to load zones. Please try again.';
            this.zones = [];
            this.cdr.markForCheck();
            return;
          }

          if (this.isZonesResponseFailure(res)) {
            this.zonesError = this.readZonesErrorMessage(res);
            this.zones = [];
            this.cdr.markForCheck();
            return;
          }

          const arr = extractZonesArrayFromResponse(res);
          this.zones = arr
            .map((item) => mapZoneDocumentToExternalZone(item, state, city))
            .filter((z): z is ExternalZone => z !== null);
          this.zonesError = null;
          this.pruneSelectionToLoadedZones();
          this.setupBiddingRealtime();
          this.requestBiddingStatusMergeForCurrentZones();
          this.cdr.markForCheck();
        });
      });
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

  private setupBiddingRealtime(): void {
    const sock = this.biddingRealtime.connect({ role: 'admin' });
    this.liveConnected = !!sock?.connected;
    if (!sock) return;

    sock.off('connect');
    sock.on('connect', () => {
      this.scheduleViewUpdate(() => {
        this.liveConnected = true;
        this.joinConfiguredZones();
      });
    });

    sock.off('disconnect');
    sock.on('disconnect', () => {
      this.scheduleViewUpdate(() => {
        this.liveConnected = false;
      });
    });

    sock.off('zone-catalog-update');
    sock.on('zone-catalog-update', (evt: unknown) => {
      this.scheduleViewUpdate(() => this.onZoneCatalogLiveEvent(evt));
    });

    sock.off('bid-updated');
    sock.on('bid-updated', (payload: unknown) => {
      this.scheduleViewUpdate(() => {
        const p = this.normalizeBidUpdatedPayload(payload);
        if (p) this.onBidUpdated(p);
      });
    });

    this.joinConfiguredZones();
  }

  private joinConfiguredZones(): void {
    for (const z of this.zones) {
      if (z.status === 'not_configured') continue;
      this.joinZoneChannel(z);
    }
  }

  private joinZoneChannel(zone: ExternalZone): void {
    const sock = this.biddingRealtime.getClient();
    if (!sock) return;
    sock.emit(
      'join-zone',
      {
        externalZoneId: zone.id,
        name: zone.name,
        city: this.selectedCity,
        state: this.selectedState,
        basePrice: zone.amountCharge ?? 0,
      },
      (res: { ok?: boolean; zone?: Record<string, unknown> }) => {
        this.scheduleViewUpdate(() => {
          if (res?.ok && res.zone) {
            this.applyJoinSnapshot(zone, res.zone);
          }
        });
      }
    );
  }

  private applyJoinSnapshot(zone: ExternalZone, payload: Record<string, unknown>): void {
    const snap = payload['snapshot'] as Record<string, unknown> | null | undefined;
    if (snap && typeof snap === 'object') {
      const high = snap['current_highest_bid'];
      if (typeof high === 'number') {
        zone.liveHighestBid = high;
      }
      const bc = snap['bids_count'];
      if (typeof bc === 'number') {
        zone.liveBidsCount = bc;
      }
      const biddersCt = snap['bidders_count'];
      if (typeof biddersCt === 'number') {
        zone.liveBiddersCount = biddersCt;
      }
      const lastAt = snap['last_bid_at'];
      if (typeof lastAt === 'number' && lastAt > 0) {
        zone.liveLastBidAt = lastAt;
      }
    }
  }

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
      this.selectedIds.delete(removedId);
      if (this.detailsZone?.id === removedId) this.closeDetailsDialog();
      this.prevSelectionSize = this.selectedIds.size;
      return;
    }

    const data = e['data'];
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;

    if (entityType === 'zone' && (actionType === 'add' || actionType === 'update')) {
      if (!this.catalogZoneDocMatchesFilters(d)) return;
      const mapped = mapZoneDocumentToExternalZone(d, this.selectedState, this.selectedCity);
      if (!mapped) return;
      const idx = this.zones.findIndex((z) => z.id === mapped.id);
      if (idx >= 0) {
        const merged = this.mergeCatalogZoneWithExisting(this.zones[idx], mapped);
        this.zones = [...this.zones.slice(0, idx), merged, ...this.zones.slice(idx + 1)];
        this.joinZoneChannel(merged);
      } else {
        this.zones = [...this.zones, mapped];
        this.joinZoneChannel(mapped);
      }
      this.requestBiddingStatusMergeForCurrentZones();
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
        this.requestBiddingStatusMergeForCurrentZones();
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

  private mergeCatalogZoneWithExisting(prev: ExternalZone, fresh: ExternalZone): ExternalZone {
    return {
      ...fresh,
      status: prev.status,
      liveHighestBid: prev.liveHighestBid,
      liveBiddersCount: prev.liveBiddersCount,
      liveBidsCount: prev.liveBidsCount,
      liveLastBidAt: prev.liveLastBidAt,
    };
  }

  private mergePincodeUpdateIntoZoneIfApplicable(
    zone: ExternalZone,
    pin: Record<string, unknown>
  ): ExternalZone {
    const pc = String(pin['pincode'] ?? '').trim();
    if (!pc) return zone;

    let matched = false;
    const nextAreas = [...zone.areaNames];
    while (nextAreas.length < zone.pincodes.length) nextAreas.push('');

    for (let i = 0; i < zone.pincodes.length; i++) {
      if (zone.pincodes[i] === pc) {
        matched = true;
        const area = String(pin['area'] ?? '').trim();
        if (area) nextAreas[i] = area;
      }
    }

    if (!matched) return zone;
    return {
      ...zone,
      areaNames: Array.from(
        new Set(
          nextAreas
            .slice(0, zone.pincodes.length)
            .map((a) => a.trim())
            .filter((a) => a.length > 0)
        )
      ),
    };
  }

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

  private normalizeBidUpdatedPayload(raw: unknown): BidUpdatedPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const externalZoneId = normalizeEntityId(o['externalZoneId'] ?? o['external_zone_id']);
    if (!externalZoneId) return null;
    const bidRaw = o['currentHighestBid'] ?? o['current_highest_bid'];
    const currentHighestBid = Math.round(Number(bidRaw));
    if (!Number.isFinite(currentHighestBid)) return null;
    const lastRaw = o['lastBidAt'] ?? o['last_bid_at'];
    const lastBidAt =
      typeof lastRaw === 'number' && Number.isFinite(lastRaw) ? lastRaw : Number(lastRaw);
    if (!Number.isFinite(lastBidAt)) return null;
    const bidsDelta = o['bidsDelta'];
    const biddersCount = o['biddersCount'];
    const bidderName = o['bidderName'];
    return {
      externalZoneId,
      currentHighestBid,
      lastBidAt,
      bidderName: typeof bidderName === 'string' ? bidderName : undefined,
      bidsDelta: typeof bidsDelta === 'number' ? bidsDelta : undefined,
      biddersCount: typeof biddersCount === 'number' ? biddersCount : undefined,
    };
  }

  private onBidUpdated(p: BidUpdatedPayload): void {
    const want = normalizeEntityId(p.externalZoneId);
    const zone = this.zones.find((z) => normalizeEntityId(z.id) === want);
    if (!zone) return;
    zone.liveHighestBid = p.currentHighestBid;
    zone.liveLastBidAt = p.lastBidAt;
    if (typeof p.bidsDelta === 'number') {
      zone.liveBidsCount = (zone.liveBidsCount ?? 0) + p.bidsDelta;
    } else {
      zone.liveBidsCount = (zone.liveBidsCount ?? 0) + 1;
    }
    if (typeof p.biddersCount === 'number') {
      zone.liveBiddersCount = p.biddersCount;
    }
    if (this.isDetailsOpen && this.detailsZone && normalizeEntityId(this.detailsZone.id) === want) {
      const prevRows = this.detailsData?.leaderboard ?? [];
      const topName = p.bidderName || prevRows[0]?.bidderName || 'Bidder';
      const topRow: AdminZoneBidRow = {
        rank: 1,
        bidderName: topName,
        bidAmount: p.currentHighestBid,
        bidTime: new Date(p.lastBidAt).toISOString(),
      };
      const shifted = prevRows
        .slice(0, 29)
        .map((r, idx) => ({ ...r, rank: idx + 2 }));
      this.detailsData = {
        ...(this.detailsData ?? {
          minBidIncrement: this.globalSettings?.minIncrementDefault ?? null,
          currentLeader: null,
          bidsCount: null,
          biddersCount: null,
          lastBidAt: null,
          currentHighestBid: null,
          leaderboard: [],
        }),
        currentHighestBid: p.currentHighestBid,
        lastBidAt: p.lastBidAt,
        bidsCount:
          this.detailsData?.bidsCount != null
            ? this.detailsData.bidsCount + (p.bidsDelta ?? 1)
            : (zone.liveBidsCount ?? null),
        biddersCount: p.biddersCount ?? this.detailsData?.biddersCount ?? zone.liveBiddersCount ?? null,
        currentLeader: topName,
        leaderboard: [topRow, ...shifted],
      };
    }
    this.pulseZoneId = zone.id;
    if (this.pulseClearTimer) clearTimeout(this.pulseClearTimer);
    this.pulseClearTimer = setTimeout(() => {
      this.pulseZoneId = null;
      this.cdr.markForCheck();
    }, 900);
  }

  private pruneSelectionToLoadedZones(): void {
    const ids = new Set(this.zones.map((z) => z.id));
    for (const id of [...this.selectedIds]) {
      if (!ids.has(id)) this.selectedIds.delete(id);
    }
    this.prevSelectionSize = this.selectedIds.size;
  }

  toggleSelectAll(): void {
    if (this.allFilteredSelected) {
      this.filteredZones.forEach((z) => this.selectedIds.delete(z.id));
    } else {
      this.selectableFilteredZones.forEach((z) => this.selectedIds.add(z.id));
    }
    this.afterSelectionChange();
  }

  toggleZone(id: string): void {
    const z = this.zones.find((x) => x.id === id);
    if (z?.status === 'active') return;
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
    this.afterSelectionChange();
  }

  openDetailsDialog(zone: ExternalZone): void {
    this.detailsZone = zone;
    this.isDetailsOpen = true;
    this.detailsData = null;
    this.detailsError = null;
    this.loadDetailsData(zone.id);
    this.setBodyScrollLock(true);
  }

  closeDetailsDialog(): void {
    this.isDetailsOpen = false;
    this.detailsZone = null;
    this.detailsData = null;
    this.detailsError = null;
    this.detailsLoading = false;
    this.setBodyScrollLock(false);
  }

  onDetailsBackdropClick(): void {
    this.closeDetailsDialog();
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.prevSelectionSize = 0;
  }

  clearFilters(): void {
    this.selectedState = '';
    this.selectedCity = '';
    this.cityOptions = [];
    this.zones = [];
    this.filterSearch = '';
    this.zonesError = null;
    this.zonesLoading = false;
    this.teardownSocket();
  }

  isConfigValid(): boolean {
    return (
      this.selectedIds.size > 0 &&
      !!this.auctionConfig.startDateTime &&
      !!this.auctionConfig.endDateTime &&
      this.auctionConfig.minIncrement > 0 &&
      new Date(this.auctionConfig.endDateTime) > new Date(this.auctionConfig.startDateTime) &&
      this.selectedZones.every(
        (z) => z.amountCharge != null && z.amountCharge > 0
      )
    );
  }

  openConfirmDialog(): void {
    if (!this.isConfigValid()) return;

    const data: ConfirmAuctionDialogData = {
      zones: this.selectedZones,
      config: { ...this.auctionConfig },
      globalRules: this.globalSettings ?? undefined,
    };

    const ref = this.dialog.open(ConfirmAuctionDialogComponent, {
      width: '640px',
      maxWidth: '95vw',
      panelClass: 'auction-confirm-panel',
      data,
    });

    ref.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.launchAuctions();
      }
    });
  }

  private launchAuctions(): void {
    const zones = this.selectedZones;
    const body = {
      auctions: zones.map((z) => ({
        externalZoneId: z.id,
        basePrice: z.amountCharge ?? 0,
        name: z.name,
        city: z.city,
        state: z.state,
      })),
      bidStartTime: new Date(this.auctionConfig.startDateTime).toISOString(),
      bidEndTime: new Date(this.auctionConfig.endDateTime).toISOString(),
      minBidIncrement: this.auctionConfig.minIncrement,
      globalRules: this.globalSettings ?? undefined,
    };

    this.isLoading = true;
    this.cdr.detectChanges();
    this.auctionLaunch
      .launch(body)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          const launched = res.launched ?? [];
          const errors = res.errors ?? [];
          if (!res.ok || launched.length === 0) {
            const msg =
              errors[0]?.message ||
              (errors.length
                ? `${errors.length} zone(s) could not be launched.`
                : 'Launch failed.');
            this.snackBar.open(msg, 'Close', { duration: 5000 });
            return;
          }

          const launchedSet = new Set(launched.map((r) => r.externalZoneId));
          this.zones = this.zones.map((z) =>
            launchedSet.has(z.id) ? { ...z, status: 'active' as const } : z
          );

          this.selectedIds.clear();
          this.prevSelectionSize = 0;

          if (errors.length > 0) {
            this.snackBar.open(
              `Launched ${launched.length} auction(s). ${errors.length} failed: ${errors[0].message}`,
              'Close',
              { duration: 6000 }
            );
          } else {
            this.snackBar.open(
              `${launched.length} auction${launched.length > 1 ? 's' : ''} launched successfully.`,
              'Close',
              { duration: 4000, panelClass: 'snack-success' }
            );
          }
          // Notify other admin tabs (e.g. Live Auctions) to refresh immediately.
          try {
            localStorage.setItem(this.launchSignalKey, String(Date.now()));
          } catch {
            // ignore storage errors
          }
        },
        error: (err: HttpErrorResponse | Error) => {
          const http = err as HttpErrorResponse;
          const msg =
            (http.error && typeof http.error === 'object' && 'message' in http.error
              ? String((http.error as { message?: string }).message)
              : null) ||
            http.message ||
            (err as Error).message ||
            'Launch failed. Check admin API and login.';
          this.snackBar.open(msg, 'Close', { duration: 5000 });
        },
      });
  }

  statusLabel(status: ExternalZone['status']): string {
    const map: Record<string, string> = {
      not_configured: 'Not Configured',
      configured: 'Configured',
      active: 'Bidding Live',
      closed: 'Closed',
    };
    return map[status] ?? status;
  }

  formatLastBidAt(zone: ExternalZone): string {
    if (!zone.liveLastBidAt) return '—';
    const d = new Date(zone.liveLastBidAt);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  formatDetailBidTime(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  detailHighestBid(zone: ExternalZone): string {
    const v = this.detailsData?.currentHighestBid ?? zone.liveHighestBid ?? null;
    if (v == null) return '—';
    return this.formatCurrency(v);
  }

  detailBidders(zone: ExternalZone): string {
    const v = this.detailsData?.biddersCount ?? zone.liveBiddersCount ?? null;
    return v == null ? '—' : String(v);
  }

  detailBids(zone: ExternalZone): string {
    const v = this.detailsData?.bidsCount ?? zone.liveBidsCount ?? null;
    return v == null ? '—' : String(v);
  }

  detailLastBidAt(zone: ExternalZone): string {
    if (this.detailsData?.lastBidAt != null && Number.isFinite(this.detailsData.lastBidAt)) {
      return this.formatLastBidMs(this.detailsData.lastBidAt);
    }
    return this.formatLastBidAt(zone);
  }

  detailMinimumNextBid(zone: ExternalZone): string {
    const current = this.detailsData?.currentHighestBid ?? zone.liveHighestBid ?? zone.amountCharge ?? 0;
    const inc = this.detailsData?.minBidIncrement ?? this.globalSettings?.minIncrementDefault ?? 0;
    if (!(current > 0) || !(inc > 0)) return '—';
    return this.formatCurrency(current + inc);
  }

  statusToneClass(status: ExternalZone['status']): 'active' | 'closing' | 'closed' | 'inactive' {
    if (status === 'active') return 'active';
    if (status === 'configured') return 'closing';
    if (status === 'closed') return 'closed';
    return 'inactive';
  }

  timerPillLabel(): string {
    const end = this.detailsData?.bidEndTime ? new Date(this.detailsData.bidEndTime).getTime() : NaN;
    if (!Number.isFinite(end)) return '--:--:--';
    const ms = Math.max(0, end - this.nowMs);
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  private loadDetailsData(zoneId: string, silent = false): void {
    if (!silent) {
      this.detailsLoading = true;
      this.detailsError = null;
    }
    const adminBase = this.apiBase.getAdminBaseUrl().replace(/\/$/, '');
    this.http
      .get<{ details?: AdminZoneDetails; message?: string }>(
        `${adminBase}/bidding-zones/details/${encodeURIComponent(zoneId)}`
      )
      .pipe(
        takeUntil(this.destroy$),
        catchError((err: HttpErrorResponse | Error) => {
          if (!silent) {
            this.detailsError =
              (err as HttpErrorResponse)?.error?.message ||
              (err as HttpErrorResponse)?.message ||
              (err as Error)?.message ||
              'Could not load bid details.';
          }
          return of(null);
        }),
        finalize(() => {
          if (!silent) this.detailsLoading = false;
          this.cdr.markForCheck();
        }),
        observeOn(asyncScheduler)
      )
      .subscribe((res) => {
        this.ngZone.run(() => {
          if (!this.isDetailsOpen || !this.detailsZone || this.detailsZone.id !== zoneId) return;
          if (res?.details) {
            this.detailsData = res.details;
            if (res.details.currentHighestBid != null) this.detailsZone.liveHighestBid = res.details.currentHighestBid;
            if (res.details.bidsCount != null) this.detailsZone.liveBidsCount = res.details.bidsCount;
            if (res.details.biddersCount != null) this.detailsZone.liveBiddersCount = res.details.biddersCount;
            if (res.details.lastBidAt != null) this.detailsZone.liveLastBidAt = res.details.lastBidAt;
          }
          this.cdr.markForCheck();
        });
      });
  }

  private formatLastBidMs(ms: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private setBodyScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  formatLiveBid(z: ExternalZone): string {
    if (z.liveHighestBid == null) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(z.liveHighestBid);
  }

  formatBasePrice(z: ExternalZone): string {
    if (z.amountCharge == null || z.amountCharge <= 0) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(z.amountCharge);
  }

  trackByZone(_: number, z: ExternalZone): string {
    return z.id;
  }
}
