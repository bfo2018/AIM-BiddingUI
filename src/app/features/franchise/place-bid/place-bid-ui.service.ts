import { Injectable } from '@angular/core';
import { TokenStorageService } from '../../../core/services/token-storage.service';

/**
 * Lightweight UI helpers for place-bid (user identity for realtime toasts, optional tick sound).
 * Keeps feedback/audio out of socket plumbing.
 */
@Injectable({ providedIn: 'root' })
export class PlaceBidUiService {
  constructor(private readonly tokens: TokenStorageService) {}

  /** Match backend JWT payload (nested user + common top-level id fields). */
  getFranchiseUserId(): string | null {
    const t = this.tokens.getFranchiseToken();
    if (!t) return null;
    const payload = this.parseJwtBody(t);
    if (!payload) return null;
    const u = payload['user'] as Record<string, unknown> | undefined;
    if (u && typeof u === 'object' && !Array.isArray(u)) {
      const nested = u['user'] as Record<string, unknown> | undefined;
      const id =
        u['_id'] ??
        u['id'] ??
        u['userId'] ??
        u['user_id'] ??
        (nested && typeof nested === 'object' ? nested['_id'] ?? nested['id'] : undefined);
      const s = this.coalesceJwtId(id);
      if (s) return s;
    }
    const top =
      payload['_id'] ??
      payload['id'] ??
      payload['userId'] ??
      payload['user_id'] ??
      payload['sub'];
    return this.coalesceJwtId(top);
  }

  sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
    if (a == null || b == null) return false;
    return String(a).trim() === String(b).trim();
  }

  /**
   * Quiet tick for other users' bids. Tries `assets/sounds/bid.mp3` then Web Audio fallback.
   */
  playOtherBidTick(): void {
    try {
      const audio = new Audio('assets/sounds/bid.mp3');
      audio.volume = 0.22;
      const p = audio.play();
      if (p !== undefined) {
        p.catch(() => this.playWebAudioTick());
      }
    } catch {
      this.playWebAudioTick();
    }
  }

  private playWebAudioTick(): void {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.035;
      o.frequency.value = 920;
      o.type = 'sine';
      o.start();
      const stop = () => {
        try {
          o.stop();
          void ctx.close();
        } catch {
          /* noop */
        }
      };
      window.setTimeout(stop, 70);
    } catch {
      /* noop */
    }
  }

  private coalesceJwtId(raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const s = String(raw).trim();
      return s || null;
    }
    if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
      const oid = (raw as { $oid: unknown }).$oid;
      if (oid == null) return null;
      const s = String(oid).trim();
      return s || null;
    }
    return null;
  }

  private parseJwtBody(token: string): Record<string, unknown> | null {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
      const json = atob(base64 + pad);
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
