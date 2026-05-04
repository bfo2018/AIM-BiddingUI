import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from './token-storage.service';

export type BiddingSocketRole = 'franchise' | 'admin';

@Injectable({ providedIn: 'root' })
export class BiddingRealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  /** Last role used for `connect` — `reconnectWithLatestToken` preserves it. */
  private lastConnectRole: BiddingSocketRole = 'franchise';
  private pendingConnectRole: BiddingSocketRole | null = null;
  private tokenRetryTimer?: ReturnType<typeof setTimeout>;
  private readonly connectedSubject = new BehaviorSubject<boolean>(false);

  /** Component-facing stream of socket connection state. */
  readonly connected$: Observable<boolean> = this.connectedSubject.asObservable();

  constructor(private readonly tokens: TokenStorageService) {}

  /**
   * Connect (or return existing) authenticated Socket.IO client.
   * Use `role: 'admin'` for admin screens (JWT from `getAdminToken()`).
   */
  connect(options?: { role?: BiddingSocketRole }): Socket | null {
    const role = options?.role ?? 'franchise';
    this.lastConnectRole = role;
    const token =
      role === 'admin' ? this.tokens.getAdminToken() : this.tokens.getFranchiseToken();
    if (!token) {
      this.pendingConnectRole = role;
      this.connectedSubject.next(false);
      this.scheduleTokenRetry();
      console.debug('[bidding-realtime] token missing, retrying connect', { role });
      return this.socket;
    }
    this.pendingConnectRole = null;
    if (this.tokenRetryTimer) {
      clearTimeout(this.tokenRetryTimer);
      this.tokenRetryTimer = undefined;
    }

    if (this.socket && this.lastConnectRole === role) {
      this.socket.auth = { token };
      if (!this.socket.connected && !this.socket.active) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.disconnect();
    const url = environment.biddingSocketUrl.replace(/\/$/, '');
    const socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    // Service owns connection state; components subscribe to `connected$`.
    socket.on('connect', () => {
      console.debug('[bidding-realtime] connected', { role, id: socket.id });
      this.connectedSubject.next(true);
    });
    socket.on('disconnect', (reason: string) => {
      console.debug('[bidding-realtime] disconnected', { role, reason });
      this.connectedSubject.next(false);
    });
    socket.on('connect_error', (err: Error) => {
      console.debug('[bidding-realtime] connect_error', { role, message: err?.message });
      this.connectedSubject.next(false);
      this.pendingConnectRole = role;
      this.scheduleTokenRetry();
    });

    this.socket = socket;
    return this.socket;
  }

  reconnectWithLatestToken(): Socket | null {
    this.disconnect();
    return this.connect({ role: this.lastConnectRole });
  }

  getClient(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  getLastConnectRole(): BiddingSocketRole {
    return this.lastConnectRole;
  }

  disconnect(): void {
    this.pendingConnectRole = null;
    if (this.tokenRetryTimer) {
      clearTimeout(this.tokenRetryTimer);
      this.tokenRetryTimer = undefined;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connectedSubject.next(false);
    }
  }

  private scheduleTokenRetry(): void {
    if (this.tokenRetryTimer) return;
    this.tokenRetryTimer = setTimeout(() => {
      this.tokenRetryTimer = undefined;
      const role = this.pendingConnectRole;
      if (!role) return;
      const token =
        role === 'admin' ? this.tokens.getAdminToken() : this.tokens.getFranchiseToken();
      if (!token) {
        this.scheduleTokenRetry();
        return;
      }
      console.debug('[bidding-realtime] token available, connecting', { role });
      this.connect({ role });
    }, 800);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
