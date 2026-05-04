import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

type PartnershipPaymentMode = 'full' | 'partial';

type SubscriptionPlan = {
  id: string;
  label: string;
  durationLabel: string;
  months: number;
  price: number;
  icon: string;
};

type EarningService = {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  companyPct: number;
  franchiserPct: number;
  providerPct: number;
};

type ServiceProjectionRow = {
  id: string;
  icon: string;
  name: string;
  perDay: number;
  perDayMin: number;
  perDayMax: number;
};

/** Cash deployed per won zone at settlement (use net paid after registration credit on first zone if applicable). */
type ZoneInvestmentRow = {
  id: string;
  label: string;
  amount: number;
};

type ZoneDriver = {
  icon: string;
  title: string;
  description: string;
};

type RoiMetric = {
  label: string;
  value: string;
  percent: number;
  tone: 'green' | 'blue' | 'amber';
};

type CompareItem = {
  label: string;
  amount: number;
  tone: 'expense' | 'earning';
  icon: string;
};

type ProfitPoint = {
  icon: string;
  title: string;
  blurb: string;
};

@Component({
  selector: 'app-pricing',
  standalone: false,
  templateUrl: './pricing.html',
  styleUrl: './pricing.scss',
})
export class PricingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageRoot', { static: true }) pageRoot!: ElementRef<HTMLElement>;

  readonly highlightTag = 'Transparent economics';

  readonly registrationFee = 5000;
  readonly registrationRefundable = 4000;
  readonly registrationNonRefundable = 1000;

  partnershipAmount = 50000;
  partnershipPaymentMode: PartnershipPaymentMode = 'full';
  readonly partnershipAmountMin = 50000;
  readonly partnershipAmountMax = 500000;
  readonly partnershipAmountStep = 10000;

  readonly subscriptionPlans: SubscriptionPlan[] = [
    { id: 'half', label: 'Half year', durationLabel: '6 months', months: 6, price: 300, icon: 'calendar_view_month' },
    { id: 'year', label: 'Yearly', durationLabel: '12 months', months: 12, price: 600, icon: 'event' },
    { id: 'twoYear', label: '2 year plan', durationLabel: '2 years', months: 24, price: 1200, icon: 'date_range' },
  ];
  selectedSubscriptionId = 'year';

  readonly earningServices: EarningService[] = [
    {
      id: 'personal',
      icon: 'person',
      name: 'Personal Consultation',
      blurb: 'In-clinic or scheduled personal consultations through AIM.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'audio',
      icon: 'call',
      name: 'Audio Consultation',
      blurb: 'Voice-based consultations routed via your zone.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'video',
      icon: 'videocam',
      name: 'Video Consultation',
      blurb: 'Remote video visits with verified providers.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'home',
      icon: 'home',
      name: 'Home Visit Consultation',
      blurb: 'Doctor home visits coordinated in your territory.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'nurse',
      icon: 'medical_services',
      name: 'Nurse Consultation',
      blurb: 'Nursing visits and vitals-led care bookings.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'physio',
      icon: 'accessibility_new',
      name: 'Physiotherapist',
      blurb: 'Physio sessions and rehabilitation bookings.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
    {
      id: 'emergency',
      icon: 'local_hospital',
      name: 'Emergency Appointment',
      blurb: 'Urgent care routing including ambulance and hospital handoff.',
      companyPct: 5,
      franchiserPct: 10,
      providerPct: 85,
    },
  ];

  /** At least one zone is required to operate; franchisers may hold several. */
  zoneRows: ZoneInvestmentRow[] = [
    { id: 'zone-1', label: 'Zone 1', amount: 50000 },
  ];

  serviceRows: ServiceProjectionRow[] = [
    { id: 'personal', icon: 'person', name: 'Personal Consultation', perDay: 2, perDayMin: 0, perDayMax: 30 },
    { id: 'audio', icon: 'call', name: 'Audio Consultation', perDay: 1, perDayMin: 0, perDayMax: 25 },
    { id: 'video', icon: 'videocam', name: 'Video Consultation', perDay: 3, perDayMin: 0, perDayMax: 35 },
    { id: 'home', icon: 'home', name: 'Home Visit Consultation', perDay: 1, perDayMin: 0, perDayMax: 15 },
    { id: 'nurse', icon: 'medical_services', name: 'Nurse Consultation', perDay: 2, perDayMin: 0, perDayMax: 20 },
    { id: 'physio', icon: 'accessibility_new', name: 'Physiotherapist', perDay: 1, perDayMin: 0, perDayMax: 15 },
    { id: 'emergency', icon: 'local_hospital', name: 'Emergency / Ambulance', perDay: 0, perDayMin: 0, perDayMax: 10 },
  ];

  appointmentFee = 559;
  doctorFee = 500;
  /** Illustrative split of net platform pool (after PG + call costs); contract may vary. */
  readonly franchiserSharePct = 80;
  readonly companySharePctFixed = 20;
  /** Shared estimate for audio and video Agora cost (same per-minute model). */
  avgAvCallMinutes = 10;
  payoutMode: 'online' | 'wallet' = 'online';

  readonly platformFeePct = 10;
  readonly gstPctOnPlatformFee = 18;
  /** Card / online PG estimate applied when patient pays online. */
  readonly paymentGatewayPct = 2.5;
  readonly agoraAudioTransportPerMin = 0.164; // 0.082 x 2 (doctor + patient)
  readonly agoraAudioRecordingPerMin = 0.123;

  workingDaysPerMonth = 26;

  readonly zoneDrivers: ZoneDriver[] = [
    {
      icon: 'map',
      title: 'Zone-exclusive earnings',
      description:
        'You earn from services delivered in your allocated zone. Winning a zone bid assigns that territory to you.',
    },
    {
      icon: 'gavel',
      title: 'Bidding & base price',
      description:
        'Zones list a base price; live bids raise the current bid. Your registration fee can adjust how much you pay at bid time.',
    },
    {
      icon: 'account_balance_wallet',
      title: 'Registration fee logic',
      description:
        '₹5,000 registration includes ₹4,000 refundable toward your first winning bid settlement; ₹1,000 covers processing.',
    },
    {
      icon: 'groups',
      title: 'Partner network',
      description:
        'More verified doctors, nurses, and providers in your zone improves fill rate and your franchiser share.',
    },
  ];

  readonly roiMetrics: RoiMetric[] = [
    { label: 'Payback clarity', value: 'See calculator', percent: 72, tone: 'green' },
    { label: 'Revenue streams', value: '7 services', percent: 88, tone: 'blue' },
    { label: 'Scalability', value: 'Zone + subscription', percent: 65, tone: 'amber' },
  ];

  readonly profitPoints: ProfitPoint[] = [
    {
      icon: 'percent',
      title: 'Clear revenue share',
      blurb: 'Each appointment splits between company, you, and the service provider—shown as percentages.',
    },
    {
      icon: 'layers',
      title: 'Full investment stack',
      blurb:
        'Franchise amount, subscription, and registration are clearly defined in one simple investment stack.',
    },
    {
      icon: 'savings',
      title: 'Full payment incentive',
      blurb: 'Pay franchise amount in full and receive 5% off; partial plan splits 50% now, 50% within 2 months.',
    },
    {
      icon: 'verified',
      title: 'Healthcare demand',
      blurb: 'Seven consultation and emergency touchpoints help diversify your monthly franchiser income.',
    },
  ];

  animated = {
    monthlyProjection: 0,
    totalInvestedNow: 0,
    paybackMonths: 0,
  };

  private revealObserver?: IntersectionObserver;
  private rafIds: number[] = [];
  private reduceMotion = false;

  get selectedSubscription(): SubscriptionPlan {
    return this.subscriptionPlans.find((p) => p.id === this.selectedSubscriptionId) ?? this.subscriptionPlans[1];
  }

  /** Partnership payable now (after 5% discount if full, or 50% if partial). */
  get partnershipPayableNow(): number {
    if (this.partnershipPaymentMode === 'full') {
      return Math.round(this.partnershipAmount * 0.95);
    }
    return Math.round(this.partnershipAmount * 0.5);
  }

  get partnershipRemainingLater(): number {
    if (this.partnershipPaymentMode === 'partial') {
      return Math.round(this.partnershipAmount * 0.5);
    }
    return 0;
  }

  get totalZoneInvestment(): number {
    return this.zoneRows.reduce((sum, z) => sum + Math.max(0, Math.round(Number(z.amount) || 0)), 0);
  }

  /** Total cash out for planner: onboarding + all zone settlement amounts (illustrative). */
  get totalInvestedNow(): number {
    return this.partnershipPayableNow + this.selectedSubscription.price + this.registrationFee;
  }

  get totalCommittedPartnership(): number {
    return this.partnershipAmount;
  }

  get dailyFranchiserEarnings(): number {
    return this.serviceRows.reduce((sum, row) => sum + row.perDay * this.franchiserEarningPerAppointmentByService(row.id), 0);
  }

  get projectedMonthlyEarnings(): number {
    return Math.round(this.dailyFranchiserEarnings * this.workingDaysPerMonth);
  }

  /** Simple payback: months to recover amount paid today at projected monthly franchiser income. */
  get paybackMonths(): number | null {
    const m = this.projectedMonthlyEarnings;
    if (m <= 0) return null;
    return this.totalInvestedNow / m;
  }

  get paybackLabel(): string {
    const p = this.paybackMonths;
    if (p === null || !isFinite(p)) return '—';
    if (p < 1) return '< 1 month (illustrative)';
    if (p <= 24) return `${p.toFixed(1)} months (illustrative)`;
    return `${Math.round(p)}+ months (illustrative)`;
  }

  get comparison(): CompareItem[] {
    return [
      {
        label: 'Franchise (pay now)',
        amount: this.partnershipPayableNow,
        tone: 'expense',
        icon: 'handshake',
      },
      {
        label: `Subscription (${this.selectedSubscription.label})`,
        amount: this.selectedSubscription.price,
        tone: 'expense',
        icon: 'subscriptions',
      },
      {
        label: 'Registration fee',
        amount: this.registrationFee,
        tone: 'expense',
        icon: 'app_registration',
      },
      {
        label: 'Projected franchiser income / mo',
        amount: this.projectedMonthlyEarnings,
        tone: 'earning',
        icon: 'trending_up',
      },
    ];
  }

  get expenseItems(): CompareItem[] {
    return this.comparison.filter((i) => i.tone === 'expense');
  }

  get earningItems(): CompareItem[] {
    return this.comparison.filter((i) => i.tone === 'earning');
  }

  serviceDailySubtotal(row: ServiceProjectionRow): number {
    return row.perDay * this.franchiserEarningPerAppointmentByService(row.id);
  }

  get companySharePct(): number {
    return this.companySharePctFixed;
  }

  get platformFee(): number {
    return this.round2((this.doctorFee * this.platformFeePct) / 100);
  }

  get gstFee(): number {
    return this.round2((this.platformFee * this.gstPctOnPlatformFee) / 100);
  }

  get totalAppointmentFee(): number {
    return this.round2(this.doctorFee + this.platformFee + this.gstFee);
  }

  /** % of total appointment fee used for PG line item (wallet = 0 in this illustrative model). */
  get effectivePaymentGatewayPct(): number {
    return this.payoutMode === 'online' ? this.paymentGatewayPct : 0;
  }

  get paymentGatewayChargePerAppointment(): number {
    return this.round2((this.totalAppointmentFee * this.effectivePaymentGatewayPct) / 100);
  }

  /** Same minute rate applied to both audio and video rows. */
  get avCallThirdPartyChargePerAppointment(): number {
    return this.round2(
      (this.agoraAudioTransportPerMin + this.agoraAudioRecordingPerMin) * this.avgAvCallMinutes
    );
  }

  /** Platform fee left for split after deducting operational charges. */
  netPlatformPoolByService(serviceId: string): number {
    if (serviceId === 'personal') {
      return 1; // ₹1 per completed personal token (session based)
    }
    const thirdParty =
      serviceId === 'audio' || serviceId === 'video' ? this.avCallThirdPartyChargePerAppointment : 0;
    return Math.max(0, this.round2(this.platformFee - this.paymentGatewayChargePerAppointment - thirdParty));
  }

  franchiserEarningPerAppointmentByService(serviceId: string): number {
    const pool = this.netPlatformPoolByService(serviceId);
    return this.round2((pool * this.franchiserSharePct) / 100);
  }

  companyEarningPerAppointmentByService(serviceId: string): number {
    const pool = this.netPlatformPoolByService(serviceId);
    return this.round2((pool * this.companySharePctFixed) / 100);
  }

  get franchiserEarningPerAppointment(): number {
    return this.franchiserEarningPerAppointmentByService('home');
  }

  get companyEarningPerAppointment(): number {
    return this.companyEarningPerAppointmentByService('home');
  }

  getRowFranchiserEarning(row: ServiceProjectionRow): number {
    return this.franchiserEarningPerAppointmentByService(row.id);
  }

  getRowCompanyEarning(row: ServiceProjectionRow): number {
    return this.companyEarningPerAppointmentByService(row.id);
  }

  getRowUnitLabel(row: ServiceProjectionRow): string {
    return row.id === 'personal' ? 'tokens/day' : 'appointments/day';
  }

  /**
   * Net platform pool after PG + AV call costs — audio & video share the same formula here;
   * used in the right-hand “remaining amount” illustration (not for home/nurse/physio/emergency).
   */
  get illustrativeAvNetPlatformPool(): number {
    return this.netPlatformPoolByService('audio');
  }

  get illustrativeAvFranchiserFromPool(): number {
    return this.franchiserEarningPerAppointmentByService('audio');
  }

  get illustrativeAvCompanyFromPool(): number {
    return this.companyEarningPerAppointmentByService('audio');
  }

  onAppointmentSplitChange(): void {
    this.doctorFee = Math.max(0, Math.round(Number(this.doctorFee) || 0));
    this.avgAvCallMinutes = Math.max(0, Math.min(240, Math.round(Number(this.avgAvCallMinutes) || 0)));
    this.appointmentFee = this.totalAppointmentFee;
    this.onProjectionOnlyChange();
  }

  setPayoutMode(mode: 'online' | 'wallet' | string): void {
    this.payoutMode = mode === 'wallet' ? 'wallet' : 'online';
    this.onProjectionOnlyChange();
  }

  formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  /** ₹ with one decimal (split illustration). */
  formatINR1(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  setPartnershipMode(mode: PartnershipPaymentMode): void {
    this.partnershipPaymentMode = mode;
    this.onInvestmentOrProjectionChange();
  }

  selectSubscription(id: string): void {
    this.selectedSubscriptionId = id;
    this.onInvestmentOrProjectionChange();
  }

  onInvestmentOrProjectionChange(): void {
    const inv = this.totalInvestedNow;
    const monthly = this.projectedMonthlyEarnings;
    const payback = this.paybackMonths ?? 0;

    if (this.reduceMotion) {
      this.animated.totalInvestedNow = inv;
      this.animated.monthlyProjection = monthly;
      this.animated.paybackMonths = Math.round(payback * 10) / 10;
      return;
    }

    this.animateNumber(this.animated.totalInvestedNow, inv, 450, (v) => (this.animated.totalInvestedNow = v));
    this.animateNumber(this.animated.monthlyProjection, monthly, 500, (v) => (this.animated.monthlyProjection = v));
    this.animateNumber(
      Math.round(this.animated.paybackMonths * 10),
      Math.round(payback * 10),
      500,
      (v) => (this.animated.paybackMonths = v / 10)
    );
  }

  onServiceRowChange(): void {
    for (const row of this.serviceRows) {
      row.perDay = Math.max(row.perDayMin, Math.min(row.perDayMax, Math.round(Number(row.perDay) || 0)));
    }
    this.onProjectionOnlyChange();
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  onWorkingDaysChange(): void {
    this.workingDaysPerMonth = Math.max(1, Math.min(31, Math.round(Number(this.workingDaysPerMonth) || 26)));
    this.onProjectionOnlyChange();
  }

  onPartnershipAmountChange(): void {
    const n = Number(this.partnershipAmount);
    this.partnershipAmount = Math.max(
      this.partnershipAmountMin,
      Math.min(this.partnershipAmountMax, (Number.isFinite(n) ? n : this.partnershipAmountMin) || this.partnershipAmountMin)
    );
    this.onInvestmentOrProjectionChange();
  }

  onPartnershipSliderChange(): void {
    this.partnershipAmount = Math.max(
      this.partnershipAmountMin,
      Math.min(
        this.partnershipAmountMax,
        Math.round(Number(this.partnershipAmount) / this.partnershipAmountStep) * this.partnershipAmountStep
      )
    );
    this.onInvestmentOrProjectionChange();
  }

  addZone(): void {
    const nextNum = this.zoneRows.length + 1;
    this.zoneRows = [
      ...this.zoneRows,
      { id: `zone-${Date.now()}`, label: `Zone ${nextNum}`, amount: 60000 },
    ];
    this.onInvestmentOrProjectionChange();
  }

  removeZone(index: number): void {
    if (this.zoneRows.length <= 1) return;
    this.zoneRows = this.zoneRows.filter((_, i) => i !== index);
    this.onInvestmentOrProjectionChange();
  }

  onZoneRowChange(): void {
    this.zoneRows.forEach((z, i) => {
      z.amount = Math.max(0, Math.round(Number(z.amount) || 0));
      const raw = (z.label ?? '').trim();
      z.label = raw || `Zone ${i + 1}`;
    });
    this.onInvestmentOrProjectionChange();
  }

  private onProjectionOnlyChange(): void {
    const monthly = this.projectedMonthlyEarnings;
    const payback = this.paybackMonths ?? 0;
    if (this.reduceMotion) {
      this.animated.monthlyProjection = monthly;
      this.animated.paybackMonths = Math.round(payback * 10) / 10;
      return;
    }
    this.animateNumber(this.animated.monthlyProjection, monthly, 450, (v) => (this.animated.monthlyProjection = v));
    this.animateNumber(
      Math.round(this.animated.paybackMonths * 10),
      Math.round(payback * 10),
      450,
      (v) => (this.animated.paybackMonths = v / 10)
    );
  }

  private animateNumber(
    from: number,
    to: number,
    durationMs: number,
    onUpdate: (v: number) => void
  ): void {
    const start = performance.now();
    const delta = to - from;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const v = Math.round(from + delta * ease(t));
      onUpdate(v);
      if (t < 1) {
        this.rafIds.push(requestAnimationFrame(step));
      }
    };

    this.rafIds.push(requestAnimationFrame(step));
  }

  ngAfterViewInit(): void {
    this.reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const nodes = Array.from(
      this.pageRoot.nativeElement.querySelectorAll<HTMLElement>('.inv-reveal, .demo-reveal')
    );
    if (this.reduceMotion) {
      for (const node of nodes) node.classList.add('is-visible');
      this.animated.totalInvestedNow = this.totalInvestedNow;
      this.animated.monthlyProjection = this.projectedMonthlyEarnings;
      this.animated.paybackMonths = Math.round((this.paybackMonths ?? 0) * 10) / 10;
      return;
    }

    this.onInvestmentOrProjectionChange();

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          this.revealObserver?.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    );

    for (const node of nodes) this.revealObserver.observe(node);
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    for (const id of this.rafIds) cancelAnimationFrame(id);
    this.rafIds = [];
  }
}
