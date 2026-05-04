import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export type KpiCard = {
  icon: string;
  title: string;
  value: string;
  trend: string;
  trendLabel: string;
  trendUp: boolean;
};

export type LiveBidEvent = {
  id: string;
  message: string;
  timeLabel: string;
  isHighlight?: boolean;
};

export type ActiveZoneRow = {
  name: string;
  currentBid: string;
  timeLeft: string;
  status: 'active' | 'closing';
};

export type RecentUserRow = {
  name: string;
  location: string;
  status: 'active' | 'pending' | 'verified';
};

export type ActivityRow = {
  action: string;
  user: string;
  zone: string;
  time: string;
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: false,
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements AfterViewInit, OnDestroy {
  @ViewChild('bidsTrendCanvas')
  bidsTrendCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('zoneBarCanvas')
  zoneBarCanvas?: ElementRef<HTMLCanvasElement>;

  readonly pageTitle = 'Dashboard';
  readonly pageSubtitle = 'Overview of platform activity and performance';

  filterPeriod: '7d' | '30d' | '90d' = '30d';

  readonly kpis: KpiCard[] = [
    {
      icon: 'groups',
      title: 'Total Users',
      value: '1,248',
      trend: '+12%',
      trendLabel: 'this week',
      trendUp: true,
    },
    {
      icon: 'storefront',
      title: 'Active Franchise Users',
      value: '892',
      trend: '+4.2%',
      trendLabel: 'this week',
      trendUp: true,
    },
    {
      icon: 'map',
      title: 'Total Zones',
      value: '54',
      trend: '+3',
      trendLabel: 'new zones',
      trendUp: true,
    },
    {
      icon: 'location_on',
      title: 'Active Zones',
      value: '41',
      trend: 'Stable',
      trendLabel: 'vs last week',
      trendUp: true,
    },
    {
      icon: 'gavel',
      title: 'Total Bids Placed',
      value: '3,284',
      trend: '+18%',
      trendLabel: 'this week',
      trendUp: true,
    },
    {
      icon: 'payments',
      title: 'Revenue (est.)',
      value: '₹5,42,180',
      trend: '+9.1%',
      trendLabel: 'this week',
      trendUp: true,
    },
  ];

  liveFeed: LiveBidEvent[] = [
    {
      id: '1',
      message: 'New bid placed on Pune East Prime',
      timeLabel: '2 min ago',
      isHighlight: true,
    },
    {
      id: '2',
      message: 'Ravi Infra increased bid on Hyderabad West Hub',
      timeLabel: '6 min ago',
    },
    {
      id: '3',
      message: 'Auto-bid triggered for Bengaluru Central Belt',
      timeLabel: '11 min ago',
    },
    {
      id: '4',
      message: 'User Mehta Logistics joined watchlist — Ahmedabad North',
      timeLabel: '18 min ago',
    },
    {
      id: '5',
      message: 'Counter-offer received — Mumbai Coastal Fringe',
      timeLabel: '24 min ago',
    },
  ];

  readonly activeZones: ActiveZoneRow[] = [
    {
      name: 'Pune East Prime',
      currentBid: '₹18,40,000',
      timeLeft: '2h 14m',
      status: 'active',
    },
    {
      name: 'Hyderabad West Hub',
      currentBid: '₹22,10,500',
      timeLeft: '45m',
      status: 'closing',
    },
    {
      name: 'Bengaluru Central Belt',
      currentBid: '₹31,05,999',
      timeLeft: '5h 02m',
      status: 'active',
    },
    {
      name: 'Ahmedabad North',
      currentBid: '₹9,75,250',
      timeLeft: '28m',
      status: 'closing',
    },
    {
      name: 'Mumbai Coastal Fringe',
      currentBid: '₹45,90,000',
      timeLeft: '1d 3h',
      status: 'active',
    },
  ];

  usersTotal = 1248;
  usersNewThisWeek = 86;

  readonly recentUsers: RecentUserRow[] = [
    { name: 'Ananya Patel', location: 'Pune, MH', status: 'verified' },
    { name: 'Ravi Infra Pvt Ltd', location: 'Hyderabad, TS', status: 'active' },
    { name: 'Mehta Logistics', location: 'Ahmedabad, GJ', status: 'pending' },
    { name: 'Coastal Freight Co.', location: 'Mumbai, MH', status: 'verified' },
    { name: 'Southline Retail', location: 'Bengaluru, KA', status: 'active' },
  ];

  readonly activityLog: ActivityRow[] = [
    {
      action: 'Placed bid',
      user: 'Ravi Infra',
      zone: 'Hyderabad West Hub',
      time: 'Today, 14:32',
    },
    {
      action: 'Registered user',
      user: 'Ananya Patel',
      zone: '—',
      time: 'Today, 12:05',
    },
    {
      action: 'Zone updated',
      user: 'System',
      zone: 'Pune East Prime',
      time: 'Today, 09:41',
    },
    {
      action: 'Placed bid',
      user: 'Mehta Logistics',
      zone: 'Ahmedabad North',
      time: 'Yesterday, 18:22',
    },
    {
      action: 'Document verified',
      user: 'Coastal Freight Co.',
      zone: '—',
      time: 'Yesterday, 16:08',
    },
  ];

  private lineChart?: Chart;
  private barChart?: Chart;
  private bidsTrendBaseline: number[] = [120, 190, 240, 210, 320, 280, 340];
  private zoneBidsBaseline: number[] = [420, 380, 510, 290, 610, 340];
  private liveTickerId?: ReturnType<typeof setInterval>;
  private nextFeedId = 100;
  private readonly feedTemplates = [
    'New bid placed on {zone}',
    '{user} increased bid on {zone}',
    'Watchlist activity spike — {zone}',
    'Reserve price met — {zone}',
  ];
  private readonly feedZones = [
    'Pune East Prime',
    'Hyderabad West Hub',
    'Bengaluru Central Belt',
    'Ahmedabad North',
    'Mumbai Coastal Fringe',
    'Chennai South Bay',
  ];
  private readonly feedUsers = [
    'Ravi Infra',
    'Mehta Logistics',
    'Coastal Freight',
    'Southline Retail',
    'Peak Bidworks',
  ];

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.initCharts();
    });
    this.liveTickerId = setInterval(() => this.pushDummyLiveEvent(), 10000);
  }

  ngOnDestroy(): void {
    if (this.liveTickerId) {
      clearInterval(this.liveTickerId);
    }
    this.lineChart?.destroy();
    this.barChart?.destroy();
  }

  onFilterChange(): void {
    this.refreshChartsData();
  }

  trackByFeedId(_: number, item: LiveBidEvent): string {
    return item.id;
  }

  private initCharts(): void {
    const lineEl = this.bidsTrendCanvas?.nativeElement;
    const barEl = this.zoneBarCanvas?.nativeElement;
    if (!lineEl || !barEl) return;

    const labels7 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const bids7 = [...this.bidsTrendBaseline];
    const labelsZones = [
      'Pune E.',
      'Hyd W.',
      'BLR C.',
      'AHM N.',
      'MUM C.',
      'CHN S.',
    ];
    const zoneBids = [...this.zoneBidsBaseline];

    this.lineChart?.destroy();
    this.lineChart = new Chart(lineEl, {
      type: 'line',
      data: {
        labels: labels7,
        datasets: [
          {
            label: 'Bids',
            data: bids7,
            borderColor: '#2383e2',
            backgroundColor: 'rgba(35, 131, 226, 0.12)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#2383e2',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: 'easeOutQuart',
        },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            padding: 10,
            cornerRadius: 8,
            titleFont: { size: 12 },
            bodyFont: { size: 13 },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 11 } },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(15, 23, 42, 0.06)' },
            ticks: { color: '#64748b', font: { size: 11 } },
            border: { display: false },
          },
        },
      },
    });

    this.barChart?.destroy();
    this.barChart = new Chart(barEl, {
      type: 'bar',
      data: {
        labels: labelsZones,
        datasets: [
          {
            label: 'Bids',
            data: zoneBids,
            backgroundColor: [
              'rgba(35, 131, 226, 0.85)',
              'rgba(35, 131, 226, 0.7)',
              'rgba(35, 131, 226, 0.9)',
              'rgba(35, 131, 226, 0.55)',
              'rgba(35, 131, 226, 0.95)',
              'rgba(35, 131, 226, 0.65)',
            ],
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 850,
          easing: 'easeOutQuart',
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 11 } },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(15, 23, 42, 0.06)' },
            ticks: { color: '#64748b', font: { size: 11 } },
            border: { display: false },
          },
        },
      },
    });
  }

  private refreshChartsData(): void {
    if (!this.lineChart || !this.barChart) return;
    const factor =
      this.filterPeriod === '7d' ? 0.78 : this.filterPeriod === '90d' ? 1.22 : 1;
    this.lineChart.data.datasets[0].data = this.bidsTrendBaseline.map((v) =>
      Math.round(v * factor + (Math.random() * 10 - 5))
    );
    this.lineChart.update();
    this.barChart.data.datasets[0].data = this.zoneBidsBaseline.map((v) =>
      Math.round(v * factor * (0.96 + Math.random() * 0.08))
    );
    this.barChart.update();
  }

  private pushDummyLiveEvent(): void {
    const zone =
      this.feedZones[Math.floor(Math.random() * this.feedZones.length)] ?? '';
    const user =
      this.feedUsers[Math.floor(Math.random() * this.feedUsers.length)] ?? '';
    const tpl =
      this.feedTemplates[Math.floor(Math.random() * this.feedTemplates.length)] ??
      '';
    const message = tpl.replace('{zone}', zone).replace('{user}', user);
    const entry: LiveBidEvent = {
      id: String(this.nextFeedId++),
      message,
      timeLabel: 'Just now',
      isHighlight: Math.random() > 0.65,
    };
    this.liveFeed = [entry, ...this.liveFeed].slice(0, 8);
    const shifted = this.liveFeed.map((e, i) =>
      i === 0 ? e : { ...e, timeLabel: this.offsetTimeLabel(i) }
    );
    this.liveFeed = shifted;
  }

  private offsetTimeLabel(index: number): string {
    if (index === 1) return '1 min ago';
    if (index === 2) return '3 min ago';
    if (index === 3) return '8 min ago';
    if (index === 4) return '14 min ago';
    return `${index * 5} min ago`;
  }
}
