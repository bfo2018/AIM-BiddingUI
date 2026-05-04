import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenStorageService } from '../services/token-storage.service';
import { ApiBaseService } from '../services/api-base.service';

@Injectable()
export class AuthTokenInterceptor implements HttpInterceptor {
  constructor(
    private tokenStorage: TokenStorageService,
    private apiBase: ApiBaseService
  ) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const franchiseBase = this.apiBase.getFranchiseBaseUrl();
    const adminBase = this.apiBase.getAdminBaseUrl();

    const isFranchiseRequest = franchiseBase
      ? req.url.startsWith(franchiseBase)
      : false;
    const isAdminRequest = adminBase ? req.url.startsWith(adminBase) : false;

    let token: string | null = null;
    // Admin is a subset of the franchise base (e.g. `/api/admin` under `/api`) — prioritize admin token.
    if (isAdminRequest) token = this.tokenStorage.getAdminToken();
    else if (isFranchiseRequest) token = this.tokenStorage.getFranchiseToken();

    if (!token) return next.handle(req);

    if (req.headers.has('Authorization')) return next.handle(req);

    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });

    return next.handle(authReq);
  }
}

