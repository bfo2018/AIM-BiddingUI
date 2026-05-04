import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of, tap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { TokenStorageService } from '../../../core/services/token-storage.service';

/** Demo JWT-shaped string for local UI until backend exists. */
const DUMMY_FRANCHISE_TOKEN =
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiJmcmFuY2hpc2UtZGVtbyIsIm1vZGUiOiJkdW1teSJ9.';

const DEMO_KNOWN_MOBILES_KEY = 'franchise_demo_known_mobiles';

@Injectable({ providedIn: 'root' })
export class FranchiseAuthService {
  /** In-memory OTP store for dummy mode (backend will replace with SMS + server session). */
  private readonly demoOtpByMobile = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private apiBase: ApiBaseService,
    private tokenStorage: TokenStorageService
  ) {}

  /**
   * Legacy password login — kept for future API compatibility.
   * Primary franchise entry is mobile + OTP.
   */
  login(payload: { email: string; password: string }): Observable<void> {
    if (environment.useDummyFranchiseAuth) {
      const demo = environment.franchiseDemoLogin;
      const aimId = (payload.email ?? '').trim();
      const password = payload.password ?? '';
      const ok = aimId === demo.aimId && password === demo.password;
      if (!ok) {
        return throwError(
          () =>
            new Error(
              `Invalid demo credentials. Use AIM ID "${demo.aimId}" and password "${demo.password}".`
            )
        );
      }
      return of(undefined).pipe(tap(() => this.tokenStorage.setFranchiseToken(DUMMY_FRANCHISE_TOKEN)));
    }

    return this.http
      .post<{ token: string }>(`${this.apiBase.getFranchiseBaseUrl()}/auth/login`, payload)
      .pipe(
        tap((res) => this.tokenStorage.setFranchiseToken(res.token)),
        map(() => undefined)
      );
  }

  /** Request OTP using real backend (or demo fallback). */
  requestFranchiseMobileOtp(
    mobile: string
  ): Observable<{ otp: string; isNewUser: boolean }> {
    const m = this.normalizeMobile(mobile);
    if (m.length !== 10) {
      return throwError(() => new Error('Enter a valid 10-digit mobile number.'));
    }

    if (environment.useDummyFranchiseAuth) {
      const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
      this.demoOtpByMobile.set(m, otp);
      const isNewUser = !this.isMobileKnownLocally(m);
      return of({ otp, isNewUser });
    }

    const url = `${environment.franchiseRegistrationApiUrl.replace(/\/$/, '')}/api/auth/send-otp`;
    return this.http
      .post<{ otp: string; mobile_number?: string }> (url, { mobile_number: m })
      .pipe(
        map((res) => {
          const code = String((res as any)?.otp ?? '').trim();
          if (!code) {
            throw new Error('OTP not received from server.');
          }
          return { otp: code, isNewUser: false };
        })
      );
  }

  /** Verify OTP using backend (or demo fallback) and store JWT. */
  verifyFranchiseMobileOtp(
    mobile: string,
    otp: string
  ): Observable<{ isNewUser: boolean }> {
    const m = this.normalizeMobile(mobile);
    const entered = `${otp ?? ''}`.trim();
    if (m.length !== 10 || !entered) {
      return throwError(() => new Error('Enter a valid mobile and OTP.'));
    }

    if (environment.useDummyFranchiseAuth) {
      const expected = this.demoOtpByMobile.get(m);
      const isNewUser = !this.isMobileKnownLocally(m);
      if (!expected || entered !== expected) {
        return throwError(
          () => new Error('Invalid or expired OTP. Request a new code and try again.')
        );
      }
      this.demoOtpByMobile.delete(m);
      this.markMobileKnownLocally(m);
      this.tokenStorage.setFranchiseToken(DUMMY_FRANCHISE_TOKEN);
      return of({ isNewUser });
    }

    const url = `${environment.franchiseRegistrationApiUrl.replace(/\/$/, '')}/api/auth/verify-otp`;
    return this.http
      .post<{ access_token: string; user?: unknown; message?: string }>(url, {
        mobile_number: m,
        otp: entered,
      })
      .pipe(
        tap((res) => {
          const token = (res as any)?.access_token;
          if (!token) {
            throw new Error('No access token returned from server.');
          }
          this.tokenStorage.setFranchiseToken(token);
          this.markMobileKnownLocally(m);
        }),
        map(() => ({ isNewUser: false }))
      );
  }

  logout(): void {
    this.tokenStorage.clearFranchiseToken();
  }

  private normalizeMobile(mobile: string): string {
    return (mobile ?? '').replace(/\D/g, '').slice(0, 10);
  }

  private isMobileKnownLocally(mobile: string): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }
    try {
      const raw = sessionStorage.getItem(DEMO_KNOWN_MOBILES_KEY);
      const list: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) && list.includes(mobile);
    } catch {
      return false;
    }
  }

  private markMobileKnownLocally(mobile: string): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      const raw = sessionStorage.getItem(DEMO_KNOWN_MOBILES_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? [...list] : [];
      if (!next.includes(mobile)) {
        next.push(mobile);
      }
      sessionStorage.setItem(DEMO_KNOWN_MOBILES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
}
