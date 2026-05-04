import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../../../core/services/data.service';

/** POST body for admin zones list (API shape may extend later). */
export type GetZonesListPayload = {
  state: string;
  city: string;
};

@Injectable({ providedIn: 'root' })
export class PlaceBidZonesService {
  constructor(private dataService: DataService) {}

  getStateList(country: string): Observable<unknown> {
    return this.dataService.getStatelist(country);
  }

  getCities(country: string, state: string): Observable<unknown> {
    return this.dataService.getcities(country, state);
  }

  getZonesList(payload: GetZonesListPayload): Observable<unknown> {
    return this.dataService.getZonesList(payload);
  }
}
