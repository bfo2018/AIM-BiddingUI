/**
 * Shared Kafka message contract (inbound catalog + outbound franchise lifecycle).
 */

export type FranchiseEventEntityType =
  | 'auction'
  | 'bid'
  | 'zone'
  | 'payment'
  | 'onboarding'
  | 'pincode';

export type FranchiseEventActionType =
  | 'winner_finalized'
  | 'placed'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'assigned'
  | string;

/** Standard envelope published to / consumed from healthcare.* topics */
export interface FranchiseKafkaEventEnvelope<TData = Record<string, unknown>> {
  schemaVersion: string;
  eventId: string;
  correlationId: string;
  entityType: FranchiseEventEntityType | string;
  actionType: FranchiseEventActionType;
  entityId: string;
  occurredAt: string;
  publishedAt?: string;
  source: string;
  data: TData;
}

/** Mongo document shape after Kafka serialization (_id as string, dates ISO). */
export type KafkaSerializedDocument = Record<string, unknown>;

/** schemaVersion 2.0.0 — full DB objects */
export interface AuctionWinnerFinalizedDataV2 {
  winnerUser: KafkaSerializedDocument | null;
  winnerUserRegpayment: KafkaSerializedDocument | null;
  auctionOutcomes: KafkaSerializedDocument | null;
}

/** schemaVersion 1.0.0 — legacy flat summary (Socket/UI backward compat) */
export interface AuctionWinnerFinalizedDataV1 {
  externalZoneId: string;
  auctionRoundId: number;
  outcomeStatus: AuctionOutcomeStatus;
  winnerUserId: string | null;
  winnerFranchiserId: string | null;
  winnerDisplayName: string | null;
  winnerMobile: string | null;
  winnerEmail: string | null;
  winningAmount: number;
  basePrice: number;
  minBidIncrement: number;
  totalBids: number;
  totalBidders: number;
  bidStartTime: string | null;
  bidEndTime: string | null;
  closedAt: string;
  zone: {
    name: string;
    city: string;
    state: string;
  };
}

export type AuctionOutcomeStatus = 'won' | 'no_bid' | 'cancelled';

/** UI-facing projection from v1 or v2 payload */
export interface AuctionWinnerFinalizedView {
  schemaVersion: string;
  externalZoneId: string;
  auctionRoundId: number;
  outcomeStatus: AuctionOutcomeStatus;
  winnerUserId: string | null;
  winnerDisplayName: string | null;
  winningAmount: number;
  totalBids: number;
}

export type AuctionWinnerFinalizedEvent = FranchiseKafkaEventEnvelope<
  AuctionWinnerFinalizedDataV2 | AuctionWinnerFinalizedDataV1
>;
