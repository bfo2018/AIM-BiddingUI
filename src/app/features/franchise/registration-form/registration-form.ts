import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DataService } from '../../../core/services/data.service';
import { ApiService } from '../../../core/services/api.service';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';

type UploadKeys = 'idProof' | 'addressProof' | 'businessProof';

export type IdentityIdType = 'adhaar' | 'driving_license' | 'voterId' | 'passport';

type ApplicationStep = {
  id: number;
  title: string;
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
};

type RazorpayVerifyPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type PaymentStatus = 'created' | 'paid' | 'failed' | 'none';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

/** Local YYYY-MM-DD for date input max attribute. */
function todayIsoDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const built = new Date(y, mo - 1, d);
  if (built.getFullYear() !== y || built.getMonth() !== mo - 1 || built.getDate() !== d) return null;
  return { y, m: mo, d };
}

function dateOfBirthValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value;
  if (raw == null || String(raw).trim() === '') return null;

  const parts = parseYmd(String(raw));
  if (!parts) return { invalidDate: true };

  const today = new Date();
  const tY = today.getFullYear();
  const tM = today.getMonth() + 1;
  const tD = today.getDate();

  const birthNotFuture =
    parts.y < tY || (parts.y === tY && (parts.m < tM || (parts.m === tM && parts.d <= tD)));
  if (!birthNotFuture) return { dobFuture: true };

  let age = tY - parts.y;
  if (parts.m > tM || (parts.m === tM && parts.d > tD)) age -= 1;
  if (age < 18) return { dobUnder18: true };
  if (age > 120) return { dobUnrealistic: true };

  return null;
}

function trimToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === '' ? null : t;
}

