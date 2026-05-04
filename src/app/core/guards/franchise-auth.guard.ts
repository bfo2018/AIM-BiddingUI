import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';

@Injectable({ providedIn: 'root' })
export class FranchiseAuthGuard implements CanActivate {
  constructor(
    private tokenStorage: TokenStorageService,
    private router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    const token = this.tokenStorage.getFranchiseToken();
    if (token) return true;
    return this.router.createUrlTree(['/franchise/login']);
  }
}

