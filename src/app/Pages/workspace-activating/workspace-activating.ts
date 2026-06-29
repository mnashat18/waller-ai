import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import {
  type PendingWorkspaceActivation,
  WorkspaceActivationService
} from '../../services/workspace-activation.service';

@Component({
  selector: 'app-workspace-activating-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workspace-activating.html',
  styleUrl: './workspace-activating.css'
})
export class WorkspaceActivatingPageComponent implements OnInit {
  readonly title = 'Your workspace is ready';
  readonly subtitle = 'Activating your Owner access...';

  private readonly refreshAttempts = 3;
  private readonly verifyTimeoutMs = 12000;

  constructor(
    private auth: AuthService,
    private companyContext: CompanyContextService,
    private postLoginRouting: PostLoginRoutingService,
    private workspaceActivation: WorkspaceActivationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    void this.runActivation();
  }

  private async runActivation(): Promise<void> {
    const activation = this.workspaceActivation.readActivation();
    if (!activation) {
      await this.redirectWithoutPendingActivation();
      return;
    }

    for (let attempt = 0; attempt < this.refreshAttempts; attempt += 1) {
      const verified = await this.tryActivateOwnerSession(activation);
      if (verified) {
        this.workspaceActivation.clearActivation();
        await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
        return;
      }

      if (attempt < this.refreshAttempts - 1) {
        await this.sleep(350);
      }
    }

    this.workspaceActivation.clearActivation();
    this.auth.clearAuthState();
    this.auth.setAuthNotice('Your workspace was created successfully. Please sign in once to activate your Owner access.');
    await this.router.navigateByUrl('/?auth=login', { replaceUrl: true });
  }

  private async tryActivateOwnerSession(activation: PendingWorkspaceActivation): Promise<boolean> {
    try {
      const refreshedToken = await this.auth.refreshAuthTokenWithStoredRefreshToken();
      if (!refreshedToken) {
        return false;
      }

      const refreshedUser = await firstValueFrom(
        this.auth.getCurrentUserWithFields([
          'id',
          'email',
          'first_name',
          'last_name',
          'role.id',
          'role.name',
          'active_business_profile',
          'active_department',
          'active_member_role'
        ], refreshedToken).pipe(timeout(this.verifyTimeoutMs))
      );

      if (!this.isOwnerRole(refreshedUser?.role)) {
        return false;
      }

      await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true, failOnError: true });

      const context = this.companyContext.snapshot().context;
      const sessionReady =
        context.isAuthenticated &&
        context.authInitialized &&
        context.workspaceInitialized &&
        Boolean(this.auth.getStoredAccessToken());
      const workspaceMatches = context.activeBusinessProfileId === activation.businessProfileId;
      const memberRoleMatches = String(context.activeMemberRole ?? '').toLowerCase() === 'owner';

      return sessionReady && workspaceMatches && memberRoleMatches;
    } catch {
      return false;
    }
  }

  private async redirectWithoutPendingActivation(): Promise<void> {
    try {
      const nextRoute = await this.postLoginRouting.resolveDestinationStrict();
      await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
    } catch {
      await this.router.navigateByUrl('/app/workspace-access', { replaceUrl: true });
    }
  }

  private isOwnerRole(role: unknown): boolean {
    if (typeof role === 'string') {
      return role.trim().toLowerCase() === 'owner';
    }

    if (!role || typeof role !== 'object') {
      return false;
    }

    const record = role as Record<string, unknown>;
    const roleName = typeof record['name'] === 'string' ? record['name'].trim().toLowerCase() : '';
    return roleName === 'owner';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
