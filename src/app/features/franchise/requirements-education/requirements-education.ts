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

type OpItem = {
  icon: string;
  text: string;
};

type FinancialPoint = {
  label: string;
  value: string;
};

type IdealProfile = {
  icon: string;
  title: string;
  blurb: string;
};

@Component({
  selector: 'app-requirements-education',
  standalone: false,
  templateUrl: './requirements-education.html',
  styleUrl: './requirements-education.scss',
})
export class RequirementsEducationComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageRoot', { static: true }) pageRoot!: ElementRef<HTMLElement>;

  readonly overviewCards: OverviewCard[] = [
    {
      icon: 'school',
      title: 'Minimum qualification',
      description: 'Graduate preferred; MBA adds weight. Strong communication is essential.',
    },
    {
      icon: 'work_history',
      title: 'Experience',
      description: '1–3 years in sales, healthcare, or local business with proven execution.',
    },
    {
      icon: 'hub',
      title: 'Business readiness',
      description: 'Network to recruit doctors and nurses, run day-to-day zone operations.',
    },
    {
      icon: 'public',
      title: 'Regional fit',
      description: 'Open markets in select zones. We match you where demand is active.',
    },
  ];

  readonly educationItems: CheckItem[] = [
    { text: 'Graduate degree preferred; MBA is a plus', highlight: true },
    { text: 'Medical / healthcare background optional but valued' },
    { text: 'Relevant certifications (clinic ops, sales) optional' },
  ];

  readonly experienceItems: CheckItem[] = [
    { text: 'Sales or business development experience', highlight: true },
    { text: 'Medical / pharma representative experience preferred' },
    { text: 'Solid understanding of the local market you will serve', highlight: true },
  ];

  readonly operationalItems: OpItem[] = [
    { icon: 'person_add_alt_1', text: 'Ability to onboard and support doctors' },
    { icon: 'health_and_safety', text: 'Ability to onboard nurses and care staff' },
    { icon: 'diversity_3', text: 'Build a trusted local partner network' },
    { icon: 'map', text: 'Manage operations within your assigned zone' },
  ];

  readonly financialPoints: FinancialPoint[] = [
    { label: 'Initial investment', value: '₹2–5 Lakhs (indicative range)' },
    { label: 'Working capital', value: 'Ready for 3–6 months of operating runway' },
    { label: 'Opex discipline', value: 'Comfort managing staff, logistics, and local costs' },
  ];

  readonly idealProfiles: IdealProfile[] = [
    {
      icon: 'medical_services',
      title: 'Healthcare professionals',
      blurb: 'Clinicians ready to scale impact beyond a single practice.',
    },
    {
      icon: 'rocket_launch',
      title: 'Entrepreneurs',
      blurb: 'Operators who want a structured, high-trust franchise model.',
    },
    {
      icon: 'vaccines',
      title: 'Medical representatives',
      blurb: 'Field teams who already know providers and local corridors.',
    },
    {
      icon: 'storefront',
      title: 'Local business owners',
      blurb: 'Anchored in the community with logistics and hiring know-how.',
    },
  ];

  private revealObserver?: IntersectionObserver;

  ngAfterViewInit(): void {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const nodes = Array.from(
      this.pageRoot.nativeElement.querySelectorAll<HTMLElement>('.elig-reveal, .demo-reveal')
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
