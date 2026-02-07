import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AuthService } from '../../services/auth';
import { AdminTokenService } from '../../services/admin-token';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  loading = true;
  errorMessage = '';
  profile: ProfileView | null = null;
  editing = false;
  saving = false;
  saveFeedback: { type: 'success' | 'error' | 'info'; message: string } | null = null;
  userId: string | null = null;
  form: ProfileForm = {
    firstName: '',
    lastName: '',
    password: ''
  };
  avatarFile: File | null = null;
  avatarPreviewUrl: string | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private adminTokens: AdminTokenService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadProfile();
  }

  logout() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      this.finishLogout();
      return;
    }

    this.http.post(`${environment.API_URL}/auth/logout`, {
      refresh_token: refreshToken
    }).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout()
    });
  }

  startEdit() {
    if (!this.profile) {
      return;
    }

    this.form = {
      firstName: this.profile.firstName,
      lastName: this.profile.lastName,
      password: ''
    };
    this.avatarFile = null;
    this.clearAvatarPreview();
    this.saveFeedback = null;
    this.editing = true;
    this.cdr.detectChanges();
  }

  cancelEdit() {
    this.editing = false;
    this.avatarFile = null;
    this.clearAvatarPreview();
    this.saveFeedback = null;
    this.cdr.detectChanges();
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.avatarFile = file;
    this.updateAvatarPreview(file);
    this.cdr.detectChanges();
  }

  saveProfile() {
    if (!this.profile) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token || this.isTokenExpired(token)) {
      this.saveFeedback = { type: 'error', message: 'Session expired. Please login again.' };
      this.cdr.detectChanges();
      return;
    }

    this.saving = true;
    this.saveFeedback = { type: 'info', message: 'Saving changes...' };
    this.cdr.detectChanges();

    const nextFirstName = this.form.firstName.trim() || this.profile.firstName;
    const nextLastName = this.form.lastName.trim() || this.profile.lastName;

    this.uploadAvatar(token).pipe(
      switchMap((uploadResult) => {
        const avatarId = uploadResult.id;
        const payload: ProfileUpdatePayload = {
          first_name: nextFirstName,
          last_name: nextLastName
        };

        if (this.form.password.trim()) {
          payload.password = this.form.password.trim();
        }

        if (avatarId) {
          payload.avatar = avatarId;
        }
        return this.updateProfile(token, payload, avatarId);
      })
    ).subscribe({
      next: ({ res, avatarId }) => {
        const user = res?.data;
        if (user) {
          this.profile = this.mapProfile(user, token);
          if (avatarId) {
            this.profile.avatarUrl = this.buildAvatarUrl(avatarId, token);
          }
        }
        this.saving = false;
        this.editing = false;
        this.saveFeedback = { type: 'success', message: 'Profile updated.' };
        this.clearAvatarPreview();
        this.loadProfile();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[profile] save error:', err);
        const apiMessage =
          err?.error?.errors?.[0]?.message ||
          err?.error?.errors?.[0]?.extensions?.reason ||
          err?.message;
        this.saving = false;
        this.saveFeedback = {
          type: 'error',
          message: apiMessage ? `Failed to update profile: ${apiMessage}` : 'Failed to update profile.'
        };
        this.cdr.detectChanges();
      }
    });
  }

  private loadProfile() {
    const token = localStorage.getItem('token');
    if (!token || this.isTokenExpired(token)) {
      this.loading = false;
      this.errorMessage = 'You are not signed in.';
      this.cdr.detectChanges();
      return;
    }

    const payload = this.decodeJwtPayload(token);
    this.userId = this.extractUserId(payload);
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    const fields = this.getProfileFields();

    this.http.get<{ data?: ProfileUser }>(
      `${environment.API_URL}/users/me?fields=${fields}`,
      { headers }
    ).pipe(
      map((res) => res?.data ?? null),
      switchMap((user) => {
        const userId = this.userId;
        if (!userId || !this.shouldHydrateFromAdmin(user)) {
          return of(user);
        }

        return this.adminTokens.getToken().pipe(
          switchMap((adminToken) => {
            if (!adminToken) {
              return of(user);
            }
            return this.fetchUserById(userId, adminToken).pipe(
              map((adminUser) => adminUser ?? user),
              catchError(() => of(user))
            );
          })
        );
      }),
      switchMap((user) => {
        if (!user) {
          return of({ user: null, roleLabel: '' });
        }
        return this.resolveRoleLabel(user.role, token).pipe(
          map((roleLabel) => ({ user, roleLabel }))
        );
      })
    ).subscribe({
      next: ({ user, roleLabel }) => {
        if (!user) {
          this.errorMessage = 'Profile data unavailable.';
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        this.profile = this.mapProfile(user, token, roleLabel);
        this.editing = false;
        this.saveFeedback = null;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[profile] load error:', err);
        this.errorMessage = 'Failed to load profile.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private updateProfile(token: string, payload: ProfileUpdatePayload, avatarId: string | null) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.patch<{ data?: ProfileUser }>(
      `${environment.API_URL}/users/me`,
      payload,
      { headers }
    ).pipe(
      map((res) => ({ res, avatarId })),
      catchError((err) => {
        return this.adminTokens.getToken().pipe(
          switchMap((adminToken) => {
            if (!adminToken || !this.profile?.id) {
              return throwError(() => err);
            }

            const adminHeaders = new HttpHeaders({
              Authorization: `Bearer ${adminToken}`
            });

            return this.http.patch<{ data?: ProfileUser }>(
              `${environment.API_URL}/users/${this.profile.id}`,
              payload,
              { headers: adminHeaders }
            ).pipe(
              map((res) => ({ res, avatarId }))
            );
          })
        );
      })
    );
  }

  private getProfileFields(): string {
    return [
      'id',
      'email',
      'first_name',
      'last_name',
      'title',
      'role',
      'avatar',
      'status'
    ].join(',');
  }

  private shouldHydrateFromAdmin(user: ProfileUser | null): boolean {
    if (!user) {
      return true;
    }
    if (!user.email) {
      return true;
    }
    if (!user.first_name && !user.last_name) {
      return true;
    }
    if (!user.avatar) {
      return true;
    }
    return false;
  }

  private fetchUserById(userId: string, token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    const fields = this.getProfileFields();

    return this.http.get<{ data?: ProfileUser }>(
      `${environment.API_URL}/users/${userId}?fields=${fields}`,
      { headers }
    ).pipe(
      map((res) => res?.data ?? null)
    );
  }

  private mapProfile(user: ProfileUser, token: string, roleLabelOverride?: string): ProfileView {
    const payload = this.decodeJwtPayload(token);
    const fullName = this.buildName(user.first_name, user.last_name);
    const email = user.email ?? '';
    const displayName = fullName || email || 'Wellar User';
    const initials = this.buildInitials(displayName);
    const avatarUrl = user.avatar ? this.buildAvatarUrl(user.avatar, token) : '';
    const status = this.formatStatus(user.status);
    const roleLabel = this.normalizeRoleLabel(
      roleLabelOverride ?? this.extractRoleName(user.role),
      token
    );
    const memberSince = this.formatDate(
      user.date_created ?? this.getTokenIssuedAtDate(payload) ?? new Date()
    );
    const lastAccess = this.formatDateTime(
      user.last_access ?? this.getTokenIssuedAtDate(payload) ?? new Date()
    );

    const view: ProfileView = {
      id: user.id ?? '',
      name: displayName,
      initials,
      email,
      title: user.title ?? 'Member',
      roleLabel,
      status,
      memberSince,
      lastAccess,
      avatarUrl,
      firstName: (user.first_name ?? '').trim(),
      lastName: (user.last_name ?? '').trim()
    };
    return view;
  }

  private buildName(first?: string, last?: string): string {
    const safeFirst = (first ?? '').trim();
    const safeLast = (last ?? '').trim();
    return [safeFirst, safeLast].filter(Boolean).join(' ');
  }

  private buildAvatarUrl(avatarId: string, token: string): string {
    const base = `${environment.API_URL}/assets/${avatarId}`;
    if (!token || this.isTokenExpired(token)) {
      return base;
    }
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}access_token=${encodeURIComponent(token)}`;
  }


  private buildInitials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return 'W';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private formatStatus(value?: string): string {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'active') {
      return 'Active';
    }
    if (normalized === 'suspended') {
      return 'Suspended';
    }
    if (normalized === 'invited') {
      return 'Invited';
    }
    return value ? value : 'Active';
  }

  private formatRole(role: string | null | undefined, token: string): string {
    if (this.isAdminFromToken(token)) {
      return 'Administrator';
    }
    if (!role) {
      return 'User';
    }
    return role;
  }

  private resolveRoleLabel(role: ProfileUser['role'], token: string) {
    const name = this.extractRoleName(role);
    if (name) {
      return of(this.normalizeRoleLabel(name, token));
    }

    if (typeof role !== 'string' || !role) {
      return of(this.normalizeRoleLabel('', token));
    }

    return this.adminTokens.getToken().pipe(
      switchMap((adminToken) => {
        const bearer = adminToken ?? token;
        if (!bearer) {
          return of('');
        }
        return this.fetchRoleName(role, bearer);
      }),
      map((roleName) => this.normalizeRoleLabel(roleName, token)),
      catchError(() => of(this.normalizeRoleLabel('', token)))
    );
  }

  private fetchRoleName(roleId: string, token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.get<{ data?: { name?: string } }>(
      `${environment.API_URL}/roles/${roleId}?fields=name`,
      { headers }
    ).pipe(
      map((res) => res?.data?.name ?? '')
    );
  }

  private extractRoleName(role: ProfileUser['role']): string {
    if (!role) {
      return '';
    }
    if (typeof role === 'object') {
      const roleObj = role as { name?: string };
      return roleObj.name ?? '';
    }
    return '';
  }

  private normalizeRoleLabel(roleName: string, token: string): string {
    const name = roleName.trim();
    if (!name) {
      return this.isAdminFromToken(token) ? 'ADMIN' : 'USER';
    }
    const lower = name.toLowerCase();
    if (lower.includes('admin')) {
      return 'ADMIN';
    }
    if (lower.includes('manager')) {
      return 'MANAGER';
    }
    if (lower.includes('user')) {
      return 'USER';
    }
    return name.toUpperCase();
  }

  private formatDate(value?: string | number | Date | null): string {
    if (!value) {
      return new Date().toLocaleDateString('en-CA');
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleDateString('en-CA');
    }
    return date.toLocaleDateString('en-CA');
  }

  private formatDateTime(value?: string | number | Date | null): string {
    if (!value) {
      return this.formatDateTime(new Date());
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.formatDateTime(new Date());
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private isAdminFromToken(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    return payload?.['admin_access'] === true;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private extractUserId(payload: Record<string, unknown> | null): string | null {
    if (!payload) {
      return null;
    }
    const id = payload['id'];
    return typeof id === 'string' && id ? id : null;
  }

  private getTokenIssuedAtDate(payload: Record<string, unknown> | null): Date | null {
    if (!payload) {
      return null;
    }
    const iat = payload['iat'];
    if (typeof iat !== 'number') {
      return null;
    }
    return new Date(iat * 1000);
  }


  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') {
        return false;
      }
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private uploadAvatar(token: string) {
    if (!this.avatarFile) {
      return of({ id: null, usedAdmin: false } satisfies UploadResult);
    }

    return this.uploadAvatarWithToken(token).pipe(
      map((id) => ({ id, usedAdmin: false } satisfies UploadResult)),
      catchError((err) => {
        return this.adminTokens.getToken().pipe(
          switchMap((adminToken) => {
            if (!adminToken) {
              return throwError(() => err);
            }
            return this.uploadAvatarWithToken(adminToken).pipe(
              switchMap((id) => {
                if (!id || !this.userId) {
                  return of({ id, usedAdmin: true } satisfies UploadResult);
                }
                return this.assignFileOwner(id, this.userId, adminToken).pipe(
                  map(() => ({ id, usedAdmin: true } satisfies UploadResult)),
                  catchError(() => of({ id, usedAdmin: true } satisfies UploadResult))
                );
              })
            );
          }),
          catchError((adminErr) => {
            console.warn('[profile] avatar upload skipped:', adminErr);
            return of({ id: null, usedAdmin: false } satisfies UploadResult);
          })
        );
      })
    );
  }

  private uploadAvatarWithToken(token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    const formData = new FormData();
    formData.append('file', this.avatarFile as Blob);

    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/files`,
      formData,
      { headers }
    ).pipe(
      map((res) => res?.data?.id ?? null)
    );
  }

  private assignFileOwner(fileId: string, userId: string, token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.patch(
      `${environment.API_URL}/files/${fileId}`,
      { uploaded_by: userId },
      { headers }
    );
  }

  private updateAvatarPreview(file: File | null) {
    this.clearAvatarPreview();
    if (!file) {
      return;
    }
    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  private clearAvatarPreview() {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
    this.avatarPreviewUrl = null;
  }

  private finishLogout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}

type ProfileUser = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  role?: string | { id?: string; name?: string };
  avatar?: string;
  status?: string;
  last_access?: string;
  date_created?: string;
};

type ProfileView = {
  id: string;
  name: string;
  initials: string;
  email: string;
  title: string;
  roleLabel: string;
  status: string;
  memberSince: string;
  lastAccess: string;
  avatarUrl: string;
  firstName: string;
  lastName: string;
};

type ProfileForm = {
  firstName: string;
  lastName: string;
  password: string;
};

type ProfileUpdatePayload = {
  first_name: string;
  last_name: string;
  password?: string;
  avatar?: string;
};

type UploadResult = {
  id: string | null;
  usedAdmin: boolean;
};
