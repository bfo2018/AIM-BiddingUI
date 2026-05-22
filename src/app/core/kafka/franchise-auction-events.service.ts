import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import type { Socket } from 'socket.io-client';
import {
  AuctionWinnerFinalizedEvent,
  AuctionWinnerFinalizedView,
} from './kafka-event.models';
import { toAuctionWinnerFinalizedView } from './auction-winner-payload.util';

function normalizeEntityId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    const oid = (raw as { $oid: unknown }).$oid;
    return oid != null ? String(oid).trim() : '';
  }
  return '';
}

/**
 * Socket.IO bridge for franchise lifecycle events (Kafka → Node → browser).
 * Angular does not produce Kafka; it consumes real-time mirrors from the backend.
 */
@Injectable({ providedIn: 'root' })
export class FranchiseAuctionEventsService implements OnDestroy {
  private readonly winnerFinalizedSubject = new Subject<AuctionWinnerFinalizedEvent>();
  private attachedSocket: Socket | null = null;

  /** Raw envelope (v1 or v2 data). */
  readonly auctionWinnerFinalized$: Observable<AuctionWinnerFinalizedEvent> =
    this.winnerFinalizedSubject.asObservable();

  /** Normalized projection for UI (supports schema 1.x and 2.x). */
  readonly auctionWinnerFinalizedView$: Observable<AuctionWinnerFinalizedView> =
    this.auctionWinnerFinalized$.pipe(
      map((evt) => this.toView(evt)),
      filter((v): v is AuctionWinnerFinalizedView => v != null)
    );

  forZone(externalZoneId: string): Observable<AuctionWinnerFinalizedView> {
    const want = normalizeEntityId(externalZoneId);
    return this.auctionWinnerFinalizedView$.pipe(
      filter((v) => normalizeEntityId(v.externalZoneId) === want)
    );
  }

  attachSocket(sock: Socket | null): void {
    if (this.attachedSocket === sock) return;
    this.detachSocket();
    if (!sock) return;

    this.attachedSocket = sock;
    sock.off('auction-winner-finalized');
    sock.on('auction-winner-finalized', (raw: unknown) => {
      const parsed = this.parseWinnerFinalized(raw);
      if (parsed) this.winnerFinalizedSubject.next(parsed);
    });
  }

  detachSocket(): void {
    if (this.attachedSocket) {
      this.attachedSocket.off('auction-winner-finalized');
      this.attachedSocket = null;
    }
  }

  parseWinnerFinalized(raw: unknown): AuctionWinnerFinalizedEvent | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const dataRaw = o['data'];
    if (!dataRaw || typeof dataRaw !== 'object') return null;

    const entityId = normalizeEntityId(o['entityId']);
    const schemaVersion = String(o['schemaVersion'] ?? '2.0.0');

    const view = toAuctionWinnerFinalizedView(schemaVersion, dataRaw, entityId);
    if (!view) return null;

    return {
      schemaVersion,
      eventId: String(o['eventId'] ?? ''),
      correlationId: String(o['correlationId'] ?? ''),
      entityType: String(o['entityType'] ?? 'auction'),
      actionType: String(o['actionType'] ?? 'winner_finalized'),
      entityId: entityId || view.externalZoneId,
      occurredAt: String(o['occurredAt'] ?? new Date().toISOString()),
      publishedAt: o['publishedAt'] != null ? String(o['publishedAt']) : undefined,
      source: String(o['source'] ?? 'franchise-bidding-platform'),
      data: dataRaw as AuctionWinnerFinalizedEvent['data'],
    };
  }

  toView(evt: AuctionWinnerFinalizedEvent): AuctionWinnerFinalizedView | null {
    return toAuctionWinnerFinalizedView(evt.schemaVersion, evt.data, evt.entityId);
  }

  ngOnDestroy(): void {
    this.detachSocket();
    this.winnerFinalizedSubject.complete();
  }
}
