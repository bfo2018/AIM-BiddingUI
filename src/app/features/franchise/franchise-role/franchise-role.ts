import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

type OverviewCard = {
  icon: string;
  title: string;
  description: string;
};

type CheckItem = {
  text: string;
  highlight?: boolean;
};

type IconItem = {
  icon: string;
  text: string;
};

type Capability = {
  label: string;
  value: string;
};

type SuccessSignal = {
  icon: string;
  title: string;
  blurb: string;
};

@Component({
  selector: 'app-franchise-role',
  standalone: false,
  templateUrl: './franchise-role.html',
  styleUrl: './franchise-role.scss',
})
export class FranchiseRoleComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageRoot', { static: true }) pageRoot!: ElementRef<HTMLElement>;

  readonly overviewCards: OverviewCard[] = [
    {
      icon: 'person_add_alt_1',
      title: 'Partner onboarding',
      description: 'Build the zone network: onboard doctors, nurses, and physiotherapists.',
    },
    {
      icon: 'hub',
      title: 'Operations management',
      description: 'Coordinate appointments, availability, and service quality across partners.',
    },
    {
      icon: 'trending_up',
      title: 'Revenue growth',
      description: 'Expand local adoption, increase bookings, and track performance.',
    },
    {
      icon: 'verified',
      title: 'Compliance & quality',
      description: 'Follow platform guidelines, verify partners, and prevent misuse.',
    },
  ];

  readonly onboardingItems: CheckItem[] = [
    { text: 'Onboard doctors in your assigned zone', highlight: true },
    { text: 'Onboard nurses and physiotherapists', highlight: true },
    { text: 'Connect with hospitals and ambulance providers (where applicable)' },
    { text: 'Verify basic partner details before submission', highlight: true },
  ];

  readonly operationsItems: IconItem[] = [
    { icon: 'event_available', text: 'Ensure a smooth appointment flow across providers' },
    { icon: 'emergency', text: 'Monitor emergency service availability and response readiness' },
    { icon: 'support_agent', text: 'Coordinate between patients and partners for closures' },
    { icon: 'workspace_premium', text: 'Maintain service quality standards and timely follow-ups' },
  ];

  readonly growthItems: CheckItem[] = [
    { text: 'Expand partner network in your region', highlight: true },
    { text: 'Promote services locally (clinics, communities, corporate tie-ups)' },
    { text: 'Increase consultation and booking volume through consistent outreach' },
    { text: 'Track revenue and performance to improve zone outcomes', highlight: true },
  ];

  readonly complianceItems: CheckItem[] = [
    { text: 'Follow platform rules and policies', highlight: true },
    { text: 'Ensure verified and valid partners only', highlight: true },
    { text: 'Avoid fraudulent activities and misrepresentation' },
    { text: 'Maintain transparent service availability and pricing context' },
  ];

  readonly mergedContext: Capability[] = [
    { label: 'Local presence', value: 'Active in-zone engagement with partners and communities' },
    { label: 'Communication', value: 'Clear coordination across patients, partners, and support' },
    { label: 'Business basics', value: 'Ability to plan, prioritize, and execute weekly targets' },
    { label: 'Operations ownership', value: 'Comfort running day-to-day local operations' },
  ];

  readonly successSignals: SuccessSignal[] = [
    {
      icon: 'diversity_3',
      title: 'Strong partner network',
      blurb: 'Doctors, nurses, physios, and support partners consistently active.',
    },
    {
      icon: 'task_alt',
      title: 'High completion rate',
      blurb: 'Appointments delivered on time with minimal cancellations.',
    },
    {
      icon: 'thumb_up',
      title: 'Great customer feedback',
      blurb: 'Positive reviews, repeat bookings, and trust in service quality.',
    },
    {
      icon: 'insights',
      title: 'Consistent revenue growth',
      blurb: 'Stable month-over-month improvement through local execution.',
    },
  ];

  private revealObserver?: IntersectionObserver;

  ngAfterViewInit(): void {
    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const nodes = Array.from(
      this.pageRoot.nativeElement.querySelectorAll<HTMLElement>('.role-reveal, .demo-reveal')
    );
    if (reduceMotion) {
      for (const node of nodes) node.classList.add('is-visible');
      return;
    }

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
  }
}
