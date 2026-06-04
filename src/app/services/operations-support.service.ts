import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
  formatBusinessProfile,
  formatDepartment,
  formatUserName,
  isUuid,
  sanitizeDisplayValue
} from '../shared/utils/display-formatters';

import { CompanyContextService, type CompanyContext } from '../core/context/company-context.service';
import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AuthService } from './auth';

export type SupportDepartmentOption = {
  id: string;
  name: string;
};

export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_label: string;
  target_label: string | null;
  department_id: string | null;
  department_name: string | null;
  date_created: string | null;
  meta: unknown;
};

export type ActivityPageData = {
  rows: ActivityRow[];
  departments: SupportDepartmentOption[];
  actorOptions: string[];
  actionOptions: string[];
  entityTypeOptions: string[];
};

export type ReportRow = {
  id: string;
  format: string | null;
  status: string | null;
  file_id: string | null;
  file_name: string | null;
  file_url: string | null;
  filters: unknown;
  completed_at: string | null;
  date_created: string | null;
};

export type ReportsPageData = {
  rows: ReportRow[];
  departments: SupportDepartmentOption[];
  statusOptions: string[];
  summary: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    alert_count: number;
    scan_count: number;
    request_count: number;
  };
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  date_created: string | null;
  link_type: string | null;
  link_id: string | null;
  route: string;
};

export type NotificationsPanelData = {
  unreadCount: number;
  items: NotificationItem[];
};

export type SettingsPageData = {
  workspace: {
    company_name: string | null;
    accessLabel: string | null;
    billing_status: string | null;
    timezone: string | null;
    default_language: string | null;
    employee_limit: number | null;
    is_active: boolean | null;
  } | null;
  summaries: {
    department_count: number;
    active_shift_templates: number;
    total_shift_templates: number;
    member_count: number;
    manager_count: number;
    push_subscription_count: number;
    active_push_subscriptions: number;
  };
  pushPlatforms: Array<{ label: string; count: number }>;
  companyContext: {
    role: ActiveMemberRole;
    company_label: string;
    department_label: string;
  };
};

export type CreateReportExportInput = {
  format: string;
  department?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  export_type?: string | null;
};

type ActivityRecord = {
  id?: string | number;
  action?: string | null;
  entity_type?: string | null;
  entity_id?: string | number | null;
  actor?: string | number | { id?: string | number; label?: string | null; name?: string | null; email?: string | null } | null;
  target_user?: string | number | { id?: string | number; label?: string | null; name?: string | null; email?: string | null } | null;
  department?: { id?: string | number; name?: string | null } | string | number | null;
  date_created?: string | null;
  meta?: unknown;
};

type DepartmentRecord = {
  id?: string | number;
  name?: string | null;
};

type FileRecord = {
  id?: string | number;
  filename_download?: string | null;
  title?: string | null;
};

type ReportExportRecord = {
  id?: string | number;
  format?: string | null;
  status?: string | null;
  file?: FileRecord | string | number | null;
  filters?: unknown;
  completed_at?: string | null;
  date_created?: string | null;
};

type AlertRecord = { id?: string | number };
type WellnessScanRecord = { id?: string | number };
type ScanRequestRecord = { id?: string | number };

type PushSubscriptionRecord = {
  id?: string | number;
  status?: string | null;
  platform?: string | null;
};

type BusinessProfileRecord = {
  id?: string | number;
  company_name?: string | null;
  billing_status?: string | null;
  timezone?: string | null;
  default_language?: string | null;
  employee_limit?: number | null;
  is_active?: boolean | null;
};

type ShiftTemplateRecord = {
  id?: string | number;
  is_active?: boolean | null;
};

type MemberRecord = {
  id?: string | number;
  member_role?: string | null;
};

type NotificationRecord = {
  id?: string | number;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  status?: string | null;
  link_type?: string | null;
  link_id?: string | number | null;
  date_created?: string | null;
};

type ScopedContext = {
  token: string;
  company: CompanyContext;
  businessProfileId: string;
  activeRole: ActiveMemberRole;
  activeDepartmentId: string | null;
};

