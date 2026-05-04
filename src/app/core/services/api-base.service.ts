import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiBaseService {
  getFranchiseBaseUrl(): string {
    return environment.franchiseApiBaseUrl;
  }

  getAdminBaseUrl(): string {
    return environment.adminApiBaseUrl;
  }
}

