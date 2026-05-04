import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { AuctionGlobalConfig } from '../../features/admin/auctions/shared/auction.types';

export type LaunchAuctionZonePayload = {
  externalZoneId: string;
  basePrice: number;
  name?: string;
  city?: string;
  state?: string;
};

export type LaunchAuctionRequest = {
  auctions: LaunchAuctionZonePayload[];
  bidStartTime: string;
  bidEndTime: string;
  minBidIncrement: number;
  globalRules?: AuctionGlobalConfig;
};

export type LaunchAuctionResultRow = {
  externalZoneId: string;
  auction_round_id: number;
  bid_start_time: string;
  bid_end_time: string;
  min_bid_increment: number;
};

export type LaunchAuctionErrorRow = {
  externalZoneId: string;
  message: string;
};

export type LaunchAuctionResponse = {
  ok: boolean;
  launched: LaunchAuctionResultRow[];
  errors: LaunchAuctionErrorRow[];
};

@Injectable({ providedIn: 'root' })
export class AuctionLaunchService {
  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService
  ) {}

  private url(): string {
    return `${this.apiBase.getAdminBaseUrl().replace(/\/$/, '')}/auctions/launch`;
  }

  launch(body: LaunchAuctionRequest): Observable<LaunchAuctionResponse> {
    return this.http.post<LaunchAuctionResponse>(this.url(), body);
  }
}
