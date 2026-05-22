import type {
  AuctionOutcomeStatus,
  AuctionWinnerFinalizedDataV1,
  AuctionWinnerFinalizedDataV2,
  AuctionWinnerFinalizedView,
  KafkaSerializedDocument,
} from './kafka-event.models';

function str(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

function num(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isV2Data(data: unknown): data is AuctionWinnerFinalizedDataV2 {
  if (!data || typeof data !== 'object') return false;
  return (
    'auctionOutcomes' in data ||
    'winnerUser' in data ||
    'winnerUserRegpayment' in data
  );
}

function displayNameFromUser(user: KafkaSerializedDocument | null): string | null {
  if (!user) return null;
  const pi = user['personalInfo'];
  if (!pi || typeof pi !== 'object') return null;
  const p = pi as Record<string, unknown>;
  const first = str(p['firstName']);
  const last = str(p['lastName']);
  const name = `${first} ${last}`.trim();
  return name || null;
}

function deriveOutcomeStatus(outcome: KafkaSerializedDocument | null): AuctionOutcomeStatus {
  if (!outcome) return 'no_bid';
  const winnerId = str(outcome['winner_user_id']);
  const winningAmount = num(outcome['winning_amount']);
  const totalBids = num(outcome['total_bids']);
  if (winnerId && (winningAmount > 0 || totalBids > 0)) return 'won';
  return 'no_bid';
}

/**
 * Normalize v1 flat or v2 full-document Kafka payloads for UI consumers.
 */
export function toAuctionWinnerFinalizedView(
  schemaVersion: string,
  data: unknown,
  entityId: string
): AuctionWinnerFinalizedView | null {
  if (isV2Data(data)) {
    const o = data.auctionOutcomes;
    const externalZoneId = str(o?.['external_zone_id']) || entityId;
    if (!externalZoneId) return null;

    return {
      schemaVersion,
      externalZoneId,
      auctionRoundId: num(o?.['auction_round_id'], 1),
      outcomeStatus: deriveOutcomeStatus(o),
      winnerDisplayName: displayNameFromUser(data.winnerUser),
      winningAmount: num(o?.['winning_amount']),
    };
  }

  const d = data as AuctionWinnerFinalizedDataV1;
  if (!d || typeof d !== 'object') return null;
  const externalZoneId = str(d.externalZoneId) || entityId;
  if (!externalZoneId) return null;

  return {
    schemaVersion,
    externalZoneId,
    auctionRoundId: num(d.auctionRoundId, 1),
    outcomeStatus: d.outcomeStatus ?? 'no_bid',
    winnerDisplayName: d.winnerDisplayName ?? null,
    winningAmount: num(d.winningAmount),
  };
}
