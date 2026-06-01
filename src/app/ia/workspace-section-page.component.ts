import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-workspace-section-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-shell fade-in">
      <div class="page-hero">
        <div class="hero-left">
          <span class="hero-chip">Operational Section</span>
          <h1 class="page-title">{{ title }}</h1>
          <p class="page-subtitle">{{ description }}</p>
        </div>
        <div class="hero-actions">
          <span class="chip">{{ scopeLabel }}</span>
          <a routerLink="/dashboard" class="chip">Back to Dashboard</a>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <p class="text-sm text-slate-400">Company Scope</p>
          <p class="kpi-value text-slate-100">{{ activeBusinessProfile || 'Not selected' }}</p>
        </div>
        <div class="kpi-card">
          <p class="text-sm text-slate-400">Member Role</p>
          <p class="kpi-value text-sky-300">{{ activeMemberRole || 'Unknown' }}</p>
        </div>
        <div class="kpi-card">
          <p class="text-sm text-slate-400">Department Scope</p>
          <p class="kpi-value text-amber-300">{{ activeDepartment || 'Company-wide' }}</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">Information Architecture</h3>
          <span class="chip">{{ routePath }}</span>
        </div>
        <p class="text-sm text-slate-300 leading-7">
          This section is part of the new Wellar AI information architecture. It reserves the route, shell position,
          and access model for company-scoped operational workflows tied to the active company and department context.
        </p>
      </div>
    </div>
  `
})
export class WorkspaceSectionPageComponent {
  private readonly route = inject(ActivatedRoute);

  get title(): string {
    return (this.route.snapshot.data['title'] as string) || 'Workspace';
  }

  get description(): string {
    return (this.route.snapshot.data['description'] as string) || 'Operational section.';
  }

  get routePath(): string {
    return (this.route.snapshot.routeConfig?.path ?? '').toString();
  }

  get activeBusinessProfile(): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('active_business_profile');
  }

  get activeDepartment(): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('active_department');
  }

  get activeMemberRole(): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('active_member_role');
  }

  get scopeLabel(): string {
    if (this.activeDepartment) {
      return 'Department scoped';
    }
    return 'Company scoped';
  }
}
