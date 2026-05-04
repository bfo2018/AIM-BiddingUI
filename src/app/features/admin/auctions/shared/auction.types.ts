export type ZoneStatus = 'not_configured' | 'configured' | 'active' | 'closed';

export type ExternalZone = {
  id: string;
  name: string;
  state: string;
  city: string;
  pincodes: string[];
  areaNames: string[];
  status: ZoneStatus;
  configuredAt?: string;
  /** Base / reserve from API (`amount_charge`) — used for `join-zone`. */
  amountCharge?: number;
  /** Latest bid snapshot from Socket.IO (`bid-updated`), when connected. */
  liveHighestBid?: number;
  liveBiddersCount?: number;
  liveBidsCount?: number;
  liveLastBidAt?: number;
};

/** Bulk auction settings (start/end/min increment). Base price is per zone (`amount_charge` / `amountCharge`). */
export type AuctionConfig = {
  startDateTime: string;
  endDateTime: string;
  minIncrement: number;
};

export type LiveAuction = {
  id: string;
  zoneId: string;
  zoneName: string;
  city: string;
  state: string;
  currentBid: number;
  basePrice: number;
  minIncrement: number;
  totalBidders: number;
  totalBids: number;
  startedAt: string;
  endsAt: string;
  status: 'scheduled' | 'active' | 'closing_soon' | 'paused' | 'extended' | 'closed';
  topBidder: string;
  recentBidAt: string;
};

export type AuctionHistoryRecord = {
  id: string;
  zoneId: string;
  zoneName: string;
  city: string;
  state: string;
  winner: string;
  winnerMobile: string;
  finalBid: number;
  basePrice: number;
  totalBids: number;
  totalBidders: number;
  startedAt: string;
  closedAt: string;
  durationMinutes: number;
  status: 'won' | 'no_bid' | 'cancelled';
};

export type AuctionGlobalConfig = {
  defaultDurationMinutes: number;
  minIncrementDefault: number;
  autoExtendEnabled: boolean;
  autoExtendMinutes: number;
  autoExtendOnBidWithin: number;
  maxExtensions: number;
  reminderBeforeCloseMinutes: number;
  /** Set when loaded from API (optional). */
  updatedAt?: string;
};
