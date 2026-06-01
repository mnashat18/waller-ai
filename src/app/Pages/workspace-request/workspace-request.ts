import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth';
import {
  type WorkspaceApplicationRecord,
  WorkspaceApplicationsService
} from '../../services/workspace-applications.service';

type WorkspaceRequestForm = {
  company_name: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  industry: string;
  team_size: string;
  country: string;
  use_case: string;
  phone: string;
  city: string;
  website: string;
  company_registration_number: string;
  expected_launch_date: string;
  message: string;
};

type WorkspaceRequestState =
  | 'checkingSession'
  | 'form'
  | 'pendingExisting'
  | 'needsMoreInfo'
  | 'rejected'
  | 'submitting'
  | 'success'
  | 'error';

type WorkspaceRequestValidationErrors = Partial<Record<keyof WorkspaceRequestForm, string>>;

type CleanWorkspaceRequest = {
  company_name: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  phone: string | null;
  industry: string;
  team_size: number;
  country: string;
  city: string | null;
  website: string | null;
  company_registration_number: string | null;
  use_case: string;
  expected_launch_date: string | null;
  message: string | null;
};

type DirectusUser = {
  id: string | number;
  email?: string | null;
};

@Component({
  selector: 'app-workspace-request-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="request-shell">
      <div class="request-shell__ambient" aria-hidden="true"></div>

      <div class="request-shell__panel app-dashboard-panel">
        <ng-container [ngSwitch]="state">
          <ng-container *ngSwitchCase="'checkingSession'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Checking your session...</h1>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'form'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Request Enterprise Workspace</h1>
                <p class="request-shell__copy">
                  Tell us about your company and we will review the request before activation.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <p class="request-shell__note" *ngIf="existingApplication">
              You already have a workspace request under review.
            </p>

            <p class="request-shell__note request-shell__note--warning" *ngIf="validationWarning">
              {{ validationWarning }}
            </p>

            <form class="request-form" (ngSubmit)="submit()" #formRef="ngForm">
              <div class="request-form__grid request-form__grid--required">
                <label>
                  <span>Company Name</span>
                  <input [(ngModel)]="form.company_name" name="company_name" required minlength="2" maxlength="120" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('company_name')">{{ fieldError('company_name') }}</small>
                </label>
                <label>
                  <span>Contact Name</span>
                  <input [(ngModel)]="form.contact_name" name="contact_name" required minlength="2" maxlength="100" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('contact_name')">{{ fieldError('contact_name') }}</small>
                </label>
                <label>
                  <span>Job Title</span>
                  <input [(ngModel)]="form.job_title" name="job_title" required minlength="2" maxlength="100" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('job_title')">{{ fieldError('job_title') }}</small>
                </label>
                <label>
                  <span>Work Email</span>
                  <input [(ngModel)]="form.work_email" name="work_email" type="email" required maxlength="120" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('work_email')">{{ fieldError('work_email') }}</small>
                </label>
                <label>
                  <span>Industry</span>
                  <input [(ngModel)]="form.industry" name="industry" required minlength="2" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('industry')">{{ fieldError('industry') }}</small>
                </label>
                <label>
                  <span>Team Size</span>
                  <input [(ngModel)]="form.team_size" name="team_size" required type="number" min="1" max="100000" step="1" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('team_size')">{{ fieldError('team_size') }}</small>
                </label>
                <label>
                  <span>Country</span>
                  <input [(ngModel)]="form.country" name="country" required minlength="2" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('country')">{{ fieldError('country') }}</small>
                </label>
                <label>
                  <span>Use Case</span>
                  <input [(ngModel)]="form.use_case" name="use_case" required minlength="20" maxlength="1000" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('use_case')">{{ fieldError('use_case') }}</small>
                </label>
              </div>

              <div class="request-form__grid">
                <label>
                  <span>Phone</span>
                  <input [(ngModel)]="form.phone" name="phone" maxlength="30" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('phone')">{{ fieldError('phone') }}</small>
                </label>
                <label>
                  <span>City</span>
                  <input [(ngModel)]="form.city" name="city" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('city')">{{ fieldError('city') }}</small>
                </label>
                <label>
                  <span>Website</span>
                  <input [(ngModel)]="form.website" name="website" maxlength="255" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('website')">{{ fieldError('website') }}</small>
                </label>
                <label>
                  <span>Company Registration Number</span>
                  <input [(ngModel)]="form.company_registration_number" name="company_registration_number" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('company_registration_number')">{{ fieldError('company_registration_number') }}</small>
                </label>
                <label>
                  <span>Expected Launch Date</span>
                  <input [(ngModel)]="form.expected_launch_date" name="expected_launch_date" type="date" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('expected_launch_date')">{{ fieldError('expected_launch_date') }}</small>
                </label>
                <label>
                  <span>Message</span>
                  <textarea [(ngModel)]="form.message" name="message" class="request-input request-input--textarea"></textarea>
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('message')">{{ fieldError('message') }}</small>
                </label>
              </div>

              <div class="request-shell__actions">
                <button
                  type="submit"
                  class="request-shell__button request-shell__button--primary"
                  [disabled]="state === 'submitting' || formRef.invalid">
                  {{ state === 'submitting' ? 'Submitting...' : 'Submit Request' }}
                </button>
                <a routerLink="/app/workspace-access" class="request-shell__button">Back to Workspace Access</a>
                <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
              </div>
            </form>
          </ng-container>

          <ng-container *ngSwitchCase="'pendingExisting'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Workspace request under review</h1>
                <p class="request-shell__copy">
                  Your company workspace request is being reviewed by the Wellar team.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <p class="request-shell__note" *ngIf="existingApplication">
              Company: {{ existingApplication.companyName || 'Unknown company' }} | Work Email: {{ existingApplication.workEmail || 'Unknown email' }}<br />
              Submitted: {{ existingApplication.submittedAt ? (existingApplication.submittedAt | date : 'mediumDate') : 'Unknown date' }} | Status: Pending Review
            </p>

            <div class="request-shell__actions">
              <a routerLink="/contact" class="request-shell__button request-shell__button--primary">Contact Support</a>
              <a routerLink="/app/workspace-access" class="request-shell__button">Back to Workspace Access</a>
              <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'needsMoreInfo'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>More information needed</h1>
                <p class="request-shell__copy">
                  The Wellar team needs more information before approving your workspace request.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <p class="request-shell__note" *ngIf="existingApplication">
              {{ existingApplication.reviewNote || 'Please review the note from the Wellar team below.' }}
            </p>

            <form class="request-form" (ngSubmit)="submit()" #formRef="ngForm">
              <div class="request-form__grid request-form__grid--required">
                <label>
                  <span>Company Name</span>
                  <input [(ngModel)]="form.company_name" name="company_name" required minlength="2" maxlength="120" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('company_name')">{{ fieldError('company_name') }}</small>
                </label>
                <label>
                  <span>Contact Name</span>
                  <input [(ngModel)]="form.contact_name" name="contact_name" required minlength="2" maxlength="100" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('contact_name')">{{ fieldError('contact_name') }}</small>
                </label>
                <label>
                  <span>Job Title</span>
                  <input [(ngModel)]="form.job_title" name="job_title" required minlength="2" maxlength="100" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('job_title')">{{ fieldError('job_title') }}</small>
                </label>
                <label>
                  <span>Work Email</span>
                  <input [(ngModel)]="form.work_email" name="work_email" type="email" required maxlength="120" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('work_email')">{{ fieldError('work_email') }}</small>
                </label>
                <label>
                  <span>Industry</span>
                  <input [(ngModel)]="form.industry" name="industry" required minlength="2" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('industry')">{{ fieldError('industry') }}</small>
                </label>
                <label>
                  <span>Team Size</span>
                  <input [(ngModel)]="form.team_size" name="team_size" required type="number" min="1" max="100000" step="1" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('team_size')">{{ fieldError('team_size') }}</small>
                </label>
                <label>
                  <span>Country</span>
                  <input [(ngModel)]="form.country" name="country" required minlength="2" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('country')">{{ fieldError('country') }}</small>
                </label>
                <label>
                  <span>Use Case</span>
                  <input [(ngModel)]="form.use_case" name="use_case" required minlength="20" maxlength="1000" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('use_case')">{{ fieldError('use_case') }}</small>
                </label>
              </div>

              <div class="request-form__grid">
                <label>
                  <span>Phone</span>
                  <input [(ngModel)]="form.phone" name="phone" maxlength="30" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('phone')">{{ fieldError('phone') }}</small>
                </label>
                <label>
                  <span>City</span>
                  <input [(ngModel)]="form.city" name="city" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('city')">{{ fieldError('city') }}</small>
                </label>
                <label>
                  <span>Website</span>
                  <input [(ngModel)]="form.website" name="website" maxlength="255" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('website')">{{ fieldError('website') }}</small>
                </label>
                <label>
                  <span>Company Registration Number</span>
                  <input [(ngModel)]="form.company_registration_number" name="company_registration_number" maxlength="80" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('company_registration_number')">{{ fieldError('company_registration_number') }}</small>
                </label>
                <label>
                  <span>Expected Launch Date</span>
                  <input [(ngModel)]="form.expected_launch_date" name="expected_launch_date" type="date" class="request-input" />
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('expected_launch_date')">{{ fieldError('expected_launch_date') }}</small>
                </label>
                <label>
                  <span>Message</span>
                  <textarea [(ngModel)]="form.message" name="message" class="request-input request-input--textarea"></textarea>
                  <small class="request-field-error" *ngIf="submitAttempted && fieldError('message')">{{ fieldError('message') }}</small>
                </label>
              </div>

              <div class="request-shell__actions">
                <button
                  type="submit"
                  class="request-shell__button request-shell__button--primary"
                  [disabled]="state === 'submitting' || formRef.invalid">
                  {{ state === 'submitting' ? 'Submitting...' : 'Update Request' }}
                </button>
                <a routerLink="/app/workspace-access" class="request-shell__button">Back to Workspace Access</a>
                <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
              </div>
            </form>
          </ng-container>

          <ng-container *ngSwitchCase="'rejected'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Workspace request not approved</h1>
                <p class="request-shell__copy">
                  Your workspace request was not approved. Contact the Wellar team for more information.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <p class="request-shell__note" *ngIf="existingApplication">
              Company: {{ existingApplication.companyName || 'Unknown company' }} | Work Email: {{ existingApplication.workEmail || 'Unknown email' }}<br />
              Submitted: {{ existingApplication.submittedAt ? (existingApplication.submittedAt | date : 'mediumDate') : 'Unknown date' }} | Status: Rejected
            </p>

            <div class="request-shell__actions">
              <a routerLink="/contact" class="request-shell__button request-shell__button--primary">Contact Support</a>
              <a routerLink="/app/workspace-access" class="request-shell__button">Back to Workspace Access</a>
              <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'submitting'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Submitting your request...</h1>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'success'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Workspace request submitted</h1>
                <p class="request-shell__copy">
                  Your request is under review. The Wellar team will contact you before activating your operational workspace.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <div class="request-state">
              <article class="request-card request-card--success">
                <p class="request-card__eyebrow">Submitted</p>
                <h3>Workspace request submitted</h3>
                <p class="request-card__copy">
                  Your request is under review. The Wellar team will contact you before activating your operational workspace.
                </p>
                <div class="request-shell__actions">
                  <a routerLink="/app/workspace-access" class="request-shell__button request-shell__button--primary">Back to Workspace Access</a>
                  <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
                </div>
              </article>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'error'">
            <div class="request-shell__header">
              <div>
                <p class="request-shell__eyebrow">Workspace Request</p>
                <h1>Request Enterprise Workspace</h1>
                <p class="request-shell__copy">
                  Tell us about your company and we will review the request before activation.
                </p>
              </div>
              <a routerLink="/app/workspace-access" class="request-shell__button">
                Back to Workspace Access
              </a>
            </div>

            <p class="request-shell__note request-shell__note--error" *ngIf="statusMessage">
              {{ statusMessage }}
            </p>

            <form class="request-form" (ngSubmit)="submit()" #formRef="ngForm">
              <div class="request-form__grid request-form__grid--required">
                <label>
                  <span>Company Name</span>
                  <input [(ngModel)]="form.company_name" name="company_name" required class="request-input" />
                </label>
                <label>
                  <span>Contact Name</span>
                  <input [(ngModel)]="form.contact_name" name="contact_name" required class="request-input" />
                </label>
                <label>
                  <span>Job Title</span>
                  <input [(ngModel)]="form.job_title" name="job_title" required class="request-input" />
                </label>
                <label>
                  <span>Work Email</span>
                  <input [(ngModel)]="form.work_email" name="work_email" type="email" required class="request-input" />
                </label>
                <label>
                  <span>Industry</span>
                  <input [(ngModel)]="form.industry" name="industry" required class="request-input" />
                </label>
                <label>
                  <span>Team Size</span>
                  <input [(ngModel)]="form.team_size" name="team_size" required class="request-input" />
                </label>
                <label>
                  <span>Country</span>
                  <input [(ngModel)]="form.country" name="country" required class="request-input" />
                </label>
                <label>
                  <span>Use Case</span>
                  <input [(ngModel)]="form.use_case" name="use_case" required class="request-input" />
                </label>
              </div>

              <div class="request-form__grid">
                <label><span>Phone</span><input [(ngModel)]="form.phone" name="phone" class="request-input" /></label>
                <label><span>City</span><input [(ngModel)]="form.city" name="city" class="request-input" /></label>
                <label><span>Website</span><input [(ngModel)]="form.website" name="website" class="request-input" /></label>
                <label>
                  <span>Company Registration Number</span>
                  <input [(ngModel)]="form.company_registration_number" name="company_registration_number" class="request-input" />
                </label>
                <label>
                  <span>Expected Launch Date</span>
                  <input [(ngModel)]="form.expected_launch_date" name="expected_launch_date" type="date" class="request-input" />
                </label>
                <label>
                  <span>Message</span>
                  <textarea [(ngModel)]="form.message" name="message" class="request-input request-input--textarea"></textarea>
                </label>
              </div>

              <div class="request-shell__actions">
                <button
                  type="submit"
                  class="request-shell__button request-shell__button--primary"
                  [disabled]="state === 'submitting' || formRef.invalid">
                  {{ state === 'submitting' ? 'Submitting...' : 'Submit Request' }}
                </button>
                <a routerLink="/app/workspace-access" class="request-shell__button">Back to Workspace Access</a>
                <button type="button" class="request-shell__button" (click)="logout()">Logout</button>
              </div>
            </form>
          </ng-container>
        </ng-container>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .request-shell {
      position: relative;
      min-height: calc(100vh - 4rem);
      display: grid;
      place-items: center;
      padding: 1rem;
      overflow: hidden;
    }

    .request-shell__ambient {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(800px at 15% 10%, rgba(56, 189, 248, 0.16), transparent 45%),
        radial-gradient(700px at 80% 0%, rgba(99, 102, 241, 0.15), transparent 42%),
        linear-gradient(180deg, rgba(5, 8, 22, 0), rgba(5, 8, 22, 0.2));
      pointer-events: none;
    }

    .request-shell__panel {
      position: relative;
      z-index: 1;
      width: min(100%, 64rem);
      padding: 1.4rem;
      border-radius: 1.8rem;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 46%),
        rgba(9, 14, 28, 0.92);
    }

    .request-shell__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .request-shell__eyebrow {
      margin: 0;
      color: rgba(125, 211, 252, 0.88);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    h1, h3 {
      margin: 0.35rem 0 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      letter-spacing: -0.05em;
    }

    h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); }
    h3 { font-size: 1.15rem; }

    .request-shell__copy,
    .request-shell__note,
    .request-card__copy {
      margin: 0.8rem 0 0;
      color: rgba(226, 232, 240, 0.72);
      line-height: 1.7;
    }

    .request-shell__note {
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(56, 189, 248, 0.16);
      background: rgba(56, 189, 248, 0.08);
    }

    .request-shell__note--error {
      border-color: rgba(248, 113, 113, 0.18);
      background: rgba(248, 113, 113, 0.08);
    }

    .request-shell__note--warning {
      border-color: rgba(250, 204, 21, 0.18);
      background: rgba(250, 204, 21, 0.08);
      color: rgba(254, 240, 138, 0.92);
    }

    .request-form {
      display: grid;
      gap: 0.9rem;
      margin-top: 1rem;
    }

    .request-form label {
      display: grid;
      gap: 0.35rem;
    }

    .request-field-error {
      color: #fca5a5;
      font-size: 0.8rem;
      line-height: 1.4;
    }

    .request-form span,
    .request-card__eyebrow {
      color: rgba(226, 232, 240, 0.62);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .request-form__grid {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .request-form__grid--required {
      margin-bottom: 0.35rem;
    }

    .request-input {
      width: 100%;
      min-height: 2.8rem;
      padding: 0.68rem 0.85rem;
      border-radius: 1rem;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(255, 255, 255, 0.04);
      color: #f8fafc;
      outline: none;
    }

    .request-input--textarea {
      min-height: 7.5rem;
      resize: vertical;
    }

    .request-shell__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-top: 0.4rem;
    }

    .request-shell__button {
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

    .request-shell__button--primary {
      border-color: rgba(56, 189, 248, 0.2);
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(20, 184, 166, 0.22));
      color: #f8fafc;
    }

    .request-state {
      margin-top: 1rem;
    }

    .request-card {
      display: grid;
      gap: 0.8rem;
      padding: 1rem 1.05rem;
      border-radius: 1.4rem;
      border: 1px solid rgba(148, 163, 184, 0.12);
      background: rgba(255, 255, 255, 0.03);
    }

    .request-card--success {
      border-color: rgba(56, 189, 248, 0.18);
    }

    .request-card--error {
      border-color: rgba(248, 113, 113, 0.18);
    }

    .request-card__top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.85rem;
    }

    .request-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem 0.8rem;
      color: rgba(226, 232, 240, 0.62);
      font-size: 0.86rem;
    }

    .request-chip {
      display: inline-flex;
      align-items: center;
      min-height: 1.95rem;
      padding: 0.3rem 0.65rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(226, 232, 240, 0.82);
      font-size: 0.74rem;
      font-weight: 700;
    }

    @media (max-width: 720px) {
      .request-shell__panel {
        padding: 1rem;
      }

      .request-shell__header {
        flex-direction: column;
      }

      .request-form__grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class WorkspaceRequestPageComponent implements OnInit {
  state: WorkspaceRequestState = 'checkingSession';
  statusMessage = '';
  currentUser: DirectusUser | null = null;
  existingApplication: WorkspaceApplicationRecord | null = null;
  validationErrors: WorkspaceRequestValidationErrors = {};
  validationWarning = '';
  submitAttempted = false;

  form: WorkspaceRequestForm = {
    company_name: '',
    contact_name: '',
    job_title: '',
    work_email: '',
    industry: '',
    team_size: '',
    country: '',
    use_case: '',
    phone: '',
    city: '',
    website: '',
    company_registration_number: '',
    expected_launch_date: '',
    message: ''
  };

  constructor(
    private auth: AuthService,
    private workspaceApplications: WorkspaceApplicationsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.state = 'checkingSession';

    try {
      const user = await this.auth.getCurrentUserAfterRestore();

      if (!user) {
        this.router.navigate(['/login']);
        return;
      }

      this.currentUser = user;

      let applications: WorkspaceApplicationRecord[] = [];
      try {
        applications = await this.workspaceApplications.getMyApplications(this.normalizeUserId(user.id), undefined);
      } catch (error) {
        console.warn('[WorkspaceRequest] Could not load applications', error);
        applications = [];
      }

      const latest = applications?.[0] ?? null;

      if (latest && latest.status === 'pending_review') {
        this.existingApplication = latest;
        this.state = 'pendingExisting';
        this.cdr.detectChanges();
        return;
      }

      if (latest && latest.status === 'needs_more_info') {
        this.existingApplication = latest;
        this.state = 'needsMoreInfo';
        this.cdr.detectChanges();
        return;
      }

      if (latest && latest.status === 'rejected') {
        this.existingApplication = latest;
        this.state = 'rejected';
        this.cdr.detectChanges();
        return;
      }

      this.state = 'form';
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[WorkspaceRequest] session check failed', error);
      this.router.navigate(['/login']);
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  async submit(): Promise<void> {
    if (this.state === 'submitting' || !this.currentUser) {
      return;
    }

    const currentUserId = this.normalizeUserId(this.currentUser.id);
    if (!currentUserId) {
      this.state = 'error';
      this.statusMessage = 'Your session is invalid. Please log in again.';
      this.cdr.detectChanges();
      return;
    }

    const latestApplications = await this.workspaceApplications.getMyApplications(currentUserId);
    const latestApplication = latestApplications[0] ?? this.existingApplication;
    const latestStatus = (latestApplication?.status ?? '').toString().trim().toLowerCase();

    if (latestStatus === 'pending_review') {
      this.existingApplication = latestApplication;
      this.state = 'pendingExisting';
      this.cdr.detectChanges();
      return;
    }

    if (latestStatus === 'needs_more_info' && this.state !== 'needsMoreInfo') {
      this.existingApplication = latestApplication;
      this.state = 'needsMoreInfo';
      this.cdr.detectChanges();
      return;
    }

    if (latestStatus === 'rejected') {
      this.existingApplication = latestApplication;
      this.state = 'rejected';
      this.cdr.detectChanges();
      return;
    }

    const cleaned = this.cleanAndValidateForm();
    this.validationErrors = cleaned.errors;
    this.validationWarning = cleaned.warning ?? '';
    this.submitAttempted = true;

    if (!cleaned.clean) {
      this.statusMessage = 'Please correct the highlighted fields.';
      this.state = this.state === 'needsMoreInfo' ? 'needsMoreInfo' : 'form';
      this.cdr.detectChanges();
      return;
    }

    this.state = 'submitting';
    this.cdr.detectChanges();
    this.statusMessage = '';
    this.validationWarning = '';

    try {
      const record = latestStatus === 'needs_more_info' && latestApplication?.id
        ? await firstValueFrom(this.workspaceApplications.updateApplication(latestApplication.id, cleaned.clean, currentUserId))
        : await firstValueFrom(this.workspaceApplications.createApplication(cleaned.clean, currentUserId));

      if (!record) {
        this.state = 'error';
        this.statusMessage = 'We could not submit your workspace request.';
        this.cdr.detectChanges();
        return;
      }

      this.existingApplication = record;
      this.state = 'success';
      this.statusMessage = '';
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[WorkspaceRequest] submit failed', error);
      this.state = 'error';
      this.statusMessage = 'We could not submit your workspace request.';
      this.cdr.detectChanges();
    }
  }

  fieldError(field: keyof WorkspaceRequestForm): string {
    return this.validationErrors[field] ?? '';
  }

  get hasValidationErrors(): boolean {
    return Object.values(this.validationErrors).some((value) => Boolean(value));
  }

  private normalizeUserId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  private emptyToNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private cleanAndValidateForm(): { clean: CleanWorkspaceRequest | null; errors: WorkspaceRequestValidationErrors; warning?: string } {
    const errors: WorkspaceRequestValidationErrors = {};
    const clean = this.cleanFormValues();

    if (!clean.company_name) {
      errors.company_name = 'Company name is required.';
    } else if (clean.company_name.length < 2 || clean.company_name.length > 120) {
      errors.company_name = 'Company name must be between 2 and 120 characters.';
    }

    if (!clean.contact_name) {
      errors.contact_name = 'Contact name is required.';
    } else if (clean.contact_name.length < 2 || clean.contact_name.length > 100) {
      errors.contact_name = 'Contact name must be between 2 and 100 characters.';
    } else if (!/^[A-Za-z][A-Za-z\s.'-]*$/.test(clean.contact_name)) {
      errors.contact_name = 'Contact name can contain only letters and spaces.';
    }

    if (!clean.job_title) {
      errors.job_title = 'Job title is required.';
    } else if (clean.job_title.length < 2 || clean.job_title.length > 100) {
      errors.job_title = 'Job title must be between 2 and 100 characters.';
    }

    if (!clean.work_email) {
      errors.work_email = 'Work email is required.';
    } else if (!this.isValidEmail(clean.work_email)) {
      errors.work_email = 'Enter a valid work email address.';
    }

    if (!clean.industry) {
      errors.industry = 'Industry is required.';
    } else if (clean.industry.length < 2 || clean.industry.length > 80) {
      errors.industry = 'Industry must be between 2 and 80 characters.';
    }

    if (!Number.isInteger(clean.team_size) || clean.team_size < 1 || clean.team_size > 100000) {
      errors.team_size = 'Team size must be a whole number.';
    }

    if (!clean.country) {
      errors.country = 'Country is required.';
    } else if (clean.country.length < 2 || clean.country.length > 80) {
      errors.country = 'Country must be between 2 and 80 characters.';
    }

    if (!clean.use_case) {
      errors.use_case = 'Use case is required.';
    } else if (clean.use_case.length < 20 || clean.use_case.length > 1000) {
      errors.use_case = 'Please describe your use case in at least 20 characters.';
    }

    if (clean.phone && !/^[+\d\s-]{1,30}$/.test(clean.phone)) {
      errors.phone = 'Enter a valid phone number.';
    }

    if (clean.city && clean.city.length > 80) {
      errors.city = 'City must be 80 characters or fewer.';
    }

    if (clean.website && !this.isValidUrl(clean.website)) {
      errors.website = 'Enter a valid website URL.';
    }

    if (clean.company_registration_number && clean.company_registration_number.length > 80) {
      errors.company_registration_number = 'Company registration number must be 80 characters or fewer.';
    }

    if (clean.expected_launch_date && this.isPastDate(clean.expected_launch_date)) {
      errors.expected_launch_date = 'Expected launch date cannot be in the past.';
    }

    if (clean.message && clean.message.length > 1500) {
      errors.message = 'Message must be 1500 characters or fewer.';
    }

    const warning = this.isPersonalEmail(clean.work_email)
      ? 'A company email is recommended for enterprise workspace review.'
      : '';

    return {
      clean: Object.keys(errors).length ? null : clean,
      errors,
      warning
    };
  }

  private cleanFormValues(): CleanWorkspaceRequest {
    const teamSize = Number(this.form.team_size.trim());
    const website = this.normalizeWebsite(this.form.website);

    return {
      company_name: this.form.company_name.trim(),
      contact_name: this.form.contact_name.trim(),
      job_title: this.form.job_title.trim(),
      work_email: this.form.work_email.trim().toLowerCase(),
      phone: this.emptyToNull(this.form.phone),
      industry: this.form.industry.trim(),
      team_size: teamSize,
      country: this.form.country.trim(),
      city: this.emptyToNull(this.form.city),
      website: website ? website : null,
      company_registration_number: this.emptyToNull(this.form.company_registration_number),
      use_case: this.form.use_case.trim(),
      expected_launch_date: this.emptyToNull(this.form.expected_launch_date),
      message: this.emptyToNull(this.form.message)
    };
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isPersonalEmail(value: string): boolean {
    const domain = value.split('@')[1]?.toLowerCase() ?? '';
    return ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com'].includes(domain);
  }

  private normalizeWebsite(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
      const normalized = new URL(hasScheme ? trimmed : `https://${trimmed}`);
      return normalized.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  private isValidUrl(value: string): boolean {
    try {
      return Boolean(new URL(value));
    } catch {
      return false;
    }
  }

  private isPastDate(value: string): boolean {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  }
}
