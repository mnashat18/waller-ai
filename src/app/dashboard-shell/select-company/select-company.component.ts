import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { CompanyContextService } from '../../core/context/company-context.service';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state/loading-state.component';

@Component({
  selector: 'app-select-company-page',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="relative mx-auto w-full max-w-5xl px-6 py-10">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div class="absolute -top-24 right-[-6rem] h-72 w-72 rounded-full bg-gradient-to-br from-indigo-400/30 via-sky-400/20 to-emerald-400/20 blur-3xl"></div>
        <div class="absolute -bottom-24 left-[-6rem] h-72 w-72 rounded-full bg-gradient-to-br from-fuchsia-400/25 via-indigo-400/15 to-sky-400/20 blur-3xl"></div>
      </div>

      <div class="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur">
        <div class="relative border-b border-slate-200/70 bg-gradient-to-b from-slate-50 to-white px-8 py-7">
          <div class="flex items-start justify-between gap-6">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Organization Access</p>
              <h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Choose an organization to continue</h1>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                You are signed in successfully. Select the active organization so we can scope dashboard data.
              </p>
            </div>

            <div class="hidden shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
              <div class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M4 10.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9.5M4 10.5 12 3l8 7.5M4 10.5h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900">Active organization</p>
                <p class="truncate text-xs text-slate-500">Required for dashboard access</p>
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-8 px-8 py-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div *ngIf="state$ | async as state">
            <app-loading-state *ngIf="state.loading" title="Loading available organizations..." />

            <app-error-state
              *ngIf="!state.loading && state.error"
              [title]="'We could not load your organization access'"
              [message]="state.error"
              [showRetry]="true"
              (retry)="retry()"
            />

            <ng-container *ngIf="!state.loading && !state.error">
              <div *ngIf="state.context.availableCompanies.length" class="grid gap-4">
                <div class="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    class="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    *ngFor="let company of state.context.availableCompanies"
                    (click)="switchCompany(company.id)"
                    [disabled]="switchingCompanyId === company.id"
                  >
                    <div aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                      <div class="absolute -right-24 -top-24 h-52 w-52 rounded-full bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-emerald-500/10 blur-2xl"></div>
                    </div>

                    <div class="relative flex items-start gap-4">
                      <div class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm">
                        <span class="text-sm font-semibold">
                          {{ (company.name || 'C').slice(0, 1).toUpperCase() }}
                        </span>
                      </div>

                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold text-slate-900">{{ company.name }}</p>
                        <div class="mt-2 flex flex-wrap items-center gap-2">
                          <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Access Level: {{ formatAccessLevel(company.role) }}
                          </span>
                          <span *ngIf="company.membershipStatus" class="text-xs text-slate-500">
                            {{ company.membershipStatus }}
                          </span>
                        </div>
                      </div>

                      <div class="shrink-0">
                        <span
                          class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                          [ngClass]="switchingCompanyId === company.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white'"
                        >
                          {{ switchingCompanyId === company.id ? 'Switching...' : 'Open' }}
                        </span>
                      </div>
                    </div>
                  </button>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    (click)="retry()"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Refresh
                  </button>
                  <a
                    class="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    routerLink="/app/workspace/request"
                  >
                    Request organization access
                  </a>
                  <a
                    class="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    routerLink="/invites/claim"
                  >
                    Join with invitation
                  </a>
                </div>
              </div>

              <div *ngIf="!state.context.availableCompanies.length" class="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-7 shadow-sm">
                <div class="flex items-start gap-4">
                  <div class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <h2 class="text-lg font-semibold text-slate-900">No organization access found</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                      This account does not have access to any organizations yet.
                      Ask an owner or HR contact to send an invitation, or request organization access.
                    </p>
                    <div class="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        (click)="retry()"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                          <path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Refresh
                      </button>
                      <a
                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        routerLink="/app/workspace/request"
                      >
                        Request organization access
                      </a>
                      <a
                        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        routerLink="/invites/claim"
                      >
                        Join with invitation
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </ng-container>
          </div>

          <aside class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How it works</p>
            <h2 class="mt-2 text-lg font-semibold text-slate-900">Why am I seeing this?</h2>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              The operational dashboard is scoped to your active organization. Without an organization selected, dashboard routes cannot load data safely.
            </p>

            <div class="mt-6 grid gap-3">
              <div class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div class="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-slate-900 text-xs font-semibold text-white">1</div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">Pick an organization</p>
                  <p class="mt-1 text-xs text-slate-600">Select any organization you have access to.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div class="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-slate-900 text-xs font-semibold text-white">2</div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">We scope the organization</p>
                  <p class="mt-1 text-xs text-slate-600">The app sets your active organization context.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div class="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-slate-900 text-xs font-semibold text-white">3</div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">Open the dashboard</p>
                  <p class="mt-1 text-xs text-slate-600">You will be redirected to <span class="font-mono">/app/dashboard</span>.</p>
                </div>
              </div>
            </div>

            <div class="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-sm font-semibold text-slate-900">Tip</p>
              <p class="mt-1 text-xs leading-5 text-slate-600">
                If you expected an organization here, your account might not be linked yet.
                Ask an owner, HR, or manager to add you or send an invitation.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  `
})
export class SelectCompanyPageComponent {
  readonly state$;
  switchingCompanyId: string | null = null;

  constructor(private companyContext: CompanyContextService) {
    this.state$ = this.companyContext.state$;
  }

  retry(): void {
    this.companyContext.ensureLoaded(true).subscribe();
  }

  formatAccessLevel(role: string | null | undefined): string {
    const normalized = (role ?? '').toString().trim().toLowerCase();
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee') return 'Employee';
    return 'Unknown';
  }

  switchCompany(companyId: string): void {
    this.switchingCompanyId = companyId;
    this.companyContext.switchCompany(companyId).subscribe({
      next: () => {
        if (typeof window !== 'undefined') {
          window.location.assign('/app/dashboard');
        }
      },
      error: () => {
        this.switchingCompanyId = null;
      }
    });
  }
}
