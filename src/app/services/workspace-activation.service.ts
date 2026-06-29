import { Injectable } from '@angular/core';

export type PendingWorkspaceActivation = {
  businessProfileId: string;
  companyName: string | null;
  startedAt: number;
};

@Injectable({ providedIn: 'root' })
export class WorkspaceActivationService {
  private readonly storageKey = 'wellar_workspace_activation_v1';
  private readonly maxAgeMs = 10 * 60 * 1000;

  startActivation(input: { businessProfileId: string; companyName?: string | null }): void {
    const businessProfileId = this.normalizeText(input.businessProfileId);
    if (!businessProfileId || typeof sessionStorage === 'undefined') {
      return;
    }

    const payload: PendingWorkspaceActivation = {
      businessProfileId,
      companyName: this.normalizeText(input.companyName ?? null),
      startedAt: Date.now()
    };

    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  readActivation(): PendingWorkspaceActivation | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const businessProfileId = this.normalizeText(parsed['businessProfileId']);
      const startedAt = typeof parsed['startedAt'] === 'number' ? parsed['startedAt'] : 0;
      if (!businessProfileId || startedAt <= 0) {
        this.clearActivation();
        return null;
      }

      if (Date.now() - startedAt > this.maxAgeMs) {
        this.clearActivation();
        return null;
      }

      return {
        businessProfileId,
        companyName: this.normalizeText(parsed['companyName']),
        startedAt
      };
    } catch {
      this.clearActivation();
      return null;
    }
  }

  clearActivation(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      // ignore storage errors
    }
  }

  private normalizeText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return null;
  }
}
