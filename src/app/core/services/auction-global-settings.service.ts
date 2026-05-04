import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { AuctionGlobalConfig } from '../../features/admin/auctions/shared/auction.types';

@Injectable({ providedIn: 'root' })
export class AuctionGlobalSettingsService {
  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService
  ) {}

  private url(): string {
    return `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/auction-settings`;
  }

  get(): Observable<AuctionGlobalConfig> {
    return this.http
      .get<{ settings: AuctionGlobalConfig }>(this.url())
      .pipe(map((r) => normalize(r.settings)));
  }

  save(settings: AuctionGlobalConfig): Observable<AuctionGlobalConfig> {
    return this.http
      .put<{ settings: AuctionGlobalConfig }>(this.url(), settings)
      .pipe(map((r) => normalize(r.settings)));
  }
}

function normalize(s: AuctionGlobalConfig): AuctionGlobalConfig {
  return {
    defaultDurationMinutes: Number(s?.defaultDurationMinutes) || 10080,
    reminderBeforeCloseMinutes: Number(s?.reminderBeforeCloseMinutes) || 30,
    minIncrementDefault: Number(s?.minIncrementDefault) || 25000,
    autoExtendEnabled: !!s?.autoExtendEnabled,
    autoExtendMinutes: Number(s?.autoExtendMinutes) || 15,
    autoExtendOnBidWithin: Number(s?.autoExtendOnBidWithin) || 10,
    maxExtensions: Math.max(0, Number(s?.maxExtensions) || 0),
  };
}
