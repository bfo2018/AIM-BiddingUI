import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';
import { TokenStorageService } from '../services/token-storage.service';
import { AdminAuthService } from '../../features/admin/auth/admin-auth.service';

@Injectable({ providedIn: 'root' })
export class AdminLoginGuard implements CanActivate {
  constructor(
    private tokenStorage: TokenStorageService,
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> | boolean {
    const token = this.tokenStorage.getAdminToken();
    if (!token) {
      return true;
    }

    return this.adminAuth.me().pipe(
      map(() => this.router.createUrlTree(['/admin/dashboard'])),
      catchError(() => {
        this.tokenStorage.clearAdminToken();
        return of(true);
      })
    );
  }
}

