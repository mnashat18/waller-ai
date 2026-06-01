import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, firstValueFrom, of } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { CompanyContextService, type CompanyContext } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { sanitizeDisplayValue } from '../shared/utils/display-formatters';

type NotificationRow = {
  id?: string | number | null;
  status?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  date_created?: string | null;
  user_created?: string | number | { id?: string | number } | null;
  read_at?: string | null;
  seen_at?: string | null;
  user?: string | number | { id?: string | number } | null;
  recipient?: string | number | { id?: string | number } | null;
  member?: string | number | { id?: string | number } | null;
  type?: string | null;
  category?: string | null;
};

type DirectusFieldRow = {
  field?: string | null;
};

type DirectusApiErrorPayload = {
  errors?: Array<{
    message?: string;
    extensions?: Record<string, unknown>;
  }>;
  message?: string;
};

type DirectusHttpError = {
  status?: number;
  message?: string;
  error?: DirectusApiErrorPayload;
};

export type WorkspaceNotification = {
  id: string;
  title: string;
  message: string;
  status: string | null;
  dateCreated: string | null;
  iconKey: string | null;
};

export type NotificationsState = {
  unreadCount: number;
  recentNotifications: WorkspaceNotification[];
  loading: boolean;
  error: string | null;
  activeWorkspaceId: string | null;
};

type ContextSnapshot = {
  ready: boolean;
  userId: string | null;
  workspaceId: string | null;
};

type NotificationSchema = {
  availableFields: Set<string>;
  requestFields: string[];
  userScopeField: 'recipient' | 'user' | 'member' | null;
  unreadMode: 'read_at' | 'seen_at' | 'status';
  iconField: 'category' | 'type' | null;
  messageField: 'message' | 'body';
};

const BASE_FIELDS = [
  'id',
  'status',
  'title',
  'message',
  'business_profile',
  'date_created',
  'user_created'
] as const;

const OPTIONAL_FIELDS = ['body', 'read_at', 'seen_at', 'recipient', 'user', 'member', 'category', 'type'] as const;

const OPEN_STATUS_VALUES = new Set(['unread', 'open', 'new']);

const INITIAL_STATE: NotificationsState = {
  unreadCount: 0,
  recentNotifications: [],
  loading: false,
  error: null,
  activeWorkspaceId: null
};

@Injectable({ providedIn: 'root' })
export class NotificationsService implements OnDestroy {
  private readonly api = environment.API_URL;
  private readonly stateSubject = new BehaviorSubject<NotificationsState>(INITIAL_STATE);
  private readonly schemaCache = new Map<string, NotificationSchema>();
  private readonly contextSub: Subscription;

