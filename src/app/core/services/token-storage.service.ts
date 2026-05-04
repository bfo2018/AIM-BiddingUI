import { Injectable } from '@angular/core';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly franchiseKey = 'franchise_token';
  private readonly adminKey = 'admin_token';
  private readonly legacyFranchiseKey = 'token';

  // Switch to sessionStorage if you prefer per-tab tokens:
  // private get store(): StorageLike { return sessionStorage; }
  private get store(): StorageLike {
    return localStorage;
  }

  getFranchiseToken(): string | null {
    return this.store.getItem(this.franchiseKey) || this.store.getItem(this.legacyFranchiseKey);
  }

  setFranchiseToken(token: string): void {
    this.store.setItem(this.franchiseKey, token);
    this.store.setItem(this.legacyFranchiseKey, token);
  }

  clearFranchiseToken(): void {
    this.store.removeItem(this.franchiseKey);
    this.store.removeItem(this.legacyFranchiseKey);
  }

  getAdminToken(): string | null {
    return this.store.getItem(this.adminKey);
  }

  setAdminToken(token: string): void {
    this.store.setItem(this.adminKey, token);
  }

  clearAdminToken(): void {
    this.store.removeItem(this.adminKey);
  }
}

