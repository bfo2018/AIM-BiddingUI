import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

type SummaryCard = {
  icon: string;
  title: string;
  summary: string;
};

type ClauseSection = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  bullets: string[];
};

type Highlight = {
  icon: string;
  title: string;
  text: string;
};

@Component({
  selector: 'app-contract',
  standalone: false,
  templateUrl: './contract.html',
  styleUrl: './contract.scss',
})
export class ContractComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageRoot', { static: true }) pageRoot!: ElementRef<HTMLElement>;

  readonly summaryCards: SummaryCard[] = [
    {
      icon: 'schedule',
      title: 'Agreement duration',
      summary: 'Initial term of 24 months, renewable based on performance and compliance.',
    },
    {
      icon: 'location_on',
      title: 'Franchise scope',
      summary: 'Rights to operate and onboard services within the assigned exclusive zone.',
    },
    {
      icon: 'payments',
      title: 'Revenue terms',
      summary: 'Commission-based earnings with monthly settlement and transparent reporting.',
    },
    {
      icon: 'gavel',
      title: 'Termination policy',
      summary: 'Defined notice periods, breach clauses, and documented exit obligations.',
    },
  ];

  readonly sections: ClauseSection[] = [
    {
      id: 'scope',
      icon: 'description',
      title: 'Agreement scope',
      subtitle: 'Defines the legal partnership boundaries between AIM and franchise partner.',
      bullets: [
        'Establishes partnership between AIM platform and franchiser for approved zone operations.',
        'Grants rights to operate listed healthcare service categories in assigned territory.',
        'Includes consultation, ambulance coordination, and home-care partner enablement.',
      ],
    },
    {
      id: 'roles',
      icon: 'groups',
      title: 'Roles & responsibilities',
      subtitle: 'Operational ownership and franchise obligations in day-to-day execution.',
      bullets: [
        'Onboard verified doctors, nurses, physiotherapists, and approved service partners.',
        'Maintain quality standards, responsiveness, and partner documentation hygiene.',
        'Follow platform SOPs, zone-level SLAs, and escalation protocols.',
      ],
    },
    {
      id: 'revenue',
      icon: 'account_balance_wallet',
      title: 'Revenue & payment terms',
      subtitle: 'How earnings are calculated, reported, and settled.',
      bullets: [
        'Commission model applies across consultations, emergency dispatch, and care bookings.',
        'Settlement cycle: monthly payouts after reconciliation and dispute window closure.',
        'Transparent earning statements shared with transaction-level breakdown.',
      ],
    },
    {
      id: 'compliance',
      icon: 'verified_user',
      title: 'Compliance & legal terms',
      subtitle: 'Mandatory standards to safeguard service integrity and patient trust.',
      bullets: [
        'Only verified, valid, and licensed partners may be activated on platform.',
        'Franchise partner must follow legal obligations and healthcare governance norms.',
        'Platform policies on fraud, misuse, and data confidentiality are binding.',
      ],
    },
    {
      id: 'termination',
      icon: 'logout',
      title: 'Termination & exit clause',
      subtitle: 'Conditions, timelines, and obligations when either party exits.',
      bullets: [
        'Termination may occur due to repeated non-compliance, fraud, or severe SLA breach.',
        'Standard notice period applies before closure except in critical violation scenarios.',
        'Applicable penalties, pending dues, and closure checklist are documented in writing.',
      ],
    },
  ];

  readonly highlights: Highlight[] = [
    {
      icon: 'balance',
      title: 'Transparent revenue sharing',
      text: 'Clearly documented commission terms with auditable settlement records.',
    },
    {
      icon: 'security',
      title: 'Secure agreement structure',
      text: 'Defined compliance obligations and policy-linked safeguards for both parties.',
    },
    {
      icon: 'trending_up',
      title: 'Scalable operating model',
      text: 'Contract supports growth across services while maintaining governance controls.',
    },
  ];

  readonly download = {
    fileName: 'AIM-Franchise-Agreement.pdf',
    href: 'assets/docs/AIM-Franchise-Agreement.pdf',
  };

  private revealObserver?: IntersectionObserver;

  ngAfterViewInit(): void {
    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const nodes = Array.from(
      this.pageRoot.nativeElement.querySelectorAll<HTMLElement>('.contract-reveal, .demo-reveal')
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
