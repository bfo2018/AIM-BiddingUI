import { Component } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FranchiseAuthService } from './franchise-auth.service';
import { ServiceDetailsDialogComponent } from './service-details-dialog/service-details-dialog.component';

export type HealthcareServiceItem = {
  id: string;
  icon: string;
  title: string;
  line1: string;
  line2: string;
  theme:
    | 'personal'
    | 'audio'
    | 'video'
    | 'homeVisit'
    | 'nurse'
    | 'physio'
    | 'emergency';
};

@Component({
  selector: 'app-franchise-login',
  standalone: false,
  templateUrl: './franchise-login.html',
  styleUrl: './franchise-login.scss',
})
export class FranchiseLoginComponent {
  loginForm: FormGroup;

  loading = false;
  sendingOtp = false;
  error: string | null = null;
  generatedOtp: string | null = null;
  otpSent = false;

  /** AIM Healthcare services — matches mobile app palette (Pharmacy excluded). */
  readonly healthcareServices: HealthcareServiceItem[] = [
    {
      id: 'personal',
      icon: 'volunteer_activism',
      title: 'Personal Consultation',
      line1: 'In-clinic or scheduled one-to-one care with verified practitioners.',
      line2: 'Ideal for detailed assessments and continuity of treatment.',
      theme: 'personal',
    },
    {
      id: 'audio',
      icon: 'phone_in_talk',
      title: 'Audio Consultation',
      line1: 'Voice-based visits when video isn’t required — fast and accessible.',
      line2: 'Crystal-clear routing with secure session handling.',
      theme: 'audio',
    },
    {
      id: 'video',
      icon: 'videocam',
      title: 'Video Consultation',
      line1: 'HD telehealth sessions from any device your patients already use.',
      line2: 'Structured intake and outcomes aligned to AIM workflows.',
      theme: 'video',
    },
    {
      id: 'homeVisit',
      icon: 'home',
      title: 'Home Visit Consultation',
      line1: 'Licensed professionals visit patients at home when clinically appropriate.',
      line2: 'Dispatch-ready scheduling and coverage visibility for franchises.',
      theme: 'homeVisit',
    },
    {
      id: 'nurse',
      icon: 'medical_services',
      title: 'Nurse Consultation',
      line1: 'Skilled nursing assessments, vitals, and care-plan support.',
      line2: 'Extends your network without compromising clinical standards.',
      theme: 'nurse',
    },
    {
      id: 'physio',
      icon: 'accessibility_new',
      title: 'Physiotherapist',
      line1: 'Rehabilitation and movement therapy with guided exercise plans.',
      line2: 'Track sessions and progress across your franchise regions.',
      theme: 'physio',
    },
    {
      id: 'emergency',
      icon: 'emergency',
      title: 'Emergency Appointment',
      line1: 'Priority intake for urgent cases with escalation paths.',
      line2: 'Always-on readiness — connect patients to the right responder faster.',
      theme: 'emergency',
    },
  ];

  /** Fast lookup for fixed layout rendering (keeps choreography deterministic). */
  readonly healthcareById: Record<
    'personal' | 'audio' | 'video' | 'nurse' | 'homeVisit' | 'physio' | 'emergency',
    HealthcareServiceItem
  > = this.healthcareServices.reduce((acc, item) => {
    (acc as Record<string, HealthcareServiceItem>)[item.id] = item;
    return acc;
  }, {} as Record<string, HealthcareServiceItem>) as Record<
    'personal' | 'audio' | 'video' | 'nurse' | 'homeVisit' | 'physio' | 'emergency',
    HealthcareServiceItem
  >;

  constructor(
    private fb: FormBuilder,
    private auth: FranchiseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.loginForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      otp: [''],
    });

    this.loginForm
      .get('mobile')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (!this.otpSent) return;
        this.otpSent = false;
        this.generatedOtp = null;
        const otpCtrl = this.loginForm.get('otp');
        otpCtrl?.reset('');
        otpCtrl?.clearValidators();
        otpCtrl?.updateValueAndValidity({ emitEvent: false });
      });
  }

  onHealthcareServiceClick(service: HealthcareServiceItem): void {
    this.snackBar.open(`${service.title} — details coming soon.`, 'Dismiss', { duration: 2800 });
  }

  /** Show “Send verification code” only after the user has entered at least one digit. */
  get hasMobileInput(): boolean {
    const raw = this.loginForm.get('mobile')?.value;
    if (raw == null || raw === '') return false;
    return /\d/.test(String(raw));
  }

  openServiceDetails(service: HealthcareServiceItem): void {
    this.dialog.open(ServiceDetailsDialogComponent, {
      width: '720px',
      maxWidth: 'calc(100vw - 28px)',
      panelClass: `service-dialog-panel`,
      autoFocus: false,
      data: service,
    });
  }

  sendOtp(): void {
    const mobileControl = this.loginForm.get('mobile');
    if (!mobileControl || mobileControl.invalid) {
      mobileControl?.markAsTouched();
      this.snackBar.open('Please enter a valid 10-digit mobile number.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    this.sendingOtp = true;
    this.error = null;
    const mobile = mobileControl.value as string;

    this.auth.requestFranchiseMobileOtp(mobile).subscribe({
      next: ({ otp }) => {
        this.generatedOtp = otp;
        this.otpSent = true;
        this.loginForm
          .get('otp')
          ?.setValidators([Validators.required, Validators.pattern(/^[0-9]{4,6}$/)]);
        this.loginForm.get('otp')?.updateValueAndValidity({ emitEvent: false });
        this.loginForm.get('otp')?.reset('');
        this.snackBar.open('Verification code sent.', 'Dismiss', { duration: 4000 });
      },
      error: (err) => {
        const msg =
          typeof err?.message === 'string' && err.message
            ? err.message
            : 'Could not send OTP.';
        this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
        this.sendingOtp = false;
      },
      complete: () => {
        this.sendingOtp = false;
      },
    });
  }

  onVerifyOtp(): void {
    const otpControl = this.loginForm.get('otp');
    otpControl?.markAsTouched();
    if (otpControl?.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;
    const mobile = this.loginForm.get('mobile')?.value as string;
    const otp = otpControl?.value as string;

    this.auth.verifyFranchiseMobileOtp(mobile, otp).subscribe({
      next: () => {
        this.snackBar.open('Signed in successfully.', 'Dismiss', { duration: 3500 });
        void this.router.navigateByUrl('/franchise/product-demo');
      },
      error: (err) => {
        this.error =
          typeof err?.message === 'string' && err.message
            ? err.message
            : 'Verification failed.';
        this.snackBar.open(this.error ?? 'Verification failed.', 'Dismiss', { duration: 5000 });
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
