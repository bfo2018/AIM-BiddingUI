import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { TokenStorageService } from '../core/services/token-storage.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private tokenStorage: TokenStorageService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const franchiseToken = this.tokenStorage.getFranchiseToken();
    const adminToken = this.tokenStorage.getAdminToken();
    const isApiRequest =
      req.url.startsWith('http://localhost:3000') ||
      req.url.startsWith('/api/') ||
      req.url.includes('/api/');
    const isAdminRequest = req.url.includes('/admin');
    const token = isAdminRequest ? adminToken : franchiseToken;

    const requestToSend =
      token && isApiRequest && !req.headers.has('Authorization')
        ? req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`,
            },
          })
        : req;

    return next.handle(requestToSend).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          if (isAdminRequest) {
            this.tokenStorage.clearAdminToken();
            void this.router.navigateByUrl('/admin/login');
          } else {
            this.tokenStorage.clearFranchiseToken();
            void this.router.navigateByUrl('/franchise/login');
          }
        }
        return throwError(() => error);
      })
    );
  }
}