function omitNullProps(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

function splitFullName(full: string): { firstName: string; lastName: string | null } {
  const t = String(full ?? '').trim();
  if (!t) return { firstName: '', lastName: null };
  const parts = t.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { firstName, lastName };
}

type UploadApiResponse = {
  status?: boolean;
  message?: string;
  data?: {
    filename?: string;
    filepath?: string;
    filekey?: string;
    originalname?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type UploadRecord = {
  filename?: string;
  filepath?: string;
  filekey?: string;
  originalname?: string;
  date: string;
  time: string;
  mode: string;
  profilepic: boolean;
  [key: string]: unknown;
};

function extractUploadData(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object') return null;
  const typed = meta as UploadApiResponse;
  if (typed.data && typeof typed.data === 'object') {
    return { ...(typed.data as Record<string, unknown>) };
  }
  return { ...(typed as Record<string, unknown>) };
}

function formatUploadDateTime(now = new Date()): { date: string; time: string } {
  // Date: MM/DD/YYYY
  const date = now.toLocaleDateString('en-US');
  // Time: locale time (e.g., 8:15:24 AM or 13:39:00 depending on locale)
  const time = now.toLocaleTimeString('en-US', { hour12: true });
  return { date, time };
}

function buildUploadRecord(meta: unknown, profilepic: boolean): UploadRecord | null {
  const base = extractUploadData(meta);
  if (!base) return null;
  const { date, time } = formatUploadDateTime();
  return {
    ...base,
    date,
    time,
    mode: 'create',
    profilepic,
  };
}

function identityNumberValidator(control: AbstractControl<string>): ValidationErrors | null {
  const parent = control.parent as FormGroup | null;
  if (!parent) return null;
  const idType = parent.get('idType')?.value as string | undefined;
  if (!idType) return null;
  const raw = String(control.value ?? '').trim();
  if (!raw) return null;

  switch (idType) {
    case 'adhaar': {
      const d = raw.replace(/\D/g, '');
      return d.length === 12 ? null : { idInvalid: true };
    }
    case 'driving_license': {
      const s = raw.replace(/[^a-zA-Z0-9]/g, '');
      return s.length >= 1 && s.length <= 18 ? null : { idInvalid: true };
    }
    case 'voterId': {
      const s = raw.replace(/[^a-zA-Z0-9]/g, '');
      return s.length >= 1 && s.length <= 10 ? null : { idInvalid: true };
    }
    case 'passport': {
      const s = raw.replace(/[^a-zA-Z0-9]/g, '');
      return s.length >= 1 && s.length <= 9 ? null : { idInvalid: true };
    }
    default:
      return null;
  }
}

@Component({
  selector: 'app-registration-form',
  standalone: false,
  templateUrl: './registration-form.html',
  styleUrl: './registration-form.scss',
})
export class RegistrationFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private static mapsScriptPromise: Promise<void> | null = null;
  readonly steps: ApplicationStep[] = [
    { id: 1, title: 'Basic Information' },
    { id: 2, title: 'Company Information' },
    { id: 3, title: 'Experience & Background' },
    { id: 4, title: 'Terms & Conditions' },
    { id: 5, title: 'Review & Submit' },
  ];

  currentStep = 1;
  submitted = false;
  formAttempted = false;
  submitting = false;
  submitError: string | null = null;
  latestPaymentStatus: PaymentStatus = 'none';
  latestPaymentAt: string = '';
  applicationNotice: string = '';

  readonly states = ['Maharashtra', 'Gujarat', 'Karnataka', 'Madhya Pradesh', 'Rajasthan'];
  /** Present address states loaded from API (falls back to `states`). */
  presentStates: string[] = [...this.states];
  /** Present address cities loaded from API (used with `ng-select`). */
  presentCities: string[] = [];
  private loadCitiesInFlight = 0;
  /** Company address cities loaded from API (used with `ng-select`). */
  companyCities: string[] = [];
  private loadCompanyCitiesInFlight = 0;
  readonly countries = [{ code: 'IN', name: 'India' }] as const;
  readonly experienceOptions = ['0-1 years', '1-3 years', '3-5 years', '5+ years'];
  readonly investmentOptions = ['₹2L - ₹3L', '₹3L - ₹5L', '₹5L - ₹8L', '₹8L+'];
  readonly zones = ['Mumbai North', 'Pune Central', 'Ahmedabad East', 'Indore City', 'Jaipur Urban'];

  readonly genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;

  private readonly companyDetailControlNames = [
    'companyName',
    'companyemail',
    'companymobile_number',
    'businessWebsite',
    'businessStructure',
    'companySameAddress',
    'companyArea',
    'companyDoorNo',
    'companyStreet',
    'companyLandmark',
    'companyCountry',
    'companyState',
    'companyCity',
    'companyPincode',
  ] as const;

  readonly businessStructureOptions = [
    'Sole Proprietorship',
    'Partnership',
    'Private Limited Company',
    'Public Limited Company',
    'LLP',
    'One Person Company',
    'Franchise',
  ];

  readonly idTypeOptions: { value: IdentityIdType; label: string }[] = [
    { value: 'adhaar', label: 'Aadhaar' },
    { value: 'driving_license', label: 'Driving license' },
    { value: 'voterId', label: 'Voter ID' },
    { value: 'passport', label: 'Passport' },
  ];

  readonly maxDob = todayIsoDateLocal();

  /** Per documentation: profile JPG/JPEG/PNG, max 2MB. */
  readonly profileMaxBytes = 2 * 1024 * 1024;
  readonly identityMaxBytes = 2 * 1024 * 1024;

  profileImageFileName = '';
  profileImagePreviewUrl: string | null = null;
  profileImageError: string | null = null;
  private profileImageServerMeta: unknown | null = null;

  identityFrontFileName = '';
  identityBackFileName = '';
  identityPassportFileName = '';
  identityFrontPreviewUrl: string | null = null;
  identityBackPreviewUrl: string | null = null;
  identityPassportPreviewUrl: string | null = null;
  identityFileError: string | null = null;
  private identityFrontServerMeta: unknown | null = null;
  private identityBackServerMeta: unknown | null = null;
  private identityPassportServerMeta: unknown | null = null;

  @ViewChild('identityFrontInput') private identityFrontEl?: ElementRef<HTMLInputElement>;
  @ViewChild('identityBackInput') private identityBackEl?: ElementRef<HTMLInputElement>;
  @ViewChild('identityPassportInput') private identityPassportEl?: ElementRef<HTMLInputElement>;
  @ViewChild('mapCanvas') private mapContainer?: ElementRef<HTMLElement>;
  @ViewChild('presentAreaInput') private presentAreaInput?: ElementRef<HTMLInputElement>;

  /** Google Maps / Places (step 1 present address). */
  private mapInitGeneration = 0;
  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;
  private geocoder: google.maps.Geocoder | null = null;
  private autocomplete: google.maps.places.Autocomplete | null = null;
  private mapClickListener: google.maps.MapsEventListener | null = null;
  private markerDragListener: google.maps.MapsEventListener | null = null;

  mapLoadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  mapErrorMessage = '';

  readonly fileNames: Record<UploadKeys, string> = {
    idProof: '',
    addressProof: '',
    businessProof: '',
  };

  readonly form: FormGroup<{
    profileImage: FormControl<File | null>;
    gender: FormControl<string>;
    dateOfBirth: FormControl<string>;
    fullName: FormControl<string>;
    email: FormControl<string>;
    mobile: FormControl<string>;
    presentArea: FormControl<string>;
    presentDoorNo: FormControl<string>;
    presentStreet: FormControl<string>;
    presentLandmark: FormControl<string>;
    presentCountry: FormControl<string>;
    presentState: FormControl<string>;
    presentCity: FormControl<string>;
    presentPincode: FormControl<string>;
    idType: FormControl<string>;
    idNumber: FormControl<string>;
    identityFront: FormControl<File | null>;
    identityBack: FormControl<File | null>;
    identityPassport: FormControl<File | null>;
    city: FormControl<string>;
    state: FormControl<string>;

    // Company information (step 2)
    hasRegisteredCompany: FormControl<'Yes' | 'No'>;
    companyName: FormControl<string>;
    companyemail: FormControl<string>;
    companymobile_number: FormControl<string>;
    businessWebsite: FormControl<string>;
    businessStructure: FormControl<string>;
    companySameAddress: FormControl<'Yes' | 'No'>;
    companyArea: FormControl<string>;
    companyDoorNo: FormControl<string>;
    companyStreet: FormControl<string>;
    companyLandmark: FormControl<string>;
    companyCountry: FormControl<string>;
    companyState: FormControl<string>;
    companyCity: FormControl<string>;
    companyPincode: FormControl<string>;

    workExperience: FormControl<string>;
    healthcareExperience: FormControl<string>;
    salesExperience: FormControl<string>;
    backgroundNote: FormControl<string>;
    investmentCapacity: FormControl<string>;
    preferredZone: FormControl<string>;
    existingBusiness: FormControl<string>;
    staffCount: FormControl<string>;
    acceptTerms: FormControl<boolean>;
    idProof: FormControl<File | null>;
    addressProof: FormControl<File | null>;
    businessProof: FormControl<File | null>;
  }>;

  private readonly fb = inject(FormBuilder);
  private readonly dataService = inject(DataService);
  private readonly apiService = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  constructor() {
    this.form = this.fb.nonNullable.group({
      profileImage: new FormControl<File | null>(null, { validators: [Validators.required] }),
      gender: ['', [Validators.required]],
      dateOfBirth: ['', [Validators.required, dateOfBirthValidator]],
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9][0-9]{9}$/)]],
      presentArea: ['', [Validators.required, Validators.minLength(3)]],
      presentDoorNo: [''],
      presentStreet: ['', [Validators.required, Validators.minLength(2)]],
      presentLandmark: [''],
      presentCountry: ['IN', [Validators.required]],
      presentState: ['', [Validators.required]],
      presentCity: ['', [Validators.required, Validators.minLength(2)]],
      presentPincode: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
      idType: ['', [Validators.required]],
      idNumber: ['', [Validators.required, identityNumberValidator]],
      identityFront: new FormControl<File | null>(null),
      identityBack: new FormControl<File | null>(null),
      identityPassport: new FormControl<File | null>(null),

      // Company information (step 2)
      hasRegisteredCompany: new FormControl<'Yes' | 'No'>('No', {
        validators: [Validators.required],
        nonNullable: true,
      }),
      companyName: ['', [Validators.required, Validators.minLength(2)]],
      companyemail: ['', [Validators.required, Validators.email]],
      companymobile_number: ['', [Validators.required, Validators.pattern(/^[6-9][0-9]{9}$/)]],
      businessWebsite: [''],
      businessStructure: ['', [Validators.required]],
      companySameAddress: new FormControl<'Yes' | 'No'>('Yes', {
        validators: [Validators.required],
        nonNullable: true,
      }),
      companyArea: ['', [Validators.required, Validators.minLength(3)]],
      companyDoorNo: ['', [Validators.required, Validators.minLength(1)]],
      companyStreet: ['', [Validators.required, Validators.minLength(2)]],
      companyLandmark: [''],
      companyCountry: ['IN'],
      companyState: ['', [Validators.required]],
      companyCity: ['', [Validators.required, Validators.minLength(2)]],
      companyPincode: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],

      // (kept for compatibility with previous model, not shown in current 4-step flow)
      city: [''],
      state: [''],
      workExperience: ['', [Validators.required]],
      healthcareExperience: ['', [Validators.required]],
      salesExperience: ['', [Validators.required]],
      backgroundNote: ['', [Validators.required, Validators.minLength(12)]],
      investmentCapacity: [''],
      preferredZone: [''],
      existingBusiness: [''],
      staffCount: [''],
      acceptTerms: new FormControl<boolean>(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
      idProof: new FormControl<File | null>(null),
      addressProof: new FormControl<File | null>(null),
      businessProof: new FormControl<File | null>(null),
    });

    this.updateProfileImageValidator();
    this.updateIdentityFileValidators();

    this.form.controls.idType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.onIdentityTypeChanged();
    });

    // Present address: states/cities are loaded from backend for the Select inputs.
    void this.loadPresentStates(this.form.controls.presentCountry.value);
    this.form.controls.presentState.valueChanges.pipe(takeUntilDestroyed()).subscribe((st) => {
      const nextState = (st ?? '').toString();
      // City depends on state; reset city whenever state changes.
      this.presentCities = [];
      this.form.controls.presentCity.setValue('', { emitEvent: false });
      if (!nextState) return;
      void this.loadPresentCities(nextState);
    });

    const maybeSyncCompany = (): void => {
      if (this.form.controls.hasRegisteredCompany.value !== 'Yes') return;
      if (this.form.controls.companySameAddress.value === 'Yes') {
        this.syncCompanyAddressFromPresent();
      }
    };
    this.form.controls.presentArea.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentDoorNo.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentStreet.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentLandmark.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentCountry.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentState.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentCity.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);
    this.form.controls.presentPincode.valueChanges.pipe(takeUntilDestroyed()).subscribe(maybeSyncCompany);

    this.form.controls.hasRegisteredCompany.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      this.onHasRegisteredCompanyChanged((val ?? 'No') as 'Yes' | 'No');
    });
    this.setCompanyDetailsRequired(false);

    // Company address: same-as toggle + city dropdown options.
    this.form.controls.companySameAddress.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      if (this.form.controls.hasRegisteredCompany.value !== 'Yes') return;
      const mode = (val ?? 'Yes') as 'Yes' | 'No';
      if (mode === 'Yes') {
        this.syncCompanyAddressFromPresent();
        this.disableCompanyAddressControls();
      } else {
        this.enableCompanyAddressControls();
        // Load cities for the currently selected state (if already set).
        const st = this.form.controls.companyState.value;
        if (st) void this.loadCompanyCities(st);
      }
    });

    this.form.controls.companyState.valueChanges.pipe(takeUntilDestroyed()).subscribe((st) => {
      if (this.form.controls.hasRegisteredCompany.value !== 'Yes') return;
      const mode = this.form.controls.companySameAddress.value;
      if (mode !== 'No') return;
      const nextState = (st ?? '').toString().trim();
      this.companyCities = [];
      this.form.controls.companyCity.setValue('', { emitEvent: false });
      if (!nextState) return;
      void this.loadCompanyCities(nextState);
    });
  }

  get progressPercent(): number {
    return (this.currentStep / this.steps.length) * 100;
  }

  get isReviewStep(): boolean {
    return this.currentStep === 5;
  }

  get isRegistrationFeePaid(): boolean {
    return this.latestPaymentStatus === 'paid';
  }

  get finalActionLabel(): string {
    if (this.submitting) {
      return this.isRegistrationFeePaid ? 'Updating application…' : 'Processing payment…';
    }
    return this.isRegistrationFeePaid ? 'Update Application' : 'Pay & Submit Application';
  }

  get canMoveNext(): boolean {
    return this.isStepValid(this.currentStep);
  }

  get showCompanyDetailsFields(): boolean {
    return this.form.controls.hasRegisteredCompany.value === 'Yes';
  }

  /** Step 2 with no registered company — show Skip instead of Next. */
  get showCompanyStepSkip(): boolean {
    return this.currentStep === 2 && !this.showCompanyDetailsFields;
  }

  /** Next button hidden on step 2 when user chose not to add company details. */
  get showStepNextButton(): boolean {
    return !this.isReviewStep && !this.showCompanyStepSkip;
  }

  get isPassportIdentity(): boolean {
    return this.form.controls.idType.value === 'passport';
  }

  get identityReviewFilesLabel(): string {
    if (this.form.controls.idType.value === 'passport') {
      return this.identityPassportFileName || '—';
    }
    const parts = [this.identityFrontFileName, this.identityBackFileName].filter(Boolean);
    return parts.length ? parts.join('; ') : '—';
  }

  get presentCountryLabel(): string {
    const code = this.form.controls.presentCountry.value;
    const row = this.countries.find((c) => c.code === code);
    return row?.name ?? code;
  }

  get idTypeReviewLabel(): string {
    const v = this.form.controls.idType.value as IdentityIdType | '';
    const row = this.idTypeOptions.find((o) => o.value === v);
    return row?.label ?? v ?? '—';
  }

  getIdentityPlaceholder(): string {
    switch (this.form.controls.idType.value as IdentityIdType | '') {
      case 'adhaar':
        return 'XXXX-XXXX-XXXX';
      case 'driving_license':
        return 'e.g. TN01201201201201';
      case 'voterId':
        return 'e.g. ABC1234567';
      case 'passport':
        return 'e.g. A0000000';
      default:
        return 'Select document type first';
    }
  }

  getIdentityMaxLength(): number {
    switch (this.form.controls.idType.value as IdentityIdType | '') {
      case 'adhaar':
        return 14;
      case 'driving_license':
        return 18;
      case 'voterId':
        return 10;
      case 'passport':
        return 9;
      default:
        return 24;
    }
  }

  ngOnInit(): void {
    void this.loadExistingApplication();
  }

  ngAfterViewInit(): void {
    if (this.currentStep === 1) {
      this.scheduleMapSetup();
    }
  }

  ngOnDestroy(): void {
    this.mapInitGeneration++;
    this.teardownMap();
    this.revokeProfilePreview();
    this.revokeIdentityPreviews();
  }

  private async loadExistingApplication(): Promise<void> {
    try {
      const url = `${environment.franchiseRegistrationApiUrl.replace(/\/$/, '')}/api/users/me`;
      const existing = (await firstValueFrom(this.http.get<unknown>(url))) as Record<string, unknown>;
      this.patchFormFromExistingUser(existing);
      await this.loadLatestPaymentStatus();
    } catch {
      // If user has no saved application yet, keep default blank form.
      this.latestPaymentStatus = 'none';
      this.applicationNotice = 'Complete your details and pay the registration fee to finish onboarding.';
    }
  }

  private async loadLatestPaymentStatus(): Promise<void> {
    try {
      const res = await firstValueFrom(this.apiService.getLatestPayment());
      const payment = res?.payment;
      if (!payment) {
        this.latestPaymentStatus = 'none';
        this.latestPaymentAt = '';
        this.applicationNotice = 'Complete your details and pay the registration fee to finish onboarding.';
        return;
      }

      this.latestPaymentStatus = (payment.status ?? 'none') as PaymentStatus;
      this.latestPaymentAt = payment.created_at ?? '';

      if (this.latestPaymentStatus === 'paid') {
        this.applicationNotice =
          'You have successfully completed all required details and paid the registration fee. You can update application details below.';
      } else if (this.latestPaymentStatus === 'failed') {
        this.applicationNotice =
          'Your last payment attempt failed. Please review details and complete payment to finish onboarding.';
      } else {
        this.applicationNotice =
          'Your registration fee is still pending. Please complete payment in the final step.';
      }
    } catch {
      this.latestPaymentStatus = 'none';
      this.latestPaymentAt = '';
      this.applicationNotice = 'Unable to fetch payment status right now. You can continue filling details.';
    }
  }

  private patchFormFromExistingUser(user: Record<string, unknown>): void {
    const personalInfo = ((user['personalInfo'] ?? {}) as Record<string, unknown>) || {};
    const companyInfo = ((user['companyInfo'] ?? {}) as Record<string, unknown>) || {};
    const experienceBackground =
      ((user['experience_background'] ?? {}) as Record<string, unknown>) || {};

    const firstName = String(personalInfo['firstName'] ?? '').trim();
    const lastName = String(personalInfo['lastName'] ?? '').trim();
    const fullName = `${firstName} ${lastName}`.trim();

    this.form.patchValue(
      {
        fullName,
        email: String(personalInfo['email'] ?? ''),
        mobile: String(personalInfo['mobile_number'] ?? ''),
        gender: String(personalInfo['gender'] ?? ''),
        dateOfBirth: String(personalInfo['dob'] ?? ''),
        presentArea: String(personalInfo['area'] ?? ''),
        presentDoorNo: String(personalInfo['doorno'] ?? ''),
        presentStreet: String(personalInfo['street'] ?? ''),
        presentLandmark: String(personalInfo['landmark'] ?? ''),
        presentCountry: String(personalInfo['country'] ?? 'IN'),
        presentState: String(personalInfo['state'] ?? ''),
        presentCity: String(personalInfo['city'] ?? ''),
        presentPincode: String(personalInfo['pincode'] ?? ''),
        idType: String(personalInfo['idType'] ?? ''),
        idNumber: String(personalInfo['idNumber'] ?? ''),

        hasRegisteredCompany: this.hasExistingCompanyInfo(companyInfo) ? 'Yes' : 'No',
        companyName: String(companyInfo['companyName'] ?? ''),
        companyemail: String(companyInfo['companyemail'] ?? ''),
        companymobile_number: String(companyInfo['companymobile_number'] ?? ''),
        businessWebsite: String(user['businessWebsite'] ?? ''),
        businessStructure: String(user['businessStructure'] ?? ''),
        companySameAddress:
          (String(companyInfo['sameaddress'] ?? 'Yes') as 'Yes' | 'No') || 'Yes',
        companyArea: String(companyInfo['companyarea'] ?? ''),
        companyDoorNo: String(companyInfo['doorno'] ?? ''),
        companyStreet: String(companyInfo['street'] ?? ''),
        companyLandmark: String(companyInfo['landmark'] ?? ''),
        companyCountry: String(companyInfo['companycountry'] ?? 'IN'),
        companyState: String(companyInfo['companystate'] ?? ''),
        companyCity: String(companyInfo['companycity'] ?? ''),
        companyPincode: String(companyInfo['companypincode'] ?? ''),

        workExperience: String(experienceBackground['work_experience'] ?? ''),
        healthcareExperience: String(experienceBackground['healthcare_experience'] ?? ''),
        salesExperience: String(experienceBackground['sales_business_experience'] ?? ''),
        backgroundNote: String(experienceBackground['background_note'] ?? ''),
        acceptTerms: Boolean(user['terms_accepted'] ?? false),
      },
      { emitEvent: false }
    );

    // Restore uploaded file metadata used by payload mapping and previews.
    const profile = personalInfo['profileimage'];
    if (profile && typeof profile === 'object') {
      const p = profile as Record<string, unknown>;
      this.profileImageServerMeta = { data: p };
      this.profileImageFileName = String(p['originalname'] ?? p['filename'] ?? '');
      this.profileImagePreviewUrl = String(p['filepath'] ?? '') || null;
    }

    const identityImage = personalInfo['identity_image'];
    if (identityImage && typeof identityImage === 'object') {
      const ii = identityImage as Record<string, unknown>;
      if (ii['front'] || ii['back']) {
        const front = ii['front'] as Record<string, unknown> | undefined;
        const back = ii['back'] as Record<string, unknown> | undefined;
        if (front) {
          this.identityFrontServerMeta = { data: front };
          this.identityFrontFileName = String(front['originalname'] ?? front['filename'] ?? '');
          this.identityFrontPreviewUrl = String(front['filepath'] ?? '') || null;
        }
        if (back) {
          this.identityBackServerMeta = { data: back };
          this.identityBackFileName = String(back['originalname'] ?? back['filename'] ?? '');
          this.identityBackPreviewUrl = String(back['filepath'] ?? '') || null;
        }
      } else {
        this.identityPassportServerMeta = { data: ii };
        this.identityPassportFileName = String(ii['originalname'] ?? ii['filename'] ?? '');
        this.identityPassportPreviewUrl = String(ii['filepath'] ?? '') || null;
      }
    }

    this.updateProfileImageValidator();
    this.updateIdentityFileValidators();

    const hasCompany = this.form.controls.hasRegisteredCompany.value === 'Yes';
    this.setCompanyDetailsRequired(hasCompany);
    if (hasCompany) {
      this.applyCompanySameAddressMode();
    } else {
      this.enableCompanyAddressControls();
    }
  }

  private revokeProfilePreview(): void {
    if (this.profileImagePreviewUrl) {
      URL.revokeObjectURL(this.profileImagePreviewUrl);
      this.profileImagePreviewUrl = null;
    }
  }

  private revokeIdentityPreviews(): void {
    for (const url of [this.identityFrontPreviewUrl, this.identityBackPreviewUrl, this.identityPassportPreviewUrl]) {
      if (url) URL.revokeObjectURL(url);
    }
    this.identityFrontPreviewUrl = null;
    this.identityBackPreviewUrl = null;
    this.identityPassportPreviewUrl = null;
  }

  private updateIdentityFileValidators(): void {
    const idType = this.form.controls.idType.value;
    const front = this.form.controls.identityFront;
    const back = this.form.controls.identityBack;
    const pass = this.form.controls.identityPassport;
    const hasFrontMeta = !!this.identityFrontServerMeta;
    const hasBackMeta = !!this.identityBackServerMeta;
    const hasPassportMeta = !!this.identityPassportServerMeta;
    front.clearValidators();
    back.clearValidators();
    pass.clearValidators();
    if (idType === 'passport') {
      if (!hasPassportMeta) {
        pass.setValidators([Validators.required]);
      }
    } else if (idType) {
      if (!hasFrontMeta) {
        front.setValidators([Validators.required]);
      }
      if (!hasBackMeta) {
        back.setValidators([Validators.required]);
      }
    }
    front.updateValueAndValidity({ emitEvent: false });
    back.updateValueAndValidity({ emitEvent: false });
    pass.updateValueAndValidity({ emitEvent: false });
  }

  private updateProfileImageValidator(): void {
    const profileCtrl = this.form.controls.profileImage;
    profileCtrl.clearValidators();
    if (!this.profileImageServerMeta) {
      profileCtrl.setValidators([Validators.required]);
    }
    profileCtrl.updateValueAndValidity({ emitEvent: false });
  }

  private onIdentityTypeChanged(): void {
    this.form.controls.idNumber.setValue('');
    this.identityFileError = null;
    this.revokeIdentityPreviews();
    this.form.controls.identityFront.setValue(null);
    this.form.controls.identityBack.setValue(null);
    this.form.controls.identityPassport.setValue(null);
    this.identityFrontFileName = '';
    this.identityBackFileName = '';
    this.identityPassportFileName = '';
    this.identityFrontServerMeta = null;
    this.identityBackServerMeta = null;
    this.identityPassportServerMeta = null;
    this.identityFrontEl?.nativeElement && (this.identityFrontEl.nativeElement.value = '');
    this.identityBackEl?.nativeElement && (this.identityBackEl.nativeElement.value = '');
    this.identityPassportEl?.nativeElement && (this.identityPassportEl.nativeElement.value = '');
    this.form.controls.idNumber.updateValueAndValidity({ emitEvent: false });
    this.updateIdentityFileValidators();
  }

  private controlsForStep(step: number): string[] {
    if (step === 1) {
      return [
        'profileImage',
        'gender',
        'dateOfBirth',
        'fullName',
        'email',
        'mobile',
        'presentArea',
        'presentDoorNo',
        'presentStreet',
        'presentLandmark',
        'presentCountry',
        'presentState',
        'presentCity',
        'presentPincode',
        'idType',
        'idNumber',
        'identityFront',
        'identityBack',
        'identityPassport',
      ];
    }
    if (step === 2) {
      if (this.form.controls.hasRegisteredCompany.value === 'No') {
        return ['hasRegisteredCompany'];
      }
      return ['hasRegisteredCompany', ...this.companyDetailControlNames];
    }
    if (step === 3) return ['workExperience', 'healthcareExperience', 'salesExperience', 'backgroundNote'];
    if (step === 4) return ['acceptTerms'];
    return [];
  }

  private markStepTouched(step: number): void {
    for (const name of this.controlsForStep(step)) {
      this.form.controls[name as keyof typeof this.form.controls].markAsTouched();
    }
  }

  private isStepValid(step: number): boolean {
    for (const name of this.controlsForStep(step)) {
      const control = this.form.controls[name as keyof typeof this.form.controls];
      if (control.disabled) continue;
      if (control.invalid) return false;
    }
    return true;
  }

  private validatorsForCompanyControl(name: (typeof this.companyDetailControlNames)[number]) {
    switch (name) {
      case 'companyName':
        return [Validators.required, Validators.minLength(2)];
      case 'companyemail':
        return [Validators.required, Validators.email];
      case 'companymobile_number':
        return [Validators.required, Validators.pattern(/^[6-9][0-9]{9}$/)];
      case 'businessWebsite':
        return [];
      case 'businessStructure':
        return [Validators.required];
      case 'companySameAddress':
        return [Validators.required];
      case 'companyArea':
        return [Validators.required, Validators.minLength(3)];
      case 'companyDoorNo':
        return [Validators.required, Validators.minLength(1)];
      case 'companyStreet':
        return [Validators.required, Validators.minLength(2)];
      case 'companyLandmark':
        return [];
      case 'companyCountry':
        return [Validators.required];
      case 'companyState':
        return [Validators.required];
      case 'companyCity':
        return [Validators.required, Validators.minLength(2)];
      case 'companyPincode':
        return [Validators.required, Validators.pattern(/^[0-9]{6}$/)];
      default:
        return [];
    }
  }

  private setCompanyDetailsRequired(required: boolean): void {
    for (const name of this.companyDetailControlNames) {
      const control = this.form.controls[name];
      if (required) {
        control.setValidators(this.validatorsForCompanyControl(name));
      } else {
        control.clearValidators();
      }
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private clearCompanyFormValues(): void {
    this.form.patchValue(
      {
        companyName: '',
        companyemail: '',
        companymobile_number: '',
        businessWebsite: '',
        businessStructure: '',
        companySameAddress: 'Yes',
        companyArea: '',
        companyDoorNo: '',
        companyStreet: '',
        companyLandmark: '',
        companyCountry: 'IN',
        companyState: '',
        companyCity: '',
        companyPincode: '',
      },
      { emitEvent: false }
    );
    this.companyCities = [];
  }

  private applyCompanySameAddressMode(): void {
    const mode = this.form.controls.companySameAddress.value;
    if (mode === 'Yes') {
      this.syncCompanyAddressFromPresent();
      this.disableCompanyAddressControls();
    } else {
      this.enableCompanyAddressControls();
      const st = this.form.controls.companyState.value;
      if (st) void this.loadCompanyCities(st);
    }
  }

  private onHasRegisteredCompanyChanged(mode: 'Yes' | 'No'): void {
    if (mode === 'Yes') {
      this.setCompanyDetailsRequired(true);
      this.applyCompanySameAddressMode();
      return;
    }
    this.setCompanyDetailsRequired(false);
    this.clearCompanyFormValues();
    this.enableCompanyAddressControls();
  }

  private hasExistingCompanyInfo(companyInfo: Record<string, unknown>): boolean {
    const keys = [
      'companyName',
      'companyemail',
      'companymobile_number',
      'companyarea',
      'doorno',
      'street',
      'companystate',
      'companycity',
      'companypincode',
    ];
    return keys.some((k) => String(companyInfo[k] ?? '').trim() !== '');
  }

  skipCompanyStep(): void {
    if (this.currentStep !== 2) return;
    this.form.controls.hasRegisteredCompany.setValue('No', { emitEvent: false });
    this.onHasRegisteredCompanyChanged('No');
    this.formAttempted = false;
    if (this.currentStep >= this.steps.length) return;
    this.currentStep += 1;
    this.scrollTop();
  }

  private scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextStep(): void {
    this.formAttempted = true;
    this.markStepTouched(this.currentStep);
    if (!this.isStepValid(this.currentStep)) return;
    if (this.currentStep >= this.steps.length) return;
    if (this.currentStep === 1) {
      this.mapInitGeneration++;
      this.teardownMap();
    }
    this.currentStep += 1;
    this.formAttempted = false;
    this.scrollTop();
  }

  previousStep(): void {
    if (this.currentStep <= 1) return;
    this.currentStep -= 1;
    this.formAttempted = false;
    if (this.currentStep === 1) {
      this.scheduleMapSetup();
    }
    this.scrollTop();
  }

  editStep(step: number): void {
    if (step < 1 || step > 5) return;
    if (this.currentStep === 1 && step !== 1) {
      this.mapInitGeneration++;
      this.teardownMap();
    }
    this.currentStep = step;
    if (step === 1) {
      this.scheduleMapSetup();
    }
    this.scrollTop();
  }

  /** Recentre map & marker on device GPS and refresh address fields. */
  recenterOnMyLocation(): void {
    if (!navigator.geolocation) return;
    if (!this.map || !this.marker) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        this.marker!.setPosition({ lat, lng });
        this.map!.panTo({ lat, lng });
        this.map!.setZoom(17);
        void this.reverseGeocodeAndApply(lat, lng);
      },
      () => {
        this.mapErrorMessage = 'Could not read your location. Allow location access or move the pin on the map.';
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  private scheduleMapSetup(): void {
    const gen = ++this.mapInitGeneration;
    this.mapLoadState = 'loading';
    queueMicrotask(() => void this.setupPresentAddressMap(gen));
  }

  private loadGoogleMapsScript(apiKey: string): Promise<void> {
    if (typeof google !== 'undefined' && google.maps?.Map) {
      return Promise.resolve();
    }
    if (RegistrationFormComponent.mapsScriptPromise) {
      return RegistrationFormComponent.mapsScriptPromise;
    }
    RegistrationFormComponent.mapsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-app-google-maps="1"]'
      ) as HTMLScriptElement | null;
      if (existing) {
        if (typeof google !== 'undefined' && google.maps?.Map) {
          resolve();
          return;
        }
        const onLoad = (): void => {
          existing.removeEventListener('load', onLoad);
          existing.removeEventListener('error', onError);
          resolve();
        };
        const onError = (): void => {
          existing.removeEventListener('load', onLoad);
          existing.removeEventListener('error', onError);
          reject(new Error('Google Maps failed to load'));
        };
        existing.addEventListener('load', onLoad);
        existing.addEventListener('error', onError);
        return;
      }
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
      s.async = true;
      s.defer = true;
      s.dataset['appGoogleMaps'] = '1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(s);
    });
    return RegistrationFormComponent.mapsScriptPromise;
  }

  private teardownMap(): void {
    if (typeof google !== 'undefined' && google.maps?.event) {
      if (this.autocomplete) {
        google.maps.event.clearInstanceListeners(this.autocomplete);
      }
      if (this.mapClickListener) {
        google.maps.event.removeListener(this.mapClickListener);
      }
      if (this.markerDragListener) {
        google.maps.event.removeListener(this.markerDragListener);
      }
    }
    this.autocomplete = null;
    this.mapClickListener = null;
    this.markerDragListener = null;
    if (this.marker) {
      this.marker.setMap(null);
      this.marker = null;
    }
    this.map = null;
    this.geocoder = null;
    if (this.mapLoadState !== 'error') {
      this.mapLoadState = 'idle';
    }
  }

  private async setupPresentAddressMap(gen: number): Promise<void> {
    const el = this.mapContainer?.nativeElement;
    const areaInput = this.presentAreaInput?.nativeElement;
    if (!el || !areaInput || this.currentStep !== 1) {
      return;
    }

    this.teardownMap();
    if (gen !== this.mapInitGeneration) return;

    this.mapLoadState = 'loading';
    this.mapErrorMessage = '';
    const apiKey = environment.googleMapsApiKey?.trim();
    if (!apiKey) {
      this.mapLoadState = 'error';
      this.mapErrorMessage = 'Google Maps API key is not configured.';
      return;
    }

    try {
      await this.loadGoogleMapsScript(apiKey);
    } catch {
      this.mapLoadState = 'error';
      this.mapErrorMessage = 'Could not load Google Maps. Check the API key and network.';
      return;
    }
    if (gen !== this.mapInitGeneration) return;

    this.geocoder = new google.maps.Geocoder();
    const pos = await this.getInitialLatLng();

    if (gen !== this.mapInitGeneration) return;

    this.map = new google.maps.Map(el, {
      center: pos,
      zoom: 17,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    this.marker = new google.maps.Marker({
      position: pos,
      map: this.map,
      draggable: true,
    });

    this.markerDragListener = google.maps.event.addListener(this.marker, 'dragend', () => {
      const p = this.marker?.getPosition();
      if (!p) return;
      void this.reverseGeocodeAndApply(p.lat(), p.lng());
    });

    this.mapClickListener = google.maps.event.addListener(this.map, 'click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !this.marker) return;
      this.marker.setPosition(e.latLng);
      void this.reverseGeocodeAndApply(e.latLng.lat(), e.latLng.lng());
    });

    this.autocomplete = new google.maps.places.Autocomplete(areaInput, {
      fields: ['address_components', 'formatted_address', 'geometry', 'name'],
      componentRestrictions: { country: 'in' },
      types: ['geocode'],
    });

    google.maps.event.addListener(this.autocomplete, 'place_changed', () => {
      const place = this.autocomplete?.getPlace();
      if (!place?.geometry?.location || !this.marker || !this.map) return;
      const loc = place.geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();
      this.marker.setPosition({ lat, lng });
      this.map.panTo({ lat, lng });
      this.map.setZoom(17);
      this.applyFromAddressComponents(
        place.address_components,
        place.formatted_address ?? place.name ?? ''
      );
    });

    await this.reverseGeocodeAndApply(pos.lat, pos.lng);
    if (gen !== this.mapInitGeneration) return;
    this.mapLoadState = 'ready';
    queueMicrotask(() => {
      if (!this.map || gen !== this.mapInitGeneration) return;
      google.maps.event.trigger(this.map, 'resize');
      const p = this.marker?.getPosition();
      if (p) this.map.setCenter(p);
    });
  }

  private getInitialLatLng(): Promise<google.maps.LatLngLiteral> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 12.9716, lng: 77.5946 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: 12.9716, lng: 77.5946 }),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  private reverseGeocodeAndApply(lat: number, lng: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.geocoder) {
        resolve();
        return;
      }
      this.geocoder.geocode({ location: { lat, lng } }, (results, status: google.maps.GeocoderStatus) => {
        if (status !== 'OK' || !results?.[0]) {
          resolve();
          return;
        }
        const r = results[0];
        this.form.controls.presentArea.setValue(r.formatted_address ?? '', { emitEvent: false });
        this.applyFromAddressComponents(r.address_components, r.formatted_address ?? '');
        this.form.controls.presentPincode.updateValueAndValidity({ emitEvent: false });
        this.form.controls.presentStreet.updateValueAndValidity({ emitEvent: false });
        resolve();
      });
    });
  }

  private applyFromAddressComponents(
    components: google.maps.GeocoderAddressComponent[] | undefined,
    formatted: string
  ): void {
    if (!components?.length) {
      if (formatted) {
        this.form.controls.presentArea.setValue(formatted, { emitEvent: false });
      }
      return;
    }

    let streetNumber = '';
    let route = '';
    let locality = '';
    let admin1 = '';
    let admin2 = '';
    let postal = '';
    let sublocality = '';
    let neighborhood = '';

    for (const c of components) {
      const types = c.types;
      if (types.includes('street_number')) streetNumber = c.long_name;
      if (types.includes('route')) route = c.long_name;
      if (types.includes('locality')) locality = c.long_name;
      if (types.includes('sublocality_level_1') || types.includes('sublocality')) sublocality = c.long_name;
      if (types.includes('administrative_area_level_1')) admin1 = c.long_name;
      if (types.includes('administrative_area_level_2')) admin2 = c.long_name;
      if (types.includes('postal_code')) postal = c.long_name;
      if (types.includes('neighborhood')) neighborhood = c.long_name;
    }

    const street = [streetNumber, route].filter(Boolean).join(' ').trim();
    const city = locality || admin2 || sublocality || '';
    const matchedState = this.matchStateFromGoogle(admin1);
    const landmarkVal = neighborhood;

    if (formatted) {
      this.form.controls.presentArea.setValue(formatted, { emitEvent: false });
    }

    this.form.patchValue(
      {
        presentStreet: street || this.form.controls.presentStreet.value,
        presentCity: city || this.form.controls.presentCity.value,
        presentState: matchedState || admin1 || this.form.controls.presentState.value,
        presentPincode: postal || this.form.controls.presentPincode.value,
        presentCountry: 'IN',
        presentLandmark: landmarkVal || this.form.controls.presentLandmark.value,
      },
      { emitEvent: false }
    );
    // If map/reverse-geocode set a new state, load cities so `ng-select` shows proper options.
    const nextState = matchedState || admin1 || this.form.controls.presentState.value;
    if (nextState) void this.loadPresentCities(nextState);
    if (streetNumber) {
      this.form.controls.presentDoorNo.setValue(streetNumber, { emitEvent: false });
    }
    this.form.controls.presentPincode.updateValueAndValidity({ emitEvent: false });
    this.form.controls.presentStreet.updateValueAndValidity({ emitEvent: false });
    this.form.controls.presentCity.updateValueAndValidity({ emitEvent: false });
    this.form.controls.presentState.updateValueAndValidity({ emitEvent: false });
  }

  private matchStateFromGoogle(admin1: string): string {
    if (!admin1) return '';
    const norm = (s: string) => s.toLowerCase().trim();
    const g = norm(admin1);
    return this.presentStates.find((s) => norm(s) === g) ?? admin1;
  }

  private async loadPresentStates(countryCode: string): Promise<void> {
    const code = (countryCode ?? '').toString().trim();
    if (!code) return;

    try {
      const res = await firstValueFrom(this.dataService.getStatelist(code));
      const items = (res as any)?.data ?? res;
      const list: unknown[] = Array.isArray(items) ? items : [];

      const normalized = list
        .map((x) => {
          if (typeof x === 'string') return x;
          return (x as any)?.name ?? (x as any)?.state ?? (x as any)?.label;
        })
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

      if (normalized.length) {
        this.presentStates = normalized;
        const current = this.form.controls.presentState.value;
        if (current) {
          const canonical = this.presentStates.find((s) => s.toLowerCase() === current.toLowerCase());
          if (canonical && canonical !== current) {
            this.form.controls.presentState.setValue(canonical, { emitEvent: false });
          }
        }
      }
    } catch {
      // Keep fallback `states`.
      this.presentStates = [...this.states];
    }
  }

  private async loadPresentCities(state: string): Promise<void> {
    const nextState = (state ?? '').toString().trim();
    if (!nextState) return;

    const flight = ++this.loadCitiesInFlight;
    try {
      const country = (this.form.controls.presentCountry.value ?? 'IN').toString();
      const res = await firstValueFrom(this.dataService.getcities(country, nextState));
      const items = (res as any)?.data ?? res;
      const list: unknown[] = Array.isArray(items) ? items : [];

      const normalized = list
        .map((x) => {
          if (typeof x === 'string') return x;
          return (x as any)?.name ?? (x as any)?.city ?? (x as any)?.label;
        })
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

      if (flight !== this.loadCitiesInFlight) return;
      this.presentCities = normalized;

      const currentCity = this.form.controls.presentCity.value;
      if (currentCity) {
        const canonicalCity = this.presentCities.find((c) => c.toLowerCase() === currentCity.toLowerCase());
        if (canonicalCity && canonicalCity !== currentCity) {
          this.form.controls.presentCity.setValue(canonicalCity, { emitEvent: false });
        }
      }
    } catch {
      if (flight === this.loadCitiesInFlight) this.presentCities = [];
    }
  }

  private syncCompanyAddressFromPresent(): void {
    this.form.patchValue(
      {
        companyArea: this.form.controls.presentArea.value,
        companyDoorNo: this.form.controls.presentDoorNo.value,
        companyStreet: this.form.controls.presentStreet.value,
        companyLandmark: this.form.controls.presentLandmark.value,
        companyCountry: this.form.controls.presentCountry.value,
        companyState: this.form.controls.presentState.value,
        companyCity: this.form.controls.presentCity.value,
        companyPincode: this.form.controls.presentPincode.value,
      },
      { emitEvent: false }
    );
  }

  private disableCompanyAddressControls(): void {
    this.form.controls.companyArea.disable({ emitEvent: false });
    this.form.controls.companyDoorNo.disable({ emitEvent: false });
    this.form.controls.companyStreet.disable({ emitEvent: false });
    this.form.controls.companyLandmark.disable({ emitEvent: false });
    this.form.controls.companyCountry.disable({ emitEvent: false });
    this.form.controls.companyState.disable({ emitEvent: false });
    this.form.controls.companyCity.disable({ emitEvent: false });
    this.form.controls.companyPincode.disable({ emitEvent: false });
  }

  private enableCompanyAddressControls(): void {
    this.form.controls.companyArea.enable({ emitEvent: false });
    this.form.controls.companyDoorNo.enable({ emitEvent: false });
    this.form.controls.companyStreet.enable({ emitEvent: false });
    this.form.controls.companyLandmark.enable({ emitEvent: false });
    this.form.controls.companyCountry.enable({ emitEvent: false });
    this.form.controls.companyState.enable({ emitEvent: false });
    this.form.controls.companyCity.enable({ emitEvent: false });
    this.form.controls.companyPincode.enable({ emitEvent: false });
  }

  private async loadCompanyCities(state: string): Promise<void> {
    const nextState = (state ?? '').toString().trim();
    if (!nextState) return;

    const flight = ++this.loadCompanyCitiesInFlight;
    try {
      const country = (this.form.controls.companyCountry.value ?? 'IN').toString();
      const res = await firstValueFrom(this.dataService.getcities(country, nextState));
      const items = (res as any)?.data ?? res;
      const list: unknown[] = Array.isArray(items) ? items : [];

      const normalized = list
        .map((x) => {
          if (typeof x === 'string') return x;
          return (x as any)?.name ?? (x as any)?.city ?? (x as any)?.label;
        })
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

      if (flight !== this.loadCompanyCitiesInFlight) return;
      this.companyCities = normalized;
    } catch {
      if (flight === this.loadCompanyCitiesInFlight) this.companyCities = [];
    }
  }

  /** Profile: JPG/JPEG/PNG only, max 2MB (documentation). */
  onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.profileImageError = null;
    this.revokeProfilePreview();
    this.form.controls.profileImage.setErrors(null);

    if (!file) {
      this.form.controls.profileImage.setValue(null);
      this.profileImageFileName = '';
      this.profileImageServerMeta = null;
      this.updateProfileImageValidator();
      return;
    }

    const allowedMime = new Set(['image/jpeg', 'image/jpg', 'image/png']);
    const okExt = /\.(jpe?g|png)$/i.test(file.name);
    const okMime = allowedMime.has(file.type.toLowerCase()) || file.type === '';
    if (!okMime && !okExt) {
      this.profileImageError = 'Use JPG, JPEG, or PNG only.';
      this.form.controls.profileImage.setValue(null);
      this.profileImageFileName = '';
      this.profileImageServerMeta = null;
      this.form.controls.profileImage.setErrors({ fileInvalid: true });
      input.value = '';
      return;
    }

    if (file.size > this.profileMaxBytes) {
      this.profileImageError = 'Image must be 2MB or smaller.';
      this.form.controls.profileImage.setValue(null);
      this.profileImageFileName = '';
      this.profileImageServerMeta = null;
      this.form.controls.profileImage.setErrors({ fileInvalid: true });
      input.value = '';
      return;
    }

    this.form.controls.profileImage.setValue(file);
    this.form.controls.profileImage.markAsTouched();
    this.profileImageFileName = file.name;
    this.profileImagePreviewUrl = URL.createObjectURL(file);
    this.form.controls.profileImage.updateValueAndValidity();
    this.updateProfileImageValidator();

    // Upload to backend
    const formData = new FormData();
    formData.append('files', file);
    void firstValueFrom(this.dataService.uploadCommonFiles(formData))
      .then((res) => {
        this.profileImageServerMeta = res;
        this.updateProfileImageValidator();
      })
      .catch(() => {
        // Keep local preview even if upload fails; surface a soft error.
        this.profileImageError = 'Upload failed. You can retry selecting the image.';
      });
  }

  clearProfileImage(fileInput?: HTMLInputElement): void {
    this.profileImageError = null;
    this.revokeProfilePreview();
    this.form.controls.profileImage.setValue(null);
    this.form.controls.profileImage.markAsTouched();
    this.profileImageFileName = '';
    const meta = this.profileImageServerMeta;
    this.profileImageServerMeta = null;
    if (fileInput) fileInput.value = '';
    this.form.controls.profileImage.setErrors(null);
    this.updateProfileImageValidator();
    if (meta) {
      const data = extractUploadData(meta);
      const files = data ? [data] : [];
      if (!files.length) return;
      void firstValueFrom(
        this.dataService.deleteCommonFiles({
          mode: 'create',
          files,
        })
      ).catch(() => {
        // Ignore delete failures; nothing critical to show in UI here.
      });
    }
  }

  formatIdentityInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const idType = this.form.controls.idType.value as IdentityIdType | '';
    let v = el.value;

    if (idType === 'adhaar') {
      const digits = v.replace(/\D/g, '').slice(0, 12);
      const parts = digits.match(/.{1,4}/g) ?? [];
      v = parts.join('-');
    } else if (idType === 'driving_license') {
      v = v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
    } else if (idType === 'voterId') {
      v = v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
    } else if (idType === 'passport') {
      v = v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9).toUpperCase();
    }

    this.form.controls.idNumber.setValue(v, { emitEvent: false });
    el.value = v;
    this.form.controls.idNumber.updateValueAndValidity({ emitEvent: false });
  }

  onPresentDoorInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const cleaned = el.value.replace(/[^a-zA-Z0-9\s\-/]/g, '');
    this.form.controls.presentDoorNo.setValue(cleaned, { emitEvent: false });
    el.value = cleaned;
  }

  onPresentPincodeInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 6);
    this.form.controls.presentPincode.setValue(digits, { emitEvent: false });
    el.value = digits;
    this.form.controls.presentPincode.updateValueAndValidity({ emitEvent: false });
  }

  private validateIdentityFile(file: File): string | null {
    const max = this.identityMaxBytes;
    if (file.size > max) return 'Each file must be 2MB or smaller.';
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImg =
      file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);
    if (!isPdf && !isImg) return 'Use JPG, PNG, or PDF.';
    return null;
  }

  onIdentityFileSelected(event: Event, slot: 'front' | 'back' | 'passport'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.identityFileError = null;

    const ctrl =
      slot === 'front'
        ? this.form.controls.identityFront
        : slot === 'back'
          ? this.form.controls.identityBack
          : this.form.controls.identityPassport;
    const revokeAndClearUrl = () => {
      const prev =
        slot === 'front'
          ? this.identityFrontPreviewUrl
          : slot === 'back'
            ? this.identityBackPreviewUrl
            : this.identityPassportPreviewUrl;
      if (prev) URL.revokeObjectURL(prev);
      if (slot === 'front') this.identityFrontPreviewUrl = null;
      if (slot === 'back') this.identityBackPreviewUrl = null;
      if (slot === 'passport') this.identityPassportPreviewUrl = null;
    };

    revokeAndClearUrl();

    if (!file) {
      ctrl.setValue(null);
      if (slot === 'front') {
        this.identityFrontFileName = '';
        this.identityFrontServerMeta = null;
      }
      if (slot === 'back') {
        this.identityBackFileName = '';
        this.identityBackServerMeta = null;
      }
      if (slot === 'passport') {
        this.identityPassportFileName = '';
        this.identityPassportServerMeta = null;
      }
      ctrl.updateValueAndValidity();
      this.updateIdentityFileValidators();
      return;
    }

    const err = this.validateIdentityFile(file);
    if (err) {
      this.identityFileError = err;
      ctrl.setValue(null);
      ctrl.setErrors({ fileInvalid: true });
      if (slot === 'front') {
        this.identityFrontFileName = '';
        this.identityFrontServerMeta = null;
      }
      if (slot === 'back') {
        this.identityBackFileName = '';
        this.identityBackServerMeta = null;
      }
      if (slot === 'passport') {
        this.identityPassportFileName = '';
        this.identityPassportServerMeta = null;
      }
      input.value = '';
      return;
    }

    ctrl.setErrors(null);
    ctrl.setValue(file);
    ctrl.markAsTouched();
    if (slot === 'front') {
      this.identityFrontFileName = file.name;
      this.identityFrontPreviewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
    } else if (slot === 'back') {
      this.identityBackFileName = file.name;
      this.identityBackPreviewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
    } else {
      this.identityPassportFileName = file.name;
      this.identityPassportPreviewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
    }
    ctrl.updateValueAndValidity();
    this.updateProfileImageValidator();
    this.updateIdentityFileValidators();

    const formData = new FormData();
    formData.append('files', file);
    void firstValueFrom(this.dataService.uploadCommonFiles(formData))
      .then((res) => {
        if (slot === 'front') this.identityFrontServerMeta = res;
        if (slot === 'back') this.identityBackServerMeta = res;
        if (slot === 'passport') this.identityPassportServerMeta = res;
        this.updateIdentityFileValidators();
      })
      .catch(() => {
        this.identityFileError = 'Upload failed. You can retry selecting the document.';
      });
  }

  clearIdentityFile(slot: 'front' | 'back' | 'passport'): void {
    this.identityFileError = null;
    if (slot === 'front') {
      if (this.identityFrontPreviewUrl) URL.revokeObjectURL(this.identityFrontPreviewUrl);
      this.identityFrontPreviewUrl = null;
      this.form.controls.identityFront.setValue(null);
      this.form.controls.identityFront.setErrors(null);
      this.identityFrontFileName = '';
      this.identityFrontEl && (this.identityFrontEl.nativeElement.value = '');
      const meta = this.identityFrontServerMeta;
      this.identityFrontServerMeta = null;
      if (meta) {
        const data = extractUploadData(meta);
        const files = data ? [data] : [];
        if (!files.length) return;
        void firstValueFrom(
          this.dataService.deleteCommonFiles({
            mode: 'create',
            files,
          })
        ).catch(() => {});
      }
    } else if (slot === 'back') {
      if (this.identityBackPreviewUrl) URL.revokeObjectURL(this.identityBackPreviewUrl);
      this.identityBackPreviewUrl = null;
      this.form.controls.identityBack.setValue(null);
      this.form.controls.identityBack.setErrors(null);
      this.identityBackFileName = '';
      this.identityBackEl && (this.identityBackEl.nativeElement.value = '');
      const meta = this.identityBackServerMeta;
      this.identityBackServerMeta = null;
      if (meta) {
        const data = extractUploadData(meta);
        const files = data ? [data] : [];
        if (!files.length) return;
        void firstValueFrom(
          this.dataService.deleteCommonFiles({
            mode: 'create',
            files,
          })
        ).catch(() => {});
      }
    } else {
      if (this.identityPassportPreviewUrl) URL.revokeObjectURL(this.identityPassportPreviewUrl);
      this.identityPassportPreviewUrl = null;
      this.form.controls.identityPassport.setValue(null);
      this.form.controls.identityPassport.setErrors(null);
      this.identityPassportFileName = '';
      this.identityPassportEl && (this.identityPassportEl.nativeElement.value = '');
      const meta = this.identityPassportServerMeta;
      this.identityPassportServerMeta = null;
      if (meta) {
        const data = extractUploadData(meta);
        const files = data ? [data] : [];
        if (!files.length) return;
        void firstValueFrom(
          this.dataService.deleteCommonFiles({
            mode: 'create',
            files,
          })
        ).catch(() => {});
      }
    }
    this.form.controls[slot === 'front' ? 'identityFront' : slot === 'back' ? 'identityBack' : 'identityPassport'].updateValueAndValidity();
    this.updateIdentityFileValidators();
  }

  onFileSelected(event: Event, key: UploadKeys): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.form.controls[key].setValue(file);
    this.form.controls[key].markAsTouched();
    this.fileNames[key] = file ? file.name : '';

    if (!file) return;

    const formData = new FormData();
    formData.append('files', file);
    void firstValueFrom(this.dataService.uploadCommonFiles(formData)).catch(() => {
      // Keep local selection even if upload fails.
    });
  }

  /**
   * Maps wizard data to backend `User` schema keys. Only includes objects/keys with data
   * (experience_background always includes four keys; terms_accepted always included).
   * Binary fields from the form are not sent (separate upload API can be wired later).
   */
  private buildFranchiseApplicationPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    const { firstName, lastName } = splitFullName(raw.fullName);

    // Personal info base (textual fields)
    const personalInfoBase: Record<string, unknown> = {
      firstName,
      lastName,
      email: raw.email.trim(),
      mobile_number: raw.mobile.trim(),
      gender: trimToNull(raw.gender),
      dob: trimToNull(raw.dateOfBirth),
      area: trimToNull(raw.presentArea),
      doorno: trimToNull(raw.presentDoorNo),
      street: trimToNull(raw.presentStreet),
      landmark: trimToNull(raw.presentLandmark),
      country: trimToNull(raw.presentCountry),
      state: trimToNull(raw.presentState),
      city: trimToNull(raw.presentCity),
      pincode: trimToNull(raw.presentPincode),
      idType: trimToNull(raw.idType),
      idNumber: trimToNull(raw.idNumber),
    };

    // Attach profileimage upload record if available
    const profileUpload = buildUploadRecord(this.profileImageServerMeta, false);
    if (profileUpload) {
      personalInfoBase['profileimage'] = profileUpload;
    }

    // Attach identity_image according to idType
    const idType = (raw.idType ?? '').toString();
    let identityImage: unknown = null;
    if (idType === 'passport') {
      const passportRecord = buildUploadRecord(this.identityPassportServerMeta, false);
      if (passportRecord) {
        identityImage = passportRecord;
      }
    } else {
      const frontRecord = buildUploadRecord(this.identityFrontServerMeta, false);
      const backRecord = buildUploadRecord(this.identityBackServerMeta, false);
      const identityObj: Record<string, unknown> = {};
      if (frontRecord) identityObj['front'] = frontRecord;
      if (backRecord) identityObj['back'] = backRecord;
      if (Object.keys(identityObj).length > 0) {
        identityImage = identityObj;
      }
    }

    if (identityImage) {
      (personalInfoBase as Record<string, unknown>)['identity_image'] = identityImage;
    }

    const personalInfo = omitNullProps(personalInfoBase);

    const hasCompany = raw.hasRegisteredCompany === 'Yes';
    const companyInfo = hasCompany
      ? omitNullProps({
          companyName: trimToNull(raw.companyName),
          companyemail: trimToNull(raw.companyemail),
          companymobile_number: trimToNull(raw.companymobile_number),
          sameaddress: raw.companySameAddress,
          companyarea: trimToNull(raw.companyArea),
          doorno: trimToNull(raw.companyDoorNo),
          street: trimToNull(raw.companyStreet),
          landmark: trimToNull(raw.companyLandmark),
          companycountry: trimToNull(raw.companyCountry),
          companystate: trimToNull(raw.companyState),
          companycity: trimToNull(raw.companyCity),
          companypincode: trimToNull(raw.companyPincode),
        })
      : {};

    const experience_background = {
      work_experience: trimToNull(raw.workExperience),
      healthcare_experience: trimToNull(raw.healthcareExperience),
      sales_business_experience: trimToNull(raw.salesExperience),
      background_note: trimToNull(raw.backgroundNote),
    };

    const payload: Record<string, unknown> = {
      personalInfo,
      companyInfo,
      experience_background,
      terms_accepted: raw.acceptTerms === true,
    };

    if (hasCompany) {
      const bs = trimToNull(raw.businessStructure);
      if (bs !== null) {
        payload['businessStructure'] = bs;
      }

      const bw = trimToNull(raw.businessWebsite);
      if (bw !== null) {
        payload['businessWebsite'] = bw;
      }
    }

    return payload;
  }

  private resetApplicationForm(): void {
    this.currentStep = 1;
    this.formAttempted = false;
    this.submitError = null;

    this.mapInitGeneration++;
    this.teardownMap();

    this.revokeProfilePreview();
    this.revokeIdentityPreviews();
    this.profileImageFileName = '';
    this.identityFrontFileName = '';
    this.identityBackFileName = '';
    this.identityPassportFileName = '';
    this.profileImageError = null;
    this.identityFileError = null;
    this.profileImageServerMeta = null;
    this.identityFrontServerMeta = null;
    this.identityBackServerMeta = null;
    this.identityPassportServerMeta = null;

    this.form.reset(
      {
        profileImage: null,
        gender: '',
        dateOfBirth: '',
        fullName: '',
        email: '',
        mobile: '',
        presentArea: '',
        presentDoorNo: '',
        presentStreet: '',
        presentLandmark: '',
        presentCountry: 'IN',
        presentState: '',
        presentCity: '',
        presentPincode: '',
        idType: '',
        idNumber: '',
        identityFront: null,
        identityBack: null,
        identityPassport: null,
        hasRegisteredCompany: 'No',
        companyName: '',
        companyemail: '',
        companymobile_number: '',
        businessWebsite: '',
        businessStructure: '',
        companySameAddress: 'Yes',
        companyArea: '',
        companyDoorNo: '',
        companyStreet: '',
        companyLandmark: '',
        companyCountry: 'IN',
        companyState: '',
        companyCity: '',
        companyPincode: '',
        city: '',
        state: '',
        workExperience: '',
        healthcareExperience: '',
        salesExperience: '',
        backgroundNote: '',
        investmentCapacity: '',
        preferredZone: '',
        existingBusiness: '',
        staffCount: '',
        acceptTerms: false,
        idProof: null,
        addressProof: null,
        businessProof: null,
      },
      { emitEvent: false }
    );

    this.updateProfileImageValidator();
    this.updateIdentityFileValidators();
    void this.loadPresentStates('IN');
    this.presentCities = [];
    this.companyCities = [];

    this.setCompanyDetailsRequired(false);
    this.enableCompanyAddressControls();

    if (this.identityFrontEl?.nativeElement) this.identityFrontEl.nativeElement.value = '';
    if (this.identityBackEl?.nativeElement) this.identityBackEl.nativeElement.value = '';
    if (this.identityPassportEl?.nativeElement) this.identityPassportEl.nativeElement.value = '';

    this.fileNames.idProof = '';
    this.fileNames.addressProof = '';
    this.fileNames.businessProof = '';

    queueMicrotask(() => this.scheduleMapSetup());
  }

  async submitApplication(): Promise<void> {
    this.formAttempted = true;
    this.submitError = null;

    this.markStepTouched(1);
    this.markStepTouched(2);
    this.markStepTouched(3);
    this.markStepTouched(4);

    if (!this.form.valid) {
      this.scrollTop();
      return;
    }

    this.submitting = true;
    try {
      if (!this.isRegistrationFeePaid) {
        const paymentResult = await this.processRazorpayPayment();
        if (!paymentResult) {
          this.submitError = 'Payment was not completed. Please try again.';
          this.scrollTop();
          return;
        }
      }

      const url = `${environment.franchiseRegistrationApiUrl.replace(/\/$/, '')}/api/users/me`;
      const payload = this.buildFranchiseApplicationPayload();
      await firstValueFrom(this.http.put<unknown>(url, payload));

      // Force full page refresh on same route so form and payment status are rehydrated cleanly.
      window.location.reload();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        const body = err.error;
        let msg = 'Submission failed. Please try again.';
        if (body && typeof body === 'object' && body !== null && 'message' in body) {
          const m = (body as { message: unknown }).message;
          if (typeof m === 'string' && m.trim() !== '') {
            msg = m;
          }
        }
        this.submitError = msg;
      } else {
        this.submitError = 'Submission failed. Please try again.';
      }
      this.scrollTop();
    } finally {
      this.submitting = false;
    }
  }

  private async processRazorpayPayment(): Promise<boolean> {
    await this.ensureRazorpayLoaded();

    const order = await firstValueFrom(this.apiService.createOrder()) as RazorpayOrderResponse;
    if (!order?.id || !order?.amount || !order?.currency) {
      throw new Error('Could not create payment order.');
    }

    const name = this.form.controls.fullName.value || 'Franchise User';
    const email = this.form.controls.email.value || '';
    const mobile = this.form.controls.mobile.value || '';

    return new Promise<boolean>((resolve, reject) => {
      const options: Record<string, unknown> = {
        key: environment.razorpayKey,
        amount: order.amount,
        currency: order.currency,
        name: 'Franchise Registration',
        description: 'Application Fee',
        order_id: order.id,
        prefill: {
          name,
          email,
          contact: mobile,
        },
        theme: {
          color: '#3399cc',
        },
        handler: async (response: RazorpayVerifyPayload) => {
          try {
            await firstValueFrom(this.apiService.verifyPayment(response));
            resolve(true);
          } catch {
            reject(new Error('Payment verification failed.'));
          }
        },
        modal: {
          ondismiss: () => resolve(false),
        },
      };

      try {
        const rzp = new window.Razorpay!(options);
        rzp.open();
      } catch {
        reject(new Error('Unable to open payment gateway.'));
      }
    });
  }

  private async ensureRazorpayLoaded(): Promise<void> {
    if (window.Razorpay) return;

    const existing = document.querySelector(
      'script[data-razorpay-checkout="1"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      await new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          existing.removeEventListener('load', onLoad);
          existing.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          existing.removeEventListener('load', onLoad);
          existing.removeEventListener('error', onError);
          reject(new Error('Unable to load Razorpay SDK.'));
        };
        existing.addEventListener('load', onLoad);
        existing.addEventListener('error', onError);
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.dataset['razorpayCheckout'] = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay SDK.'));
      document.body.appendChild(script);
    });
  }
}
