import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuctionHistoryRecord } from '../shared/auction.types';

const SEED_HISTORY: AuctionHistoryRecord[] = [
  { id: 'h1', zoneId: 'z1', zoneName: 'Pune East Prime', city: 'Pune', state: 'Maharashtra', winner: 'Ananya Patel', winnerMobile: '9876543210', finalBid: 2040000, basePrice: 1500000, totalBids: 38, totalBidders: 12, startedAt: '2026-04-01T10:00:00', closedAt: '2026-04-07T18:00:00', durationMinutes: 8880, status: 'won' },
  { id: 'h2', zoneId: 'z3', zoneName: 'Bengaluru Central Belt', city: 'Bengaluru', state: 'Karnataka', winner: 'Southline Retail', winnerMobile: '9011223344', finalBid: 3870000, basePrice: 3000000, totalBids: 62, totalBidders: 19, startedAt: '2026-03-28T09:00:00', closedAt: '2026-04-04T17:00:00', durationMinutes: 11280, status: 'won' },
  { id: 'h3', zoneId: 'z6', zoneName: 'Ahmedabad North', city: 'Ahmedabad', state: 'Gujarat', winner: '—', winnerMobile: '—', finalBid: 0, basePrice: 800000, totalBids: 0, totalBidders: 0, startedAt: '2026-03-20T10:00:00', closedAt: '2026-03-27T10:00:00', durationMinutes: 10080, status: 'no_bid' },
  { id: 'h4', zoneId: 'z8', zoneName: 'Kolkata East Reach', city: 'Kolkata', state: 'West Bengal', winner: '—', winnerMobile: '—', finalBid: 0, basePrice: 600000, totalBids: 0, totalBidders: 0, startedAt: '2026-03-15T11:00:00', closedAt: '2026-03-18T09:00:00', durationMinutes: 4080, status: 'cancelled' },
  { id: 'h5', zoneId: 'z5', zoneName: 'Hyderabad West Hub', city: 'Hyderabad', state: 'Telangana', winner: 'Alpha Ventures', winnerMobile: '9334455667', finalBid: 1760000, basePrice: 1200000, totalBids: 29, totalBidders: 9, startedAt: '2026-03-10T10:00:00', closedAt: '2026-03-17T18:00:00', durationMinutes: 10080, status: 'won' },
  { id: 'h6', zoneId: 'z9', zoneName: 'Jaipur Heritage Corridor', city: 'Jaipur', state: 'Rajasthan', winner: 'NextGen Infra', winnerMobile: '9876001234', finalBid: 2290000, basePrice: 2000000, totalBids: 17, totalBidders: 7, startedAt: '2026-03-05T10:00:00', closedAt: '2026-03-12T18:00:00', durationMinutes: 10080, status: 'won' },
];

@Component({
  selector: 'app-auction-history',
  standalone: false,
  templateUrl: './auction-history.html',
  styleUrl: './auction-history.scss',
})
export class AuctionHistoryComponent implements OnInit {
  records: AuctionHistoryRecord[] = SEED_HISTORY.map(r => ({ ...r }));

  filterStatus: 'all' | 'won' | 'no_bid' | 'cancelled' = 'all';
  filterState = '';
  filterSearch = '';
  filterFromDate = '';
  filterToDate = '';

  expandedId: string | null = null;

  ngOnInit(): void {}

  get uniqueStates(): string[] {
    return [...new Set(this.records.map(r => r.state))].sort();
  }

  get filteredRecords(): AuctionHistoryRecord[] {
    const q = this.filterSearch.trim().toLowerCase();
    return this.records.filter(r => {
      const byStatus = this.filterStatus === 'all' || r.status === this.filterStatus;
      const byState  = !this.filterState || r.state === this.filterState;
      const bySearch = !q || r.zoneName.toLowerCase().includes(q) || r.winner.toLowerCase().includes(q) || r.city.toLowerCase().includes(q);
      const byFrom   = !this.filterFromDate || new Date(r.closedAt) >= new Date(this.filterFromDate);
      const byTo     = !this.filterToDate   || new Date(r.closedAt) <= new Date(this.filterToDate + 'T23:59:59');
      return byStatus && byState && bySearch && byFrom && byTo;
    });
  }

  get wonCount():     number { return this.records.filter(r => r.status === 'won').length; }
  get noBidCount():   number { return this.records.filter(r => r.status === 'no_bid').length; }
  get cancelledCount(): number { return this.records.filter(r => r.status === 'cancelled').length; }
  get totalRevenue(): number {
    return this.records.filter(r => r.status === 'won').reduce((s, r) => s + r.finalBid, 0);
  }

  resetFilters(): void {
    this.filterStatus = 'all';
    this.filterState = '';
    this.filterSearch = '';
    this.filterFromDate = '';
    this.filterToDate = '';
  }

  toggleExpand(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
  }

  fmtCurrency(n: number): string {
    return n === 0 ? '—' : `₹${n.toLocaleString('en-IN')}`;
  }

  fmtDuration(mins: number): string {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    return parts.join(' ') || '< 1h';
  }

  statusLabel(s: AuctionHistoryRecord['status']): string {
    if (s === 'won') return 'Won';
    if (s === 'no_bid') return 'No Bid';
    return 'Cancelled';
  }

  trackByRecord(_: number, r: AuctionHistoryRecord): string { return r.id; }
}
