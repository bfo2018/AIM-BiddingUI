import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { BiddingRealtimeService } from '../../../core/services/bidding-realtime.service';
import { TokenStorageService } from '../../../core/services/token-storage.service';

export type AdminProfile = {
  _id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
};

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  constructor(
    private http: HttpClient,
    private apiBase: ApiBaseService,
    private tokenStorage: TokenStorageService,
    private biddingRealtime: BiddingRealtimeService,
  ) {}

  login(payload: { mobile: string; password: string }): Observable<void> {
    return this.http
      .post<{ token: string }>(
        `${this.apiBase.getAdminBaseUrl()}/auth/login`,
        payload
      )
      .pipe(
        tap((res) => {
          this.tokenStorage.setAdminToken(res.token);
          // Warm admin socket immediately after login so admin auctions screens
          // do not race socket bootstrap on first entry.
          this.biddingRealtime.connect({ role: 'admin' });
        }),
        map(() => undefined)
      );
  }

  me(): Observable<AdminProfile> {
    return this.http
      .get<{ admin: AdminProfile }>(`${this.apiBase.getAdminBaseUrl()}/auth/me`)
      .pipe(map((res) => res.admin));
  }

  logout(): void {
    this.tokenStorage.clearAdminToken();
    if (this.biddingRealtime.getLastConnectRole() === 'admin') {
      this.biddingRealtime.disconnect();
    }
  }
}

