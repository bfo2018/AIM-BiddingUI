import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { TokenStorageService } from '../../../core/services/token-storage.service';

export type AdminUserRecord = {
  id: string;
  name: string;
  mobile: string;
  city: string;
  state: string;
  applicationStatus: 'not_started' | 'in_progress' | 'completed';
  paymentStatus: 'pending' | 'paid';
  eligibility: 'eligible' | 'not_eligible';
  totalBids: number;
  createdAt?: string;
  updatedAt?: string;
  joinedAtLabel: string;
  registrationFee: number;
  lastPaymentAt?: string | null;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  zones: string[];
};

export type AdminUsersStats = {
  totalUsers: number;
  applicationsInProgress: number;
  pendingFee: number;
  paidFees: number;
  eligibleCount: number;
};

export type AdminUsersResponse = {
  users: AdminUserRecord[];
  stats: AdminUsersStats;
};

export type FetchAdminUsersParams = {
  search?: string;
  applicationStatus?: 'all' | 'not_started' | 'in_progress' | 'completed';
  paymentStatus?: 'all' | 'pending' | 'paid';
  eligibility?: 'all' | 'eligible' | 'not_eligible';
  duration?: 'till_now' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
  fromDate?: string;
  toDate?: string;
};

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  constructor(
    private readonly http: HttpClient,
    private readonly apiBase: ApiBaseService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  getUsers(params: FetchAdminUsersParams): Observable<AdminUsersResponse> {
    let qp = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      const v = String(value ?? '').trim();
      if (!v) continue;
      qp = qp.set(key, v);
    }
    qp = qp.set('_ts', String(Date.now()));
    const token = this.tokenStorage.getAdminToken() || this.tokenStorage.getFranchiseToken();
    const baseHeaders = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    const headers = token
      ? new HttpHeaders({ ...baseHeaders, Authorization: `Bearer ${token}` })
      : new HttpHeaders(baseHeaders);
    return this.http
      .get<unknown>(`${this.apiBase.getAdminBaseUrl()}/users`, {
        params: qp,
        headers,
      })
      .pipe(
        map((raw) => {
          const parsedRaw =
            typeof raw === 'string'
              ? (this.safeJsonParse(raw) as unknown)
              : raw;
          const body = this.asRecord(parsedRaw);
          const nested = this.asRecord(body['data']);
          const httpBody = this.asRecord(body['body']);

          const users = this.extractUsers(body, nested, httpBody, parsedRaw);
          const stats =
            (body['stats'] as AdminUsersStats | undefined) ||
            (nested['stats'] as AdminUsersStats | undefined) || {
              totalUsers: users.length,
              applicationsInProgress: users.filter((u) => u.applicationStatus === 'in_progress').length,
              pendingFee: users
                .filter((u) => u.paymentStatus === 'pending')
                .reduce((sum, u) => sum + (u.registrationFee || 0), 0),
              paidFees: users
                .filter((u) => u.paymentStatus === 'paid')
                .reduce((sum, u) => sum + (u.registrationFee || 0), 0),
              eligibleCount: users.filter((u) => u.eligibility === 'eligible').length,
            };
          return { users, stats };
        })
      );
  }

  reviewUser(userId: string, action: 'approve' | 'reject'): Observable<{ message: string }> {
    const token = this.tokenStorage.getAdminToken() || this.tokenStorage.getFranchiseToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.patch<{ message: string }>(
      `${this.apiBase.getAdminBaseUrl()}/users/${encodeURIComponent(userId)}/review`,
      { action },
      { headers }
    );
  }

  private safeJsonParse(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private extractUsers(
    body: Record<string, unknown>,
    nested: Record<string, unknown>,
    httpBody: Record<string, unknown>,
    parsedRaw: unknown
  ): AdminUserRecord[] {
    if (Array.isArray(body['users'])) return body['users'] as AdminUserRecord[];
    if (Array.isArray(nested['users'])) return nested['users'] as AdminUserRecord[];
    if (Array.isArray(httpBody['users'])) return httpBody['users'] as AdminUserRecord[];
    if (Array.isArray(parsedRaw)) return parsedRaw as AdminUserRecord[];
    return [];
  }
}
