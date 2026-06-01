import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { catchError, finalize, of, switchMap, take } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../services/auth';
import { BusinessCenterService } from '../../services/business-center.service';
import { CompanyContextService } from '../../core/context/company-context.service';

type CompanySetupForm = {
  companyName: string;
  contactName: string;
  workEmail: string;
  phone: string;
  industry: string;
  teamSize: string;
  country: string;
  city: string;
  website: string;
  timezone: string;
  defaultLanguage: string;
};

@Component({
  selector: 'app-company-setup-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="setup-shell">
      <div class="setup-shell__ambient" aria-hidden="true"></div>

      <div class="setup-shell__panel app-dashboard-panel">
        <div class="setup-shell__header">
          <div>
            <p class="setup-shell__eyebrow">Workspace Setup</p>
            <h1>Create Workspace</h1>
            <p class="setup-shell__copy">
              Set up your company workspace and start inviting your team.
            </p>
          </div>

          <a routerLink="/app/workspace-access" class="setup-shell__button">
            Back to Workspace Access
          </a>
        </div>

        <p class="setup-shell__note" *ngIf="statusMessage">{{ statusMessage }}</p>

        <form class="setup-form" (ngSubmit)="submit()" #formRef="ngForm">
          <label>
            <span>Company Name</span>
            <input [(ngModel)]="form.companyName" name="companyName" required class="setup-input" />
          </label>

          <label>
            <span>Contact Name</span>
            <input [(ngModel)]="form.contactName" name="contactName" required class="setup-input" />
          </label>

          <label>
            <span>Work Email</span>
            <input [(ngModel)]="form.workEmail" name="workEmail" type="email" required class="setup-input" />
          </label>

          <div class="setup-form__grid">
            <label><span>Phone</span><input [(ngModel)]="form.phone" name="phone" class="setup-input" /></label>
            <label><span>Industry</span><input [(ngModel)]="form.industry" name="industry" class="setup-input" /></label>
            <label><span>Team Size</span><input [(ngModel)]="form.teamSize" name="teamSize" class="setup-input" /></label>
            <label><span>Country</span><input [(ngModel)]="form.country" name="country" class="setup-input" /></label>
            <label><span>City</span><input [(ngModel)]="form.city" name="city" class="setup-input" /></label>
            <label><span>Website</span><input [(ngModel)]="form.website" name="website" class="setup-input" /></label>
            <label><span>Timezone</span><input [(ngModel)]="form.timezone" name="timezone" class="setup-input" /></label>
            <label><span>Default Language</span><input [(ngModel)]="form.defaultLanguage" name="defaultLanguage" class="setup-input" /></label>
          </div>

          <div class="setup-shell__actions">
            <button
              type="submit"
              class="setup-shell__button setup-shell__button--primary"
              [disabled]="submitting || formRef.invalid">
              {{ submitting ? 'Creating...' : 'Create Workspace' }}
            </button>
            <a routerLink="/app/workspace-access" class="setup-shell__button">
              Back to Workspace Access
            </a>
          </div>
        </form>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .setup-shell {
      position: relative;
      min-height: calc(100vh - 4rem);
      display: grid;
      place-items: center;
      padding: 1rem;
      overflow: hidden;
    }

    .setup-shell__ambient {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(800px at 15% 10%, rgba(56, 189, 248, 0.16), transparent 45%),
        radial-gradient(700px at 80% 0%, rgba(99, 102, 241, 0.15), transparent 42%),
        linear-gradient(180deg, rgba(5, 8, 22, 0), rgba(5, 8, 22, 0.2));
      pointer-events: none;
    }

    .setup-shell__panel {
      position: relative;
      z-index: 1;
      width: min(100%, 60rem);
      padding: 1.4rem;
      border-radius: 1.8rem;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 46%),
        rgba(9, 14, 28, 0.92);
    }

    .setup-shell__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .setup-shell__eyebrow {
      margin: 0;
      color: rgba(125, 211, 252, 0.88);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0.35rem 0 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      letter-spacing: -0.05em;
    }

    .setup-shell__copy,
    .setup-shell__note {
      margin: 0.8rem 0 0;
      color: rgba(226, 232, 240, 0.72);
      line-height: 1.7;
    }

    .setup-shell__note {
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(56, 189, 248, 0.16);
      background: rgba(56, 189, 248, 0.08);
    }

    .setup-form {
      display: grid;
      gap: 0.9rem;
      margin-top: 1rem;
    }

    .setup-form label {
      display: grid;
      gap: 0.35rem;
    }

    .setup-form span {
      color: rgba(226, 232, 240, 0.62);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .setup-form__grid {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .setup-input {
      width: 100%;
      min-height: 2.8rem;
      padding: 0.68rem 0.85rem;
      border-radius: 1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(255, 255, 255, 0.04);
      color: #f8fafc;
      outline: none;
    }

    .setup-input::placeholder {
      color: rgba(226, 232, 240, 0.38);
    }

    .setup-shell__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-top: 0.4rem;
    }

    .setup-shell__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.7rem;
      padding: 0.6rem 1rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      color: #e2e8f0;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.04);
    }

    .setup-shell__button--primary {
      border-color: rgba(56, 189, 248, 0.2);
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(20, 184, 166, 0.22));
      color: #f8fafc;
    }

    @media (max-width: 720px) {
      .setup-shell__panel {
        padding: 1rem;
      }

      .setup-shell__header {
        flex-direction: column;
      }

      .setup-form__grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CompanySetupPageComponent implements OnInit {
  loading = true;
  submitting = false;
  statusMessage = '';
  currentUserId: string | null = null;
  token: string | null = null;

  form: CompanySetupForm = {
    companyName: '',
    contactName: '',
    workEmail: '',
    phone: '',
    industry: '',
    teamSize: '',
    country: '',
    city: '',
    website: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    defaultLanguage: 'en'
  };

  constructor(
    private auth: AuthService,
    private businessCenter: BusinessCenterService,
    private companyContext: CompanyContextService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.statusMessage = 'Checking your session...';
    this.auth.ensureSessionToken().pipe(
      take(1),
      switchMap((ready) => {
        if (!ready) {
          this.router.navigateByUrl('/login');
          return of(null);
        }

        this.token = this.auth.getStoredAccessToken();
        return this.auth.getCurrentUser(this.token ?? undefined, { hydrateWorkspace: false }).pipe(
          catchError(() => of(null))
        );
      })
    ).subscribe({
      next: (user) => {
        this.loading = false;
        this.statusMessage = '';

        const userId = typeof user?.id === 'string' ? user.id : typeof user?.id === 'number' ? String(user.id) : null;
        this.currentUserId = userId;

        if (!userId) {
          this.router.navigateByUrl('/login');
        }
      },
      error: () => {
        this.loading = false;
        this.statusMessage = '';
        this.router.navigateByUrl('/login');
      }
    });
  }

  submit(): void {
    if (this.submitting || !this.currentUserId || !this.token) {
      return;
    }

    const companyName = this.form.companyName.trim();
    const contactName = this.form.contactName.trim();
    const workEmail = this.form.workEmail.trim();

    if (!companyName || !contactName || !workEmail) {
      this.statusMessage = 'Please complete the required fields.';
      return;
    }

    this.submitting = true;
    this.statusMessage = 'Creating your workspace...';

    this.businessCenter.createWorkspace(
      {
        companyName,
        contactName,
        workEmail,
        phone: this.emptyToNull(this.form.phone),
        industry: this.emptyToNull(this.form.industry),
        teamSize: this.emptyToNull(this.form.teamSize),
        country: this.emptyToNull(this.form.country),
        city: this.emptyToNull(this.form.city),
        website: this.emptyToNull(this.form.website),
        timezone: this.emptyToNull(this.form.timezone),
        defaultLanguage: this.emptyToNull(this.form.defaultLanguage) ?? 'en'
      },
      this.currentUserId,
      this.token
    ).pipe(
      switchMap((result) => {
        if (!result.ok || !result.businessProfileId) {
          return of(result);
        }

        return this.companyContext.activateWorkspace(result.businessProfileId, 'owner', null).pipe(
          map(() => result),
          catchError((error) =>
            of({
              ok: false,
              message: this.normalizeError(error, 'We created the workspace, but could not activate it.'),
              businessProfileId: result.businessProfileId
            })
          )
        );
      }),
      finalize(() => {
        this.submitting = false;
      })
    ).subscribe({
      next: (result) => {
        if (!result.ok) {
          this.statusMessage = result.message;
          return;
        }

        this.router.navigateByUrl('/app/dashboard');
      },
      error: (error) => {
        this.statusMessage = this.normalizeError(error, 'We could not create the workspace.');
      }
    });
  }

  private emptyToNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeError(error: any, fallback: string): string {
    return (
      error?.error?.errors?.[0]?.extensions?.reason ||
      error?.error?.errors?.[0]?.message ||
      error?.error?.message ||
      error?.message ||
      fallback
    );
  }
}
