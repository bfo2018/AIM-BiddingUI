import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TokenStorageService } from './token-storage.service';

export type SessionUser = {
  _id?: string;
  name: string;
  mobile: string;
  email: string;
};

@Injectable({ providedIn: 'root' })
export class UserSessionService {
  constructor(
    private tokenStorage: TokenStorageService,
    private router: Router
  ) {}

  getToken(): string | null {
    return this.tokenStorage.getFranchiseToken();
  }

  getUserFromToken(): SessionUser | null {
    const token = this.getToken();
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;

    try {
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { user?: Partial<SessionUser> };
      const user = payload?.user;
      if (!user) return null;
      return {
        _id: typeof user._id === 'string' ? user._id : undefined,
        name: typeof user.name === 'string' ? user.name : '',
        mobile: typeof user.mobile === 'string' ? user.mobile : '',
        email: typeof user.email === 'string' ? user.email : '',
      };
    } catch {
      return null;
    }
  }

  logout(): void {
    this.tokenStorage.clearFranchiseToken();
    void this.router.navigateByUrl('/franchise/login');
  }
}

