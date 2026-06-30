import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type PostAuthWelcomeKind = 'returning' | 'workspace' | 'invite';

export type PostAuthWelcomeIntent = {
  kind: PostAuthWelcomeKind;
  firstName: string | null;
  organizationName: string | null;
};

@Injectable({ providedIn: 'root' })
export class PostAuthWelcomeService {
  private readonly intentSubject = new BehaviorSubject<PostAuthWelcomeIntent | null>(null);

  readonly intent$ = this.intentSubject.asObservable();

  queueReturningWelcome(firstName: string | null | undefined): void {
    this.queueIntent({
      kind: 'returning',
      firstName: this.normalizeName(firstName),
      organizationName: null
    });
  }

  queueWorkspaceWelcome(firstName: string | null | undefined): void {
    this.queueIntent({
      kind: 'workspace',
      firstName: this.normalizeName(firstName),
      organizationName: null
    });
  }

  queueInviteWelcome(organizationName: string | null | undefined): void {
    this.queueIntent({
      kind: 'invite',
      firstName: null,
      organizationName: this.normalizeName(organizationName)
    });
  }

  consumeWelcome(): PostAuthWelcomeIntent | null {
    const intent = this.intentSubject.value;
    this.intentSubject.next(null);
    return intent;
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
}
