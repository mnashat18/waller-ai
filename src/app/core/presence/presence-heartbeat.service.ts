import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth';

@Injectable({ providedIn: 'root' })
export class PresenceHeartbeatService {
  private readonly pingIntervalMs = 60000;
  private readonly requestTimeoutMs = 15000;
  private readonly maxBackoffMs = 5 * 60000;
  private started = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private disabled = false;
  private lastPingAt = 0;
  private backoffUntil = 0;
  private transientFailureStreak = 0;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  start(): void {
    if (this.started || typeof window === 'undefined') {
      return;
    }

    this.started = true;

    window.addEventListener('focus', this.onWindowFocus, { passive: true });
    window.addEventListener('visibilitychange', this.onVisibilityChange, { passive: true });

    this.intervalId = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      this.ping('interval');
    }, this.pingIntervalMs);

    this.ping('bootstrap');
  }

  stop(): void {
    if (!this.started || typeof window === 'undefined') {
      return;
    }

    this.started = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    window.removeEventListener('focus', this.onWindowFocus);
    window.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  ping(reason: 'bootstrap' | 'interval' | 'focus' | 'route'): void {
    if (this.disabled || this.inFlight) {
      return;
    }

    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return;
    }

    const now = Date.now();
    if (reason !== 'bootstrap' && now - this.lastPingAt < 20000) {
      return;
    }
    // Quiet back-off after transient network/server failures so we don't retry
    // (or log) every interval while the backend is briefly unreachable.
    if (now < this.backoffUntil) {
      return;
    }

    this.inFlight = true;
    this.lastPingAt = now;

    const timestamp = new Date(now).toISOString();
    const payload: Record<string, unknown> = {
      last_seen_at: timestamp,
      last_active_at: timestamp,
      online_status: 'online'
    };

    this.http.patch(
      `${environment.API_URL}/users/me`,
      payload,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      timeout(this.requestTimeoutMs),
      catchError((error) => {
        // Convert any failure into a handled, completed stream so a heartbeat
        // error can never surface as an unhandled rejection.
        this.handlePingError(error);
        return EMPTY;
      })
    ).subscribe({
      next: () => {
        this.inFlight = false;
        // A success clears any pending back-off so we resume the normal cadence.
        this.backoffUntil = 0;
        this.transientFailureStreak = 0;
      },
      complete: () => {
        // Reached on the catchError -> EMPTY path; inFlight is reset here so a
        // failed (or timed-out) request can never wedge the heartbeat permanently.
        this.inFlight = false;
      }
    });
  }

  /**
   * Classifies a heartbeat failure and reacts safely:
   * - Permanent schema/permission issues disable presence for this session.
   * - Transient network/server failures and expired sessions fail quietly and
   *   back off until the next scheduled attempt.
   */
  private handlePingError(error: unknown): void {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const reasonText = this.extractErrorReason(error);

    const isPermanent =
      status === 400 ||
      status === 403 ||
      status === 404 ||
      reasonText.includes('field') ||
      reasonText.includes('not allowed') ||
      reasonText.includes('permission') ||
      reasonText.includes('does not exist') ||
      reasonText.includes("doesn't exist");

    if (isPermanent) {
      this.disableForSession(status, reasonText);
      return;
    }

    // Everything else (status 0 network errors, timeouts, 401 expired/refreshing
    // sessions, 408/429/5xx) is treated as temporary: stay enabled, back off,
    // and only log the first failure of a streak to avoid console spam.
    this.transientFailureStreak += 1;
    const backoff = Math.min(
      this.pingIntervalMs * this.transientFailureStreak,
      this.maxBackoffMs
    );
    this.backoffUntil = Date.now() + backoff;

    if (this.transientFailureStreak === 1) {
      this.debug('presence heartbeat temporarily unavailable; backing off', {
        status,
        backoffMs: backoff
      });
    }
  }

  private disableForSession(status: number, reasonText: string): void {
    if (this.disabled) {
      return;
    }
    this.disabled = true;

    // Stop the timer entirely so we stop scheduling pings the backend will reject
    // for the rest of this session. Listeners are left in place but no-op because
    // ping() short-circuits on `disabled`.
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.debug('presence heartbeat disabled for this session', {
      status,
      // Non-sensitive: HTTP status plus the backend's schema/permission reason.
      // No token, headers or payload are logged.
      reason: reasonText || 'presence fields rejected or not permitted'
    });
  }

  private extractErrorReason(error: unknown): string {
    const err = error as {
      name?: string;
      error?: {
        errors?: Array<{ message?: string; extensions?: { reason?: string } }>;
        message?: string;
      };
    } | null;

    return (
      err?.error?.errors?.[0]?.extensions?.reason ??
      err?.error?.errors?.[0]?.message ??
      err?.error?.message ??
      err?.name ??
      ''
    )
      .toString()
      .toLowerCase();
  }

  private debug(message: string, details?: Record<string, unknown>): void {
    if (environment.production) {
      return;
    }
    if (details === undefined) {
      console.debug(`[PresenceHeartbeat] ${message}`);
      return;
    }
    console.debug(`[PresenceHeartbeat] ${message}`, details);
  }

  private readonly onWindowFocus = (): void => {
    this.ping('focus');
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.ping('focus');
    }
  };
}
