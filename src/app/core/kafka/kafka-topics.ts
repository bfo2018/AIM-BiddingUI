/**
 * Outbound franchise Kafka topics (produced by Node backend).
 * Naming: `{domain}.{actor}.{entity}.{action}` — mirrors `healthcare.admin.zone.approval`.
 */
export const FRANCHISE_KAFKA_TOPICS = {
  AUCTION_WINNER_FINALIZED: 'healthcare.franchise.auction.winner.finalized',
  BID_PLACED: 'healthcare.franchise.bid.placed',
  BID_CANCELLED: 'healthcare.franchise.bid.cancelled',
  AUCTION_COMPLETED: 'healthcare.franchise.auction.completed',
  AUCTION_FAILED: 'healthcare.franchise.auction.failed',
  ZONE_ASSIGNED: 'healthcare.franchise.zone.assigned',
  PAYMENT_COMPLETED: 'healthcare.franchise.payment.completed',
  ONBOARDING_COMPLETED: 'healthcare.franchise.onboarding.completed',
  EVENTS_DLQ: 'healthcare.franchise.events.dlq',
} as const;

export type FranchiseKafkaTopicKey = keyof typeof FRANCHISE_KAFKA_TOPICS;
