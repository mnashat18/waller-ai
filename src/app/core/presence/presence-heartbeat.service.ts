import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth';

@Injectable({ providedIn: 'root' })
export class PresenceHeartbeatService {
  private readonly pingIntervalMs = 60000;
  private started = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private disabled = false;
  private lastPingAt = 0;

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
    ).subscribe({
      next: () => {
        this.inFlight = false;
      },
      error: (error) => {
        this.inFlight = false;

        const status = (error as { status?: number } | null)?.status ?? 0;
        const reasonText = (
          (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string } } | null)?.error?.errors?.[0]?.extensions?.reason ??
          (error as { error?: { errors?: Array<{ message?: string }>; message?: string } } | null)?.error?.errors?.[0]?.message ??
          (error as { error?: { message?: string } } | null)?.error?.message ??
          ''
        ).toString().toLowerCase();

        if (
          status === 400 ||
          status === 403 ||
          reasonText.includes('field') ||
          reasonText.includes('not allowed') ||
          reasonText.includes('does not exist')
        ) {
          this.disabled = true;
        }
      }
    });
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
