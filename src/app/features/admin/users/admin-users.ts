import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import {
  UserBidEvent,
  UserDetailsDialogComponent,
  UserRecord,
} from './user-details-dialog.component';
import { AdminUsersService, AdminUsersStats } from './admin-users.service';

type ApplicationFilter = 'all' | 'not_started' | 'in_progress' | 'completed';
type PaymentFilter = 'all' | 'pending' | 'paid';
type EligibilityFilter = 'all' | 'eligible' | 'not_eligible';
type DurationPreset =
  | 'till_now'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'custom';

type AppliedFilterTag = {
  id: string;
  label: string;
  value: string;
};

@Component({
  selector: 'app-admin-users',
  standalone: false,
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers {
  readonly pageToolbarSubtitle = 'Manage franchise users, onboarding, payments, and bidding access.';
  searchQuery = '';
  durationPreset: DurationPreset = 'till_now';
  /** Compact inline stats row vs expanded stats bar (only one visible). */
  statsLayoutMode: 'inline' | 'bar' = 'inline';
  filterPanelOpen = false;
  applicationFilter: ApplicationFilter = 'all';
  paymentFilter: PaymentFilter = 'all';
  eligibilityFilter: EligibilityFilter = 'all';
  fromDate = '';
  toDate = '';

  currentPage = 1;
  readonly pageSize = 8;
  readonly pageSizeOptions = [8, 12, 20];
  loading = false;
  private readonly destroy$ = new Subject<void>();
  private fetchSeq = 0;
  private firstLoadRetryCount = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;

  updatedUserIds = new Set<string>();
  users: UserRecord[] = [];
  stats: AdminUsersStats = {
    totalUsers: 0,
    applicationsInProgress: 0,
    pendingFee: 0,
    paidFees: 0,
    eligibleCount: 0,
  };

  constructor(
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
    private readonly adminUsersService: AdminUsersService,
    private readonly router: Router,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.fetchUsers();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects.includes('/admin/users')) {
          this.fetchUsers();
        }
      });
  }

  ngOnDestroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private scheduleViewUpdate(fn: () => void): void {
    Promise.resolve().then(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          fn();
          this.cdr.detectChanges();
        });
      }, 0);
    });
  }

  get totalFilteredUsers(): number {
    return this.filteredUsers.length;
  }

  get toolbarBadgeText(): string {
    return `${this.totalFilteredUsers} Franchise Users`;
  }

  /** Shared metrics for both compact inline and expanded stats bar. */
  get statBarItems(): {
    icon: string;
    num: string;
    label: string;
    tone: 'blue' | 'amber' | 'teal' | 'green' | 'purple';
  }[] {
    return [
      { icon: 'list_alt', num: String(this.stats.totalUsers), label: 'Total users', tone: 'blue' },
      {
        icon: 'schedule',
        num: String(this.stats.applicationsInProgress),
        label: 'Applications',
        tone: 'amber',
      },
      {
        icon: 'hourglass_top',
        num: `₹${this.stats.pendingFee.toLocaleString('en-IN')}`,
        label: 'Pending fee',
        tone: 'teal',
      },
      {
        icon: 'account_balance_wallet',
        num: `₹${this.stats.paidFees.toLocaleString('en-IN')}`,
        label: 'Paid fees',
        tone: 'green',
      },
      { icon: 'verified', num: String(this.stats.eligibleCount), label: 'Eligible', tone: 'purple' },
    ];
  }

  toggleStatsLayout(): void {
    this.statsLayoutMode = this.statsLayoutMode === 'inline' ? 'bar' : 'inline';
  }

  get appliedFilterTags(): AppliedFilterTag[] {
    const tags: AppliedFilterTag[] = [];
    const q = this.searchQuery.trim();
    if (q) tags.push({ id: 'search', label: 'Search', value: q });
    if (this.applicationFilter !== 'all') {
      tags.push({ id: 'application', label: 'Application', value: this.appStatusLabel(this.applicationFilter) });
    }
    if (this.paymentFilter !== 'all') {
      tags.push({ id: 'payment', label: 'Payment', value: this.paymentLabel(this.paymentFilter) });
    }
    if (this.eligibilityFilter !== 'all') {
      tags.push({
        id: 'eligibility',
        label: 'Eligibility',
        value: this.eligibilityLabel(this.eligibilityFilter),
      });
    }
    if (this.durationPreset !== 'till_now') {
      const dv =
        this.durationPreset === 'custom'
          ? `${this.fromDate || '…'} → ${this.toDate || '…'}`
          : this.durationLabel(this.durationPreset);
      tags.push({ id: 'duration', label: 'Duration', value: dv });
    }
    return tags;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalFilteredUsers / this.pageSize));
  }

  get pagedUsers(): UserRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get filteredUsers(): UserRecord[] {
    return this.users;
  }

  onFiltersChanged(): void {
    this.currentPage = 1;
    this.fetchUsers();
  }

  onDurationChange(): void {
    const fmt = (d: Date) => {
      const p2 = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    };
    const now = new Date();
    if (this.durationPreset === 'till_now') {
      this.fromDate = '';
      this.toDate = '';
      this.onFiltersChanged();
      return;
    }
    if (this.durationPreset === 'custom') {
      this.onFiltersChanged();
      return;
    }
    if (this.durationPreset === 'today') {
      this.fromDate = fmt(now);
      this.toDate = fmt(now);
    } else if (this.durationPreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      this.fromDate = fmt(y);
      this.toDate = fmt(y);
    } else if (this.durationPreset === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      this.fromDate = fmt(start);
      this.toDate = fmt(now);
    } else if (this.durationPreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      this.fromDate = fmt(start);
      this.toDate = fmt(now);
    }
    this.onFiltersChanged();
  }

  openFilterPanel(): void {
    this.filterPanelOpen = true;
  }

  closeFilterPanel(): void {
    this.filterPanelOpen = false;
  }

  applyFilterPanel(): void {
    this.onFiltersChanged();
    this.closeFilterPanel();
  }

  /** Apply custom joined-date range from the toolbar (explicit Search). */
  applyCustomDateSearch(): void {
    this.onFiltersChanged();
    this.snackBar.open('Custom date range applied', 'Close', { duration: 1800 });
  }

  /** Clear custom dates; list updates with no date restriction while Custom remains selected. */
  clearCustomDateRange(): void {
    this.fromDate = '';
    this.toDate = '';
    this.onFiltersChanged();
  }

  refreshTable(): void {
    this.fetchUsers(true);
  }

  removeAppliedFilter(id: string): void {
    if (id === 'search') this.searchQuery = '';
    if (id === 'application') this.applicationFilter = 'all';
    if (id === 'payment') this.paymentFilter = 'all';
    if (id === 'eligibility') this.eligibilityFilter = 'all';
    if (id === 'duration') {
      this.durationPreset = 'till_now';
      this.fromDate = '';
      this.toDate = '';
    }
    this.onFiltersChanged();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.applicationFilter = 'all';
    this.paymentFilter = 'all';
    this.eligibilityFilter = 'all';
    this.fromDate = '';
    this.toDate = '';
    this.durationPreset = 'till_now';
    this.currentPage = 1;
    this.fetchUsers();
  }

  get todayOptionLabel(): string {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  get yesterdayOptionLabel(): string {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return y.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  durationLabel(preset: DurationPreset): string {
    const map: Record<DurationPreset, string> = {
      till_now: 'Till now',
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'Current week',
      month: 'Current month',
      custom: 'Custom',
    };
    return map[preset];
  }

  goToPrevPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  goToNextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  openUserDetails(user: UserRecord): void {
    this.dialog.open(UserDetailsDialogComponent, {
      width: '920px',
      maxWidth: '95vw',
      data: {
        user,
        bidHistory: [] as UserBidEvent[],
      },
    });
  }

  approveUser(user: UserRecord): void {
    if (user.reviewStatus === 'approved') {
      this.snackBar.open(`${user.name} is already approved`, 'Close', { duration: 1800 });
      return;
    }
    this.adminUsersService.reviewUser(user.id, 'approve').subscribe({
      next: () => {
        this.highlightUser(user.id);
        this.snackBar.open(`${user.name} approved`, 'Close', { duration: 2200 });
        this.fetchUsers();
      },
      error: () => {
        this.snackBar.open(`Unable to approve ${user.name}`, 'Close', { duration: 2200 });
      },
    });
  }

  rejectUser(user: UserRecord): void {
    if (user.reviewStatus === 'rejected') {
      this.snackBar.open(`${user.name} is already rejected`, 'Close', { duration: 1800 });
      return;
    }
    this.adminUsersService.reviewUser(user.id, 'reject').subscribe({
      next: () => {
        this.highlightUser(user.id);
        this.snackBar.open(`${user.name} rejected`, 'Close', { duration: 2200 });
        this.fetchUsers();
      },
      error: () => {
        this.snackBar.open(`Unable to reject ${user.name}`, 'Close', { duration: 2200 });
      },
    });
  }

  appStatusLabel(status: UserRecord['applicationStatus']): string {
    if (status === 'completed') return 'Completed';
    if (status === 'in_progress') return 'In Progress';
    return 'Not Started';
  }

  paymentLabel(status: UserRecord['paymentStatus']): string {
    return status === 'paid' ? 'Paid' : 'Pending';
  }

  eligibilityLabel(status: UserRecord['eligibility']): string {
    return status === 'eligible' ? 'Eligible' : 'Not Eligible';
  }

  trackByUser(_: number, row: UserRecord): string {
    return row.id;
  }

  trackByFilterTag(_: number, tag: AppliedFilterTag): string {
    return tag.id;
  }

  private highlightUser(userId: string): void {
    this.updatedUserIds.add(userId);
    setTimeout(() => this.updatedUserIds.delete(userId), 1700);
  }

  private fetchUsers(showRefreshToast = false): void {
    const reqId = ++this.fetchSeq;
    this.loading = true;
    this.adminUsersService
      .getUsers({
        search: this.searchQuery,
        applicationStatus: this.applicationFilter,
        paymentStatus: this.paymentFilter,
        eligibility: this.eligibilityFilter,
        duration: this.durationPreset,
        fromDate: this.fromDate,
        toDate: this.toDate,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          if (reqId !== this.fetchSeq) return;
          this.scheduleViewUpdate(() => {
            // Keep only valid user rows so bad payload chunks do not break rendering.
            const rows = Array.isArray(res.users) ? res.users.filter((u) => !!u?.id) : [];
            this.users = rows.map((u) => ({
              ...u,
              joinedAt: u.joinedAtLabel,
              lastActivityLabel: this.toRelativeLabel(u.updatedAt || u.createdAt || ''),
            }));
            this.stats = res.stats || this.stats;
            this.currentPage = Math.min(this.currentPage, this.totalPages);
            if (this.users.length > 0) {
              this.firstLoadRetryCount = 0;
            } else if (this.shouldRetryInitialLoad()) {
              this.firstLoadRetryCount += 1;
              if (this.retryTimer) clearTimeout(this.retryTimer);
              this.retryTimer = setTimeout(() => this.fetchUsers(), 1200);
            }
            if (showRefreshToast) {
              this.snackBar.open('User list refreshed', 'Close', { duration: 1800 });
            }
          });
        },
        error: (err: unknown) => {
          if (reqId !== this.fetchSeq) return;
          this.scheduleViewUpdate(() => {
            // Do not wipe already loaded rows due to a late failing request.
            const hasRows = this.users.length > 0;
            if (!hasRows) {
              this.users = [];
              this.stats = {
                totalUsers: 0,
                applicationsInProgress: 0,
                pendingFee: 0,
                paidFees: 0,
                eligibleCount: 0,
              };
            }
            const message =
              typeof err === 'object' && err !== null && 'status' in err
                ? `Failed to load users (${String((err as { status: unknown }).status)})`
                : 'Failed to load users';
            if (!hasRows) {
              this.snackBar.open(message, 'Close', { duration: 2800 });
              if (this.shouldRetryInitialLoad()) {
                this.firstLoadRetryCount += 1;
                if (this.retryTimer) clearTimeout(this.retryTimer);
                this.retryTimer = setTimeout(() => this.fetchUsers(), 1200);
              }
            }
          });
        },
      });
  }

  private shouldRetryInitialLoad(): boolean {
    const noUserFilters =
      !this.searchQuery.trim() &&
      this.applicationFilter === 'all' &&
      this.paymentFilter === 'all' &&
      this.eligibilityFilter === 'all' &&
      this.durationPreset === 'till_now';
    return noUserFilters && this.firstLoadRetryCount < 3;
  }

  private toRelativeLabel(value: string): string {
    const stamp = Date.parse(value);
    if (Number.isNaN(stamp)) return '—';
    const diffMs = Date.now() - stamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    return `${diffDay} days ago`;
  }
}