@Injectable({ providedIn: 'root' })
export class OperationsSupportService {
  private readonly api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companyContext: CompanyContextService
  ) {}

  getActivityPageData(): Observable<ActivityPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          events: this.queryItems<ActivityRecord>(
            'activity_events',
            ['id', 'action', 'entity_type', 'entity_id', 'actor', 'target_user', 'department.id', 'department.name', 'date_created', 'meta'],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              sort: '-date_created',
              limit: 500
            }
          ),
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: 'name',
              limit: 120
            }
          )
        }).pipe(
          map(({ events, departments }) => ({
            rows: (events ?? []).map((row) => ({
              id: this.normalizeId(row.id) ?? '',
              action: row.action?.trim() || 'activity_recorded',
              entity_type: row.entity_type?.trim() || 'record',
              entity_id: this.normalizeId(row.entity_id),
              actor_label: this.activityLabel(row.actor) || 'System',
              target_label: this.activityLabel(row.target_user) || null,
              department_id: this.normalizeId(row.department),
              department_name: this.departmentName(row.department),
              date_created: row.date_created ?? null,
              meta: row.meta ?? null
            })).filter((item) => item.id),
            departments: (departments ?? []).map((department) => ({
              id: this.normalizeId(department.id) ?? '',
              name: formatDepartment(department, 'Unnamed Department')
            })).filter((item) => item.id),
            actorOptions: this.uniqueValues((events ?? []).map((row) => this.activityLabel(row.actor))),
            actionOptions: this.uniqueValues((events ?? []).map((row) => row.action)),
            entityTypeOptions: this.uniqueValues((events ?? []).map((row) => row.entity_type))
          }))
        )
      )
    );
  }

  getReportsPageData(): Observable<ReportsPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          exports: this.queryItems<ReportExportRecord>(
            'reports_exports',
            ['id', 'format', 'status', 'file.id', 'file.filename_download', 'file.title', 'filters', 'completed_at', 'date_created'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: '-date_created',
              limit: 200
            }
          ),
          alerts: this.queryItems<AlertRecord>(
            'alerts',
            ['id'],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              limit: 400
            }
          ),
          notifications: this.queryItems<NotificationRecord>(
            'notifications',
            ['id', 'title', 'body', 'type', 'status', 'link_type', 'link_id', 'date_created', 'business_profile'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: '-date_created',
              limit: 400
            }
          ),
          scans: this.queryItems<WellnessScanRecord>(
            'wellness_scans',
            ['id'],
            context.token,
            { limit: 500 }
          ),
          requests: this.queryItems<ScanRequestRecord>(
            'requests',
            ['id'],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              limit: 500
            }
          ),
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: 'name',
              limit: 120
            }
          )
        }).pipe(
          map(({ exports, alerts, notifications, scans, requests, departments }) => {
            const rows = (exports ?? []).map((row) => this.mapReportRow(row)).filter((item) => item.id);
            return {
              rows,
              departments: (departments ?? []).map((department) => ({
                id: this.normalizeId(department.id) ?? '',
                name: department.name?.trim() || 'Unnamed Department'
              })).filter((item) => item.id),
              statusOptions: this.uniqueValues(rows.map((row) => row.status), ['pending', 'processing', 'completed', 'failed']),
              summary: {
                pending: rows.filter((row) => this.normalizeText(row.status) === 'pending').length,
                processing: rows.filter((row) => this.normalizeText(row.status) === 'processing').length,
                completed: rows.filter((row) => this.normalizeText(row.status) === 'completed').length,
                failed: rows.filter((row) => this.normalizeText(row.status) === 'failed').length,
                alert_count: alerts.length,
                notification_count: notifications.length,
                scan_count: scans.length,
                request_count: requests.length
              }
            };
          })
        )
      )
    );
  }

  getSettingsPageData(): Observable<SettingsPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          profiles: this.queryItems<BusinessProfileRecord>(
            'business_profiles',
            ['id', 'company_name', 'billing_status', 'timezone', 'default_language', 'employee_limit', 'is_active'],
            context.token,
            {
              filters: [{ path: ['id'], operator: '_eq', value: context.businessProfileId }],
              limit: 1
            }
          ),
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 200
            }
          ),
          shifts: this.queryItems<ShiftTemplateRecord>(
            'shift_templates',
            ['id', 'is_active'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 300
            }
          ),
          pushSubscriptions: this.queryItems<PushSubscriptionRecord>(
            'push_subscriptions',
            ['id', 'status', 'platform'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 300
            }
          ),
          members: this.queryItems<MemberRecord>(
            'business_profile_members',
            ['id', 'member_role'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 400
            }
          )
        }).pipe(
          map(({ profiles, departments, shifts, pushSubscriptions, members }) => {
            const pushPlatformCounts = new Map<string, number>();
            for (const row of pushSubscriptions ?? []) {
              const platform = row.platform?.trim() || 'Unknown';
              pushPlatformCounts.set(platform, (pushPlatformCounts.get(platform) ?? 0) + 1);
            }

            return {
              workspace: profiles[0]
                ? {
                    company_name: profiles[0].company_name ?? null,
                    accessLabel: this.resolveWorkspaceAccessLabel(profiles[0]),
                    billing_status: profiles[0].billing_status ?? null,
                    timezone: profiles[0].timezone ?? null,
                    default_language: profiles[0].default_language ?? null,
                    employee_limit: profiles[0].employee_limit ?? null,
                    is_active: profiles[0].is_active ?? null
                  }
                : null,
              summaries: {
                department_count: departments.length,
                active_shift_templates: shifts.filter((row) => row.is_active !== false).length,
                total_shift_templates: shifts.length,
                member_count: members.length,
                manager_count: members.filter((row) => this.normalizeText(row.member_role) === 'manager').length,
                push_subscription_count: pushSubscriptions.length,
                active_push_subscriptions: pushSubscriptions.filter((row) => !['inactive', 'disabled', 'revoked'].includes(this.normalizeText(row.status))).length
              },
              pushPlatforms: Array.from(pushPlatformCounts.entries())
                .map(([label, count]) => ({ label, count }))
                .sort((left, right) => right.count - left.count),
              companyContext: {
                role: context.activeRole,
                company_label:
                  sanitizeDisplayValue(
                    context.company.activeBusinessProfileName ?? formatBusinessProfile({ id: context.businessProfileId }, ''),
                    'Current workspace'
                  ),
                department_label:
                  sanitizeDisplayValue(context.company.activeDepartmentName, 'Company-wide')
              }
            };
          })
        )
      )
    );
  }

  getNotificationsPanelData(limit = 20): Observable<NotificationsPanelData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.queryItems<NotificationRecord>(
          'notifications',
          ['id', 'title', 'body', 'type', 'status', 'link_type', 'link_id', 'date_created'],
          context.token,
          {
            filters: [
              ...this.scopeFilters(context, ['business_profile'], ['department']),
              ...(context.company.userId ? [{ path: ['user'], operator: '_eq', value: context.company.userId }] : [])
            ],
            sort: '-date_created',
            limit
          }
        ).pipe(
          map((rows) => {
            const items = (rows ?? []).map((row) => ({
              id: this.normalizeId(row.id) ?? '',
              title: row.title?.trim() || 'Notification',
              body: row.body?.trim() || 'No additional detail was returned.',
              type: row.type?.trim() || 'general',
              status: row.status?.trim() || 'unread',
              date_created: row.date_created ?? null,
              link_type: row.link_type?.trim() || null,
              link_id: this.normalizeId(row.link_id),
              route: this.notificationRoute(row.link_type, row.link_id)
            })).filter((item) => item.id);

            return {
              unreadCount: items.filter((item) => this.normalizeText(item.status) !== 'read').length,
              items
            };
          })
        )
      )
    );
  }

  markNotificationRead(notificationId: string): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch(
          `${this.api}/items/notifications/${encodeURIComponent(notificationId)}`,
          { status: 'read' },
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(map(() => void 0))
      )
    );
  }

  markAllNotificationsRead(): Observable<void> {
    return this.getNotificationsPanelData(50).pipe(
      switchMap((data) => {
        const unread = data.items.filter((item) => this.normalizeText(item.status) !== 'read');
        if (!unread.length) {
          return of(void 0);
        }
        return forkJoin(unread.map((item) => this.markNotificationRead(item.id).pipe(catchError(() => of(void 0))))).pipe(
          map(() => void 0)
        );
      })
    );
  }

  createReportExport(input: CreateReportExportInput): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.post(
          `${this.api}/items/reports_exports`,
          {
            business_profile: context.businessProfileId,
            user: context.company.userId,
            format: input.format,
            status: 'pending',
            filters: {
              export_type: input.export_type ?? 'operations',
              department: input.department ?? null,
              start_date: input.start_date ?? null,
              end_date: input.end_date ?? null
            }
          },
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(map(() => void 0))
      )
    );
  }

  retryReportExport(row: ReportRow): Observable<void> {
    const filters = this.objectRecord(row.filters);
    return this.createReportExport({
      format: row.format || 'csv',
      department: this.normalizeId(filters?.['department']),
      start_date: this.pickString(filters?.['start_date']),
      end_date: this.pickString(filters?.['end_date']),
      export_type: this.pickString(filters?.['export_type']) || 'operations'
    });
  }

  private ensureScopedContext(): Observable<ScopedContext> {
    return this.companyContext.ensureLoaded().pipe(
      map((state) => {
        const token = this.auth.getStoredAccessToken() ?? '';
        const businessProfileId = state.context.activeBusinessProfileId;
        const activeRole = state.context.activeMemberRole;
        const activeDepartmentId = activeRole === 'manager' ? state.context.activeDepartmentId : null;

        if (!businessProfileId || !activeRole || activeRole === 'employee') {
          throw new Error('Active business profile context is missing.');
        }

        return {
          token,
          company: state.context,
          businessProfileId,
          activeRole,
          activeDepartmentId
        } satisfies ScopedContext;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  private queryItems<T>(
    collection: string,
    fields: string[],
    token: string,
    options?: {
      filters?: Array<{ path: string[]; operator: string; value: string }>;
      sort?: string;
      limit?: number;
    }
  ): Observable<T[]> {
    const params = new URLSearchParams({
      fields: fields.join(','),
      limit: String(options?.limit ?? 100),
      sort: options?.sort ?? '-id'
    });

    for (const filter of options?.filters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${collection}?${params.toString()}`,
      { headers: this.headers(token), withCredentials: true }
    ).pipe(
      map((response) => response.data ?? []),
      catchError(() => of([]))
    );
  }

  private headers(token: string): HttpHeaders {
    return this.auth.getAuthHeaders(token);
  }

  private setFilter(params: URLSearchParams, path: string[], operator: string, value: string): void {
    let key = 'filter';
    for (const part of path) {
      key += `[${part}]`;
    }
    key += `[${operator}]`;
    params.set(key, value);
  }

  private scopeFilters(
    context: ScopedContext,
    businessPath: string[],
    departmentPath?: string[]
  ): Array<{ path: string[]; operator: string; value: string }> {
    const filters = [{ path: businessPath, operator: '_eq', value: context.businessProfileId }];
    if (context.activeRole === 'manager' && context.activeDepartmentId && departmentPath?.length) {
      filters.push({ path: departmentPath, operator: '_eq', value: context.activeDepartmentId });
    }
    return filters;
  }

  private mapReportRow(row: ReportExportRecord): ReportRow {
    const file = this.objectRecord(row.file);
    const fileId = this.normalizeId(row.file);
    const fileName = this.pickString(file?.['filename_download']) ?? this.pickString(file?.['title']);
    return {
      id: this.normalizeId(row.id) ?? '',
      format: row.format?.trim() || null,
      status: row.status?.trim() || null,
      file_id: fileId,
      file_name: fileName,
      file_url: fileId ? `${this.api}/assets/${encodeURIComponent(fileId)}` : null,
      filters: row.filters ?? null,
      completed_at: row.completed_at ?? null,
      date_created: row.date_created ?? null
    };
  }

  private notificationRoute(linkType?: string | null, linkId?: string | number | null): string {
    const normalizedType = this.normalizeText(linkType);
    const normalizedId = this.normalizeId(linkId);

    if (normalizedType.includes('alert')) {
      return normalizedId ? `/app/alerts?alert=${normalizedId}` : '/app/alerts';
    }
    if (normalizedType.includes('request')) {
      return normalizedId ? `/app/scan-requests?request=${normalizedId}` : '/app/scan-requests';
    }
    if (normalizedType.includes('activity')) {
      return '/app/activity';
    }
    if (normalizedType.includes('report')) {
      return '/app/reports';
    }
    return '/app/dashboard';
  }

  private uniqueValues(values: Array<string | null | undefined>, seed: string[] = []): string[] {
    const set = new Set(seed.filter(Boolean).map((item) => item.trim()).filter(Boolean));
    for (const value of values ?? []) {
      const normalized = value?.trim();
      if (normalized) {
        set.add(normalized);
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }

  private activityLabel(value: unknown): string | null {
    const label = formatUserName(value, '');
    if (label) {
      return label;
    }
    const primitive = this.pickString(value);
    if (!primitive || isUuid(primitive)) {
      return null;
    }
    return primitive;
  }

  private departmentName(value: unknown): string | null {
    const label = formatDepartment(value, '');
    return label || null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') return this.normalizeId((value as Record<string, unknown>)['id']);
    return null;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  private normalizeText(value: unknown): string {
    return this.pickString(value)?.toLowerCase() ?? '';
  }

  private resolveWorkspaceAccessLabel(
    profile: Pick<BusinessProfileRecord, 'billing_status' | 'is_active'> | null | undefined
  ): string {
    const billingStatus = this.normalizeText(profile?.billing_status);
    if (billingStatus === 'trial') {
      return 'Business Trial';
    }
    if (Boolean(profile?.is_active)) {
      return 'Business';
    }
    if (billingStatus) {
      return this.toDisplayLabel(billingStatus);
    }
    return 'Free';
  }

  private toDisplayLabel(value: string): string {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