  private initialized = false;
  private currentWorkspaceId: string | null = null;
  private currentUserId: string | null = null;
  private loadVersion = 0;

  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companyContext: CompanyContextService
  ) {
    this.contextSub = this.companyContext.state$.pipe(
      map((state) => this.toContextSnapshot(state.context)),
      distinctUntilChanged((left, right) =>
        left.ready === right.ready &&
        left.workspaceId === right.workspaceId &&
        left.userId === right.userId
      )
    ).subscribe((context) => {
      if (!this.initialized) {
        return;
      }
      this.handleContextChange(context);
    });
  }

  ngOnDestroy(): void {
    this.contextSub.unsubscribe();
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.handleContextChange(this.toContextSnapshot(this.companyContext.snapshot().context));
  }

  refresh(reason = 'manual-refresh'): void {
    if (!this.currentWorkspaceId) {
      return;
    }
    void this.loadForWorkspace(this.currentWorkspaceId, this.currentUserId, reason);
  }

  clear(): void {
    this.currentWorkspaceId = null;
    this.currentUserId = null;
    this.stateSubject.next({
      unreadCount: 0,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: null
    });
  }

  private handleContextChange(context: ContextSnapshot): void {
    if (!context.ready || !context.workspaceId) {
      this.clear();
      return;
    }

    const workspaceChanged = this.currentWorkspaceId !== context.workspaceId;
    const userChanged = this.currentUserId !== context.userId;
    this.currentWorkspaceId = context.workspaceId;
    this.currentUserId = context.userId;

    if (workspaceChanged) {
      this.stateSubject.next({
        unreadCount: 0,
        recentNotifications: [],
        loading: false,
        error: null,
        activeWorkspaceId: context.workspaceId
      });
    }

    if (workspaceChanged || userChanged) {
      void this.loadForWorkspace(context.workspaceId, context.userId, workspaceChanged ? 'workspace-change' : 'context-change');
    }
  }

  private async loadForWorkspace(workspaceId: string, userId: string | null, reason: string): Promise<void> {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      this.stateSubject.next({
        ...this.stateSubject.value,
        unreadCount: 0,
        recentNotifications: [],
        loading: false,
        error: 'No active access token.',
        activeWorkspaceId: workspaceId
      });
      return;
    }

    const version = ++this.loadVersion;
    this.stateSubject.next({
      ...this.stateSubject.value,
      loading: true,
      error: null,
      activeWorkspaceId: workspaceId
    });

    console.log('[Notifications] loading started');
    console.log(`[Notifications] active workspace ${workspaceId}`);
    console.log('[Notifications] load reason', reason);

    try {
      const schema = await this.resolveSchema(token, workspaceId);
      const rows = await this.queryNotifications(token, workspaceId, userId, schema);
      const mapped = rows
        .map((row) => this.mapNotification(row, schema))
        .filter((item): item is WorkspaceNotification => item !== null)
        .sort((left, right) => this.toMillis(right.dateCreated) - this.toMillis(left.dateCreated))
        .slice(0, 20);

      const unreadCount = this.countUnread(rows, schema);
      console.log('[Notifications] API result', rows);
      console.log('[Notifications] unread count', unreadCount);

      if (version !== this.loadVersion) {
        return;
      }

      this.stateSubject.next({
        unreadCount,
        recentNotifications: mapped,
        loading: false,
        error: null,
        activeWorkspaceId: workspaceId
      });
    } catch (error) {
      const directusError = error as DirectusHttpError;
      this.logDirectusError(directusError);
      if (version !== this.loadVersion) {
        return;
      }
      this.stateSubject.next({
        unreadCount: 0,
        recentNotifications: [],
        loading: false,
        error: 'Notifications could not be loaded',
        activeWorkspaceId: workspaceId
      });
    } finally {
      if (version === this.loadVersion) {
        console.log('[Notifications] loading finished');
      }
    }
  }

  private async resolveSchema(token: string, workspaceId: string): Promise<NotificationSchema> {
    const cached = this.schemaCache.get(workspaceId);
    if (cached) {
      return cached;
    }

    const fallback = this.buildSchemaFromFieldList(new Set(BASE_FIELDS));

    const fieldsResponse = await firstValueFrom(
      this.http.get<{ data?: DirectusFieldRow[] }>(
        `${this.api}/fields/notifications?_ts=${Date.now()}`,
        { headers: this.auth.getAuthHeaders(token), withCredentials: true }
      ).pipe(
        map((response) => response.data ?? []),
        catchError((error: DirectusHttpError) => {
          console.warn('[Notifications] schema introspection failed, using minimal field set', error);
          return of([] as DirectusFieldRow[]);
        })
      )
    );

    const available = new Set<string>();
    for (const row of fieldsResponse ?? []) {
      const field = this.normalizeText(row.field);
      if (field) {
        available.add(field);
      }
    }

    const schema = available.size ? this.buildSchemaFromFieldList(available) : fallback;
    this.schemaCache.set(workspaceId, schema);
    return schema;
  }

  private buildSchemaFromFieldList(availableFields: Set<string>): NotificationSchema {
    const requestFields: string[] = [];
    for (const field of BASE_FIELDS) {
      if (availableFields.has(field)) {
        requestFields.push(field);
      }
    }
    for (const field of OPTIONAL_FIELDS) {
      if (availableFields.has(field)) {
        requestFields.push(field);
      }
    }
    if (!requestFields.includes('id')) {
      requestFields.unshift('id');
    }
    if (!requestFields.includes('date_created')) {
      requestFields.push('date_created');
    }

    const userScopeField = (['recipient', 'user', 'member'] as const).find((field) => availableFields.has(field)) ?? null;
    const unreadMode = availableFields.has('read_at')
      ? 'read_at'
      : availableFields.has('seen_at')
        ? 'seen_at'
        : 'status';
    const iconField = availableFields.has('category')
      ? 'category'
      : availableFields.has('type')
        ? 'type'
        : null;
    const messageField = availableFields.has('message') ? 'message' : 'body';

    return {
      availableFields,
      requestFields,
      userScopeField,
      unreadMode,
      iconField,
      messageField
    };
  }

  private async queryNotifications(
    token: string,
    workspaceId: string,
    userId: string | null,
    schema: NotificationSchema
  ): Promise<NotificationRow[]> {
    const candidateFields = [...schema.requestFields];
    let userScopeField = schema.userScopeField;

    while (candidateFields.length) {
      try {
        const params = new URLSearchParams({
          fields: candidateFields.join(','),
          limit: '30',
          sort: '-date_created'
        });

        if (schema.availableFields.has('business_profile')) {
          params.set('filter[business_profile][_eq]', workspaceId);
        }
        if (userScopeField && userId) {
          params.set(`filter[_or][0][${userScopeField}][_eq]`, userId);
          params.set(`filter[_or][1][${userScopeField}][_null]`, 'true');
        }

        const response = await firstValueFrom(
          this.http.get<{ data?: NotificationRow[] }>(
            `${this.api}/items/notifications?${params.toString()}&_ts=${Date.now()}`,
            { headers: this.auth.getAuthHeaders(token), withCredentials: true }
          )
        );

        return response?.data ?? [];
      } catch (error) {
        const directusError = error as DirectusHttpError;
        const problemFields = this.extractProblemFields(directusError);
        if (
          userScopeField &&
          problemFields.includes(userScopeField)
        ) {
          console.warn('[Notifications] user-level filter is not allowed for this role, retrying without it', {
            filterField: userScopeField
          });
          userScopeField = null;
          continue;
        }
        const dropped = this.removeProblemFields(candidateFields, directusError);
        if (dropped) {
          schema.requestFields = [...candidateFields];
          continue;
        }
        throw error;
      }
    }

    return [];
  }

  private removeProblemFields(fields: string[], error: DirectusHttpError): boolean {
    const problemFields = this.extractProblemFields(error);
    if (!problemFields.length) {
      return false;
    }

    const beforeLength = fields.length;
    for (const field of problemFields) {
      const index = fields.indexOf(field);
      if (index >= 0) {
        fields.splice(index, 1);
      }
    }

    if (fields.length < beforeLength) {
      console.warn('[Notifications] dropping unsupported/forbidden fields and retrying', {
        removed: problemFields,
        remaining: fields
      });
      return true;
    }

    return false;
  }

  private extractProblemFields(error: DirectusHttpError): string[] {
    const reported = new Set<string>();
    const messages: string[] = [];
    const errors = error?.error?.errors ?? [];

    for (const item of errors) {
      if (item?.message) {
        messages.push(item.message);
      }
      const extensionField = item?.extensions?.['field'];
      if (typeof extensionField === 'string' && extensionField.trim()) {
        reported.add(extensionField.trim());
      }
    }

    if (typeof error?.error?.message === 'string') {
      messages.push(error.error.message);
    }
    if (typeof error?.message === 'string') {
      messages.push(error.message);
    }

    for (const message of messages) {
      const regex = /field\s+["'`]?([a-zA-Z0-9_]+)["'`]?/gi;
      let match: RegExpExecArray | null = regex.exec(message);
      while (match) {
        if (match[1]) {
          reported.add(match[1]);
        }
        match = regex.exec(message);
      }
    }

    return Array.from(reported);
  }

  private countUnread(rows: NotificationRow[], schema: NotificationSchema): number {
    if (schema.unreadMode === 'read_at') {
      return rows.filter((row) => row.read_at == null || this.normalizeText(row.read_at) === '').length;
    }
    if (schema.unreadMode === 'seen_at') {
      return rows.filter((row) => row.seen_at == null || this.normalizeText(row.seen_at) === '').length;
    }
    return rows.filter((row) => OPEN_STATUS_VALUES.has(this.normalizeText(row.status))).length;
  }

  private mapNotification(row: NotificationRow, schema: NotificationSchema): WorkspaceNotification | null {
    const id = this.normalizeId(row.id);
    if (!id) {
      return null;
    }

    const title = sanitizeDisplayValue(this.pickText(row.title), 'Notification');
    const message = schema.messageField === 'message'
      ? sanitizeDisplayValue(this.pickText(row.message) ?? this.pickText(row.body), 'No additional detail was returned.')
      : sanitizeDisplayValue(this.pickText(row.body) ?? this.pickText(row.message), 'No additional detail was returned.');

    const status = this.pickText(row.status);
    const iconSource = schema.iconField === 'category'
      ? this.pickText(row.category)
      : schema.iconField === 'type'
        ? this.pickText(row.type)
        : null;

    return {
      id,
      title,
      message,
      status,
      dateCreated: row.date_created ?? null,
      iconKey: iconSource ? this.normalizeText(iconSource) : null
    };
  }

  private toContextSnapshot(context: CompanyContext): ContextSnapshot {
    const workspaceId = this.normalizeId(context.activeBusinessProfileId);
    const userId = this.normalizeId(context.userId);
    return {
      ready: Boolean(context.authInitialized && context.workspaceInitialized && context.isAuthenticated),
      workspaceId,
      userId
    };
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

  private pickText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  private normalizeText(value: unknown): string {
    return this.pickText(value)?.toLowerCase() ?? '';
  }

  private toMillis(value: string | null): number {
    if (!value) {
      return 0;
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private logDirectusError(error: DirectusHttpError): void {
    console.error('[Notifications] Directus error', error);
    if ((error?.status ?? 0) !== 403) {
      return;
    }

    const fieldErrors = this.extractProblemFields(error);
    if (fieldErrors.length) {
      console.error('[Notifications] 403 forbidden on specific fields', fieldErrors);
      return;
    }

    console.error('[Notifications] collection access forbidden', {
      collection: 'notifications',
      operation: 'read',
      fields_required_by_frontend: [...BASE_FIELDS],
      filter: 'business_profile equals current active business profile'
    });
  }
}
