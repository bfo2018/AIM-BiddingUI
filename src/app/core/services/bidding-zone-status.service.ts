import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map, of } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { ZoneStatus } from '../../features/admin/auctions/shared/auction.types';

export type BiddingZoneStatusRow = {
  uiStatus: ZoneStatus;
  dbStatus: string | null;
  bid_start_time: string | null;
  bid_end_time: string | null;
  auction_round_id: number | null;
  currentHighestBid?: number | null;
  bidsCount?: number | null;
  biddersCount?: number | null;
  lastBidAt?: number | null;
};

@Injectable({ providedIn: 'root' })
export class BiddingZoneStatusService {
  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService
  ) {}

  private url(): string {
    return `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/bidding-zones/status`;
  }

  /** Fetches Mongo `BiddingZoneConfig`–derived UI statuses (chunks of 200 per request). */
  getStatusesForZoneIds(zoneIds: string[]): Observable<Record<string, BiddingZoneStatusRow>> {
    const unique = [...new Set(zoneIds.map((id) => String(id).trim()).filter(Boolean))];
    if (!unique.length) return of({});

    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 200) {
      chunks.push(unique.slice(i, i + 200));
    }

    const one = (ids: string[]) => {
      const params = new HttpParams().set('ids', ids.join(','));
      return this.http
        .get<{ statuses: Record<string, BiddingZoneStatusRow> }>(this.url(), { params })
        .pipe(map((r) => r?.statuses ?? {}));
    };

    if (chunks.length === 1) return one(chunks[0]);
    return forkJoin(chunks.map((c) => one(c))).pipe(
      map((parts) => Object.assign({}, ...parts))
    );
  }
}
