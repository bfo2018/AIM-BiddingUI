import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DataService {
  /**
   * External project: state/city/zones + uploads (`/api/user/...`, `/api/admin/getzonesList`, …).
   * Local/dev: `http://54.204.94.44/api`. Vercel: `https://YOUR_APP.vercel.app/geo-api` (see vercel.json).
   */
  private get baseURL(): string {
    const b = environment.externalDataApiBaseUrl.replace(/\/$/, '');
    return `${b}/`;
  }

  constructor(private http: HttpClient) {}

  /** GET baseURL + 'user/getstate/' + state */
  getStatelist(state: string): Observable<unknown> {
    return this.http.get(`${this.baseURL}user/getstate/${encodeURIComponent(state)}`);
  }

  /** GET baseURL + 'user/getcities/' + country + '/' + state */
  getcities(country: string, state: string): Observable<unknown> {
    const c = encodeURIComponent(String(country ?? '').trim());
    const s = encodeURIComponent(String(state ?? '').trim());
    return this.http.get(`${this.baseURL}user/getcities/${c}/${s}`);
  }

  /** POST baseURL + 'admin/getzonesList' — body: `{ state, city }` */
  getZonesList(payload: { state: string; city: string }): Observable<unknown> {
    return this.http.post(`${this.baseURL}admin/getzonesList`, payload);
  }

  /** POST baseURL + 'user/common/uploadFile' — FormData with `files` entries. */
  uploadCommonFiles(formData: FormData): Observable<unknown> {
    return this.http.post(`${this.baseURL}user/common/uploadFile`, formData);
  }

  /** POST baseURL + 'user/common/deleteImageFile' — body: `{ mode: string, files: any[] }`. */
  deleteCommonFiles(payload: { mode: string; files: unknown[] }): Observable<unknown> {
    return this.http.post(`${this.baseURL}user/common/deleteImageFile`, payload);
  }
}
