import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type ClaimInviteResponse = {
  ok: boolean;
  businessProfileId: string | null;
  membershipId: string | null;
  memberRole: string | null;
  departmentId: string | null;
  raw: unknown;
};

const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';
const INVITE_CLAIM_ERROR_KEY = 'invite_claim_error';
const INVITE_CLAIM_COMPLETED_KEY = 'invite_claim_completed';
const INVITE_CLAIM_SUCCESS_PREFIX = 'invite_claim_success_';
const INVITE_CLAIM_IN_PROGRESS_PREFIX = 'invite_claim_in_progress_';

@Injectable({ providedIn: 'root' })
export class InviteService {
  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  claimInvite(token: string): Observable<ClaimInviteResponse> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('Invite token is missing.');
    }

    const accessToken = this.auth.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Please sign in first.');
    }

    const endpoint = this.resolveClaimInviteEndpoint();
    this.debugFlow('claim started', { token: normalizedToken, endpoint });
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    });

    return this.http.post<unknown>(
      endpoint,
      { token: normalizedToken },
      {
        headers,
        withCredentials: true
      }
    ).pipe(
      map((response) => {
        const normalized = this.normalizeClaimResponse(response);
        this.debugFlow('claim success', {
          businessProfileId: normalized.businessProfileId,
          memberRole: normalized.memberRole
        });
        return normalized;
      })
    );
  }

  setPendingInviteToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const normalized = token.trim();
    if (!normalized) {
      return;
    }

    try {
      window.localStorage.setItem(PENDING_INVITE_TOKEN_KEY, normalized);
    } catch {
      // ignore storage errors
    }

    this.debugFlow('token saved', { token: normalized });
  }

  getPendingInviteToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const token = window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY)?.trim();
      return token || null;
    } catch {
      return null;
    }
  }

  getInviteTokenFromCurrentUrl(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const url = new URL(window.location.href);
      const tokenParam = url.searchParams.get('token')?.trim() ?? '';
      const codeParam = url.searchParams.get('code')?.trim() ?? '';
      const inviteParam = url.searchParams.get('invite')?.trim() ?? '';

      const token = tokenParam || codeParam || (inviteParam && inviteParam !== '1' ? inviteParam : '');
      return token || null;
    } catch {
      return null;
    }
  }

  clearPendingInviteToken(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
  }

  hasClaimSucceededForToken(token: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const key = this.getClaimSuccessKey(token);
    if (!key) {
      return false;
    }

    try {
      const localValue = window.localStorage.getItem(key);
      const sessionValue = window.sessionStorage.getItem(key);
      return localValue === 'true' || sessionValue === 'true' || sessionValue === '1';
    } catch {
      return false;
    }
  }

  markClaimSucceededForToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.getClaimSuccessKey(token);
    if (!key) {
      return;
    }

    try {
      window.localStorage.setItem(key, 'true');
      window.sessionStorage.setItem(key, '1');
      window.sessionStorage.setItem(INVITE_CLAIM_COMPLETED_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }

  hasClaimCompleted(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      if (window.sessionStorage.getItem(INVITE_CLAIM_COMPLETED_KEY) === '1') {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  markClaimCompleted(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.getClaimSuccessKey(token);
    if (!key) {
      return;
    }

    try {
      window.sessionStorage.setItem(INVITE_CLAIM_COMPLETED_KEY, '1');
      window.sessionStorage.setItem(key, '1');
      window.localStorage.setItem(key, 'true');
    } catch {
      // ignore storage errors
    }
  }

  clearClaimCompletedState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.removeItem(INVITE_CLAIM_COMPLETED_KEY);
    } catch {
      // ignore storage errors
    }
  }

  isClaimInProgressForToken(token: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const key = this.getClaimInProgressKey(token);
    if (!key) {
      return false;
    }

    try {
      return window.sessionStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }

  markClaimInProgressForToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.getClaimInProgressKey(token);
    if (!key) {
      return;
    }

    try {
      window.sessionStorage.setItem(key, 'true');
    } catch {
      // ignore storage errors
    }
  }

  clearClaimInProgressForToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.getClaimInProgressKey(token);
    if (!key) {
      return;
    }

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }

  hasClaimAttemptedForToken(token: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const claimKey = this.getClaimAttemptKey(token);
    if (!claimKey) {
      return false;
    }

    try {
      return window.sessionStorage.getItem(claimKey) === 'true';
    } catch {
      return false;
    }
  }

  markClaimAttemptedForToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const claimKey = this.getClaimAttemptKey(token);
    if (!claimKey) {
      return;
    }

    try {
      window.sessionStorage.setItem(claimKey, 'true');
    } catch {
      // ignore storage errors
    }
  }

  clearClaimAttemptedForToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const claimKey = this.getClaimAttemptKey(token);
    if (!claimKey) {
      return;
    }

    try {
      window.sessionStorage.removeItem(claimKey);
    } catch {
      // ignore storage errors
    }
  }

  setInviteClaimError(message: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const normalized = message.trim();
    if (!normalized) {
      this.clearInviteClaimError();
      return;
    }

    try {
      window.sessionStorage.setItem(INVITE_CLAIM_ERROR_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }

  formatInviteClaimError(message: string): string {
    const normalized = message.trim();
    return normalized ? `Could not accept invite: ${normalized}` : 'Could not accept invite.';
  }

  consumeInviteClaimError(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const message = window.sessionStorage.getItem(INVITE_CLAIM_ERROR_KEY)?.trim() || null;
      window.sessionStorage.removeItem(INVITE_CLAIM_ERROR_KEY);
      return message;
    } catch {
      return null;
    }
  }

  peekInviteClaimError(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.sessionStorage.getItem(INVITE_CLAIM_ERROR_KEY)?.trim() || null;
    } catch {
      return null;
    }
  }

  clearInviteClaimError(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.removeItem(INVITE_CLAIM_ERROR_KEY);
    } catch {
      // ignore storage errors
    }
  }

  getAlreadyClaimedMessage(): string {
    return 'This invite has already been used. Please sign in with the invited account.';
  }

  isAlreadyClaimedError(error: unknown): boolean {
    const normalized = (this.extractInviteErrorDetail(error) ?? '').toLowerCase();
    return (
      (normalized.includes('not pending') && normalized.includes('claimed')) ||
      (normalized.includes('already') &&
        (normalized.includes('used') || normalized.includes('accepted') || normalized.includes('claimed')))
    );
  }

  extractInviteErrorDetail(error: unknown): string | null {
    return this.pickString(
      (error as { error?: { errors?: Array<{ message?: unknown; extensions?: { reason?: unknown } }>; message?: unknown }; message?: unknown })?.error?.errors?.[0]?.extensions?.reason
    ) ??
      this.pickString(
        (error as { error?: { errors?: Array<{ message?: unknown }>; message?: unknown }; message?: unknown })?.error?.errors?.[0]?.message
      ) ??
      this.pickString((error as { error?: { message?: unknown }; message?: unknown })?.error?.message) ??
      this.pickString((error as { message?: unknown })?.message) ??
      null;
  }

  getReadableInviteError(error: unknown): string {
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 0;
    const detail = this.extractInviteErrorDetail(error);

    if (status === 401 || status === 403) {
      return 'This invite was sent to another email.';
    }

    const normalized = (detail ?? '').toLowerCase();
    if (normalized.includes('missing') && normalized.includes('token')) {
      return 'Invite token is missing.';
    }
    if (normalized.includes('not found') || normalized.includes('invalid')) {
      return 'Invite not found.';
    }
    if (normalized.includes('expired')) {
      return 'Invite expired.';
    }
    if (this.isAlreadyClaimedError(error)) {
      return 'Invite already used.';
    }
    if (
      normalized.includes('another email') ||
      normalized.includes('different email') ||
      normalized.includes('sent to another email')
    ) {
      return 'This invite was sent to another email.';
    }
    if (normalized.includes('already a member')) {
      return 'You are already a member of this workspace.';
    }

    return detail ?? 'Could not accept invite.';
  }

  private resolveClaimInviteEndpoint(): string {
    const baseUrl =
      this.pickString(environment.DIRECTUS_URL) ??
      this.pickString(environment.API_URL);
    const flowId =
      this.pickString(environment.DIRECTUS_CLAIM_INVITE_FLOW_ID) ??
      this.extractFlowIdFromLegacyEndpoint(this.pickString(environment.CLAIM_INVITE_FLOW_ENDPOINT));

    if (!baseUrl) {
      throw new Error('Directus URL is not configured.');
    }
    if (!flowId) {
      throw new Error('Claim invite flow ID is not configured.');
    }

    const normalizedFlowId = flowId.trim();
    if (normalizedFlowId.toLowerCase() === 'claim-invite') {
      throw new Error('Claim invite flow must use a Directus Flow UUID.');
    }

    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBase}/flows/trigger/${encodeURIComponent(normalizedFlowId)}`;
  }

  private normalizeClaimResponse(response: unknown): ClaimInviteResponse {
    const root = this.objectRecord(response);
    const payload = this.objectRecord(root?.['data']) ?? root;

    const businessProfileId =
      this.normalizeId(payload?.['business_profile_id']) ??
      this.normalizeId(payload?.['business_profile']) ??
      this.normalizeId(payload?.['businessProfileId']);
    const membershipId =
      this.normalizeId(this.firstArrayValue(payload?.['membership_id'])) ??
      this.normalizeId(payload?.['membershipId']);
    const memberRole =
      this.pickString(payload?.['member_role']) ??
      this.pickString(this.objectRecord(payload?.['member_role'])?.['name']) ??
      this.pickString(payload?.['memberRole']);
    const departmentId =
      this.normalizeId(payload?.['department_id']) ??
      this.normalizeId(payload?.['department']) ??
      this.normalizeId(payload?.['departmentId']);
    const ok = this.pickBoolean(payload?.['ok']) ?? Boolean(businessProfileId);

    if (!ok) {
      throw new Error(this.pickString(payload?.['message']) ?? 'Could not accept invite.');
    }

    return {
      ok,
      businessProfileId,
      membershipId,
      memberRole,
      departmentId,
      raw: response
    };
  }

  private extractFlowIdFromLegacyEndpoint(endpoint: string | null): string | null {
    if (!endpoint) {
      return null;
    }

    if (!endpoint.includes('/')) {
      return endpoint;
    }

    const marker = '/flows/trigger/';
    const index = endpoint.lastIndexOf(marker);
    if (index < 0) {
      return null;
    }

    const id = endpoint.slice(index + marker.length).split('?')[0]?.trim();
    return id || null;
  }

  private firstArrayValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  private pickBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'ok') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
    }
    return null;
  }

  private getClaimAttemptKey(token: string): string | null {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }
    return `invite_claim_attempted_${normalized}`;
  }

  private getClaimSuccessKey(token: string): string | null {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }
    return `${INVITE_CLAIM_SUCCESS_PREFIX}${normalized}`;
  }

  private getClaimInProgressKey(token: string): string | null {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }
    return `${INVITE_CLAIM_IN_PROGRESS_PREFIX}${normalized}`;
  }

  debugFlow(message: string, data?: unknown): void {
    if (environment.production) {
      return;
    }

    if (data === undefined) {
      console.debug(`[InviteFlow] ${message}`);
      return;
    }
    console.debug(`[InviteFlow] ${message}`, data);
  }
}
