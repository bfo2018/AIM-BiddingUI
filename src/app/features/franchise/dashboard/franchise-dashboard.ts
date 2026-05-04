import { Component } from '@angular/core';

type FeatureItem = {
  icon: string;
  title: string;
  description: string;
};

type ServiceItem = {
  title: string;
  content: string;
};

@Component({
  selector: 'app-franchise-dashboard',
  standalone: false,
  templateUrl: './franchise-dashboard.html',
  styleUrl: './franchise-dashboard.scss',
})
export class FranchiseDashboard {
  readonly features: FeatureItem[] = [
    {
      icon: 'insights',
      title: 'Smart Bid Insights',
      description: 'Benchmark bids with clear trends and probability-driven recommendations.',
    },
    {
      icon: 'verified_user',
      title: 'Compliance First',
      description: 'Track checklist completion and regulatory readiness in one place.',
    },
    {
      icon: 'auto_graph',
      title: 'Growth Dashboarding',
      description: 'Monitor region performance, revenue potential, and conversion milestones.',
    },
  ];

  readonly services: ServiceItem[] = [
    {
      title: 'Partner Discovery',
      content: 'Find suitable franchise opportunities with location and category filters.',
    },
    {
      title: 'Contract Intelligence',
      content: 'Review obligations, terms, and key clauses using guided summaries.',
    },
    {
      title: 'Financial Modelling',
      content: 'Simulate startup costs, margins, and projected payback timelines.',
    },
    {
      title: 'Bid Submission',
      content: 'Submit and manage bids through a clean multi-step digital workflow.',
    },
  ];

  readonly benefits: string[] = [
    'Faster decisions with transparent, structured bidding workflows.',
    'Smoother onboarding with guided eligibility, applications, and checklists.',
    'Clearer confidence through contracts, investment signals, and role clarity.',
    'A scalable foundation ready for APIs, analytics, and growth.',
  ];
}
