import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: false,
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss',
})
export class AdminLoginComponent {
  form: FormGroup;

  loading = false;
  error: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AdminAuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      password: ['', [Validators.required]],
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.loading) return;

    this.loading = true;
    this.error = null;

    const { mobile, password } = this.form.value;

    this.auth
      .login({
        mobile: mobile ?? '',
        password: password ?? '',
      })
      .subscribe({
        next: () => this.router.navigateByUrl('/admin/dashboard'),
        error: (err) => {
          this.error = err?.error?.message ?? 'Admin login failed';
          this.loading = false;
        },
        complete: () => {
          this.loading = false;
        },
      });
  }
}
