import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

type CreateOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
};

type VerifyPaymentPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type PaymentStatus = 'created' | 'paid' | 'failed';
type LatestPaymentResponse = {
  payment: {
    status: PaymentStatus;
    amount?: number;
    currency?: string;
    created_at?: string;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.franchiseRegistrationApiUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  createOrder(): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(`${this.baseUrl}/api/payment/create-order`, {});
  }

  verifyPayment(payload: VerifyPaymentPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/payment/verify`, payload);
  }

  getLatestPayment(): Observable<LatestPaymentResponse> {
    return this.http.get<LatestPaymentResponse>(`${this.baseUrl}/api/payment/latest`);
  }
}

