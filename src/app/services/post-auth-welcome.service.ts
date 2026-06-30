import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type PostAuthWelcomeKind = 'returning' | 'workspace' | 'invite';

export type PostAuthWelcomeIntent = {
  kind: PostAuthWelcomeKind;
  firstName: string | null;
  organizationName: string | null;
  destinationRoute: string;
};

@Injectable({ providedIn: 'root' })
export class PostAuthWelcomeService {
  private readonly intentSubject = new BehaviorSubject<PostAuthWelcomeIntent | null>(null);

  readonly intent$ = this.intentSubject.asObservable();

  queueReturningWelcome(firstName: string | null | undefined, destinationRoute: string): void {
    this.queueIntent({
      kind: 'returning',
      firstName: this.normalizeName(firstName),
      organizationName: null,
      destinationRoute: this.normalizeRoute(destinationRoute)
    });
  }

  queueWorkspaceWelcome(firstName: string | null | undefined, destinationRoute: string): void {
    this.queueIntent({
      kind: 'workspace',
      firstName: this.normalizeName(firstName),
      organizationName: null,
      destinationRoute: this.normalizeRoute(destinationRoute)
    });
  }

  queueInviteWelcome(organizationName: string | null | undefined, destinationRoute: string): void {
    this.queueIntent({
      kind: 'invite',
      firstName: null,
      organizationName: this.normalizeName(organizationName),
      destinationRoute: this.normalizeRoute(destinationRoute)
    });
  }

  consumeWelcome(): PostAuthWelcomeIntent | null {
    const intent = this.intentSubject.value;
    this.intentSubject.next(null);
    return intent;
  }

  hasPendingIntent(): boolean {
    return Boolean(this.intentSubject.value);
  }

  clear(): void {
    this.intentSubject.next(null);
  }

  private queueIntent(intent: PostAuthWelcomeIntent): void {
    this.intentSubject.next(intent);
  }

  private normalizeName(value: string | null | undefined): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private normalizeRoute(value: string | null | undefined): string {
    const normalized = String(value ?? '').trim();
    if (!normalized || !normalized.startsWith('/')) {
      return '/app/dashboard';
    }

    if (normalized.startsWith('//')) {
      return '/app/dashboard';
    }

    return normalized;
  }
}
