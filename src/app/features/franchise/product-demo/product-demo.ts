import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  VideoDemoDialogComponent,
  VideoDemoDialogData,
} from './video-demo-dialog/video-demo-dialog.component';

type DemoModule = {
  id: string;
  eyebrow: string;
  title: string;
  subheading?: string;
  description: string;
  bullets: string[];
  icon: string;
  imageClass: string;
};

@Component({
  selector: 'app-product-demo',
  standalone: false,
  templateUrl: './product-demo.html',
  styleUrl: './product-demo.scss',
})
export class ProductDemoComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageRoot', { static: true }) pageRoot!: ElementRef<HTMLElement>;

  readonly modules: DemoModule[] = [
    {
      id: 'overview',
      eyebrow: 'Product Demo Overview',
      title: 'See the bidding experience end-to-end',
      subheading: 'Designed for speed, clarity, and confidence.',
      description:
        'Walk through a modern bidding workflow: from selecting zones to reviewing bids, placing offers, and tracking outcomes with premium UI feedback.',
      bullets: ['Live bidding cards', 'Clear investment signals', 'Action-ready flows'],
      icon: 'smart_toy',
      imageClass: 'demo-image--overview',
    },
    {
      id: 'education',
      eyebrow: 'Eligibility',
      title: 'Clarity before you commit',
      subheading: 'Know what qualifies—before you bid.',
      description:
        'Structured eligibility guidance and clear summaries so teams interpret standards quickly and move forward with confidence.',
      bullets: ['Eligibility checklists', 'Plain-language summaries', 'Consistent formatting'],
      icon: 'fact_check',
      imageClass: 'demo-image--education',
    },
    {
      id: 'contract',
      eyebrow: 'Contract Management',
      title: 'Contracts built for operational reality',
      subheading: 'Track, review, and move confidently.',
      description:
        'A clean contract experience that keeps key terms visible and reduces friction during approvals—ready for future document workflows.',
      bullets: ['Structured clauses', 'Status visibility', 'Audit-friendly layout'],
      icon: 'handshake',
      imageClass: 'demo-image--contract',
    },
    {
      id: 'pricing',
      eyebrow: 'Investment & Earnings',
      title: 'See the investment—and the upside',
      subheading: 'Financial clarity for every decision.',
      description:
        'Surface investment expectations, earning signals, and bid context in one place so franchise partners evaluate opportunities without guesswork.',
      bullets: ['Investment vs. return signals', 'Urgency indicators', 'Decision-ready summaries'],
      icon: 'trending_up',
      imageClass: 'demo-image--pricing',
    },
    {
      id: 'registration',
      eyebrow: 'Franchise Application',
      title: 'Apply with confidence',
      subheading: 'Guided, mobile-friendly steps.',
      description:
        'A streamlined application journey that captures what matters and prepares teams for the next stage—without heavy paperwork friction.',
      bullets: ['Step-by-step flow', 'Clear saves and checkpoints', 'Future-ready for APIs'],
      icon: 'how_to_reg',
      imageClass: 'demo-image--registration',
    },
    {
      id: 'role',
      eyebrow: 'Roles & Responsibilities',
      title: 'Everyone knows their part',
      subheading: 'Accountability built into the experience.',
      description:
        'Organize franchise roles and responsibilities so approvals, bids, and day-to-day ownership stay clear as you scale.',
      bullets: ['Role-based views', 'Team-friendly navigation', 'Scalable structure'],
      icon: 'groups',
      imageClass: 'demo-image--role',
    },
    {
      id: 'place-bid',
      eyebrow: 'Place Bid System',
      title: 'Marketplace-grade bidding UI',
      subheading: 'Fast actions, premium feedback.',
      description:
        'A confident bidding flow with premium UI patterns—responsive zone cards, clear CTAs, and enterprise-grade modal experiences.',
      bullets: ['Zone selection cards', 'Place bid dialogs', 'Leaderboard-style context'],
      icon: 'gavel',
      imageClass: 'demo-image--place-bid',
    },
  ];

  private revealObserver?: IntersectionObserver;

  constructor(private dialog: MatDialog) {}

  onPlayDemo(): void {
    const data: VideoDemoDialogData = {
      title: 'Franchise Platform — Demo',
      src: 'assets/demo-video.mp4',
    };

    this.dialog.open(VideoDemoDialogComponent, {
      width: '1000px',
      maxWidth: 'calc(100vw - 28px)',
      panelClass: 'video-demo-panel',
      autoFocus: false,
      data,
    });
  }

  ngAfterViewInit(): void {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const nodes = Array.from(this.pageRoot.nativeElement.querySelectorAll<HTMLElement>('.demo-reveal'));
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
      { threshold: 0.12, rootMargin: '0px 0px -12% 0px' }
    );

    for (const node of nodes) this.revealObserver.observe(node);
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }
}
