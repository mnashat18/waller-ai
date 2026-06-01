# Wellar AI Authenticated Angular Dashboard Implementation Plan

This document is the implementation blueprint for the authenticated Angular dashboard. It replaces narrative-only page notes with route, module, component, service, and access guidance for developers.

## 1. Scope Rules

- The authenticated web product is a B2B operations platform.
- Employees complete scans on mobile. They do not use the admin dashboard.
- Every dashboard query must be scoped by `directus_users.active_business_profile`.
- Manager pages must also be scoped by `directus_users.active_department`.
- Role checks must use `directus_users.active_member_role`.
- Use non-medical wording only.
- Primary readiness labels are:
  - `Stable`
  - `Low Focus`
  - `Elevated Fatigue`
  - `High Risk`

## 2. Dashboard Pages vs Global Shell Elements

### Dashboard Pages

- `Dashboard`
- `Company`
- `Members`
- `Departments`
- `Invites`
- `Requests`
- `Compliance`
- `Alerts`
- `Activity`
- `Reports`
- `Settings`

### Global Shell Elements

- Top bar
- Sidebar
- Role-aware navigation
- Company switcher
- User profile menu
- Notification bell
- Global notifications panel

## 3. Page-To-Route Mapping

| Route | Page | Angular Feature Area | Roles | Manager Department Scope |
| --- | --- | --- | --- | --- |
| `/dashboard` | Dashboard | `features/dashboard` | owner, hr, manager | Required |
| `/company` | Company | `features/company` | owner, hr | No access |
| `/members` | Members | `features/members` | owner, hr, manager | Required |
| `/departments` | Departments | `features/departments` | owner, hr | No access |
| `/invites` | Invites | `features/invites` | owner, hr | No access |
| `/requests` | Requests | `features/requests` | owner, hr, manager | Required |
| `/compliance` | Compliance | `features/compliance` | owner, hr, manager | Required |
| `/alerts` | Alerts | `features/alerts` | owner, hr, manager | Required |
| `/activity` | Activity | `features/activity` | owner, hr | No access |
| `/reports` | Reports | `features/reports` | owner, hr | No access |
| `/settings` | Settings | `features/settings` | owner, hr | No access |
| `global shell` | Notifications panel | `shell/notifications` | owner, hr, manager | Scoped |

## 4. Module Breakdown

### Shell / Core

- `core/auth`
  - auth state
  - route guards
  - role guard helpers
- `core/context`
  - active business profile resolver
  - active department resolver
  - active role resolver
  - company switcher state
- `core/api`
  - Directus HTTP base
  - collection-specific data services
- `shell/layout`
  - app shell
  - top bar
  - sidebar
  - shell breadcrumbs / page title
- `shell/notifications`
  - notification bell
  - notification panel

### Feature Areas

- `features/dashboard`
- `features/company`
- `features/members`
- `features/departments`
- `features/invites`
- `features/requests`
- `features/compliance`
- `features/alerts`
- `features/activity`
- `features/reports`
- `features/settings`

### Shared UI

- `shared/ui`
  - tables
  - filters
  - KPI cards
  - charts
  - drawers
  - status chips
  - empty state
  - loading skeletons
  - error panels
  - scope banner

## 5. Service Layer Plan

| Service | Responsibility | Backend Collections |
| --- | --- | --- |
| `BusinessContextService` | active company, department, role, guard helpers | `business_profiles`, `business_profile_members`, `departments` |
| `CompanyService` | company profile read/update | `business_profiles` |
| `MembersService` | roster, role state, department assignments | `business_profile_members`, `departments` |
| `InvitesService` | onboarding invite queue and actions | `request_invites` |
| `RequestsService` | scan request workflow | `scan_requests`, `business_profile_members`, `departments`, `shift_templates` |
| `ComplianceService` | coverage, completion, readiness evidence | `shift_templates`, `scan_requests`, `wellness_scans`, `scan_results`, `consent_logs` |
| `AlertsService` | alert queue, resolution workflow | `alerts`, `scan_results`, `wellness_scans`, `scan_requests` |
| `ActivityService` | audit trail and filters | `activity_events` |
| `ReportsService` | export jobs and report creation | `reports_exports` |
| `NotificationsService` | notification bell and panel | `notifications` |
| `SettingsService` | lean workspace settings | `business_profiles`, `shift_templates`, `push_subscriptions` |

## 6. Role Access Matrix

| Page | owner | hr | manager | employee |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes | Yes, active department only | No |
| Company | Yes | Yes | No | No |
| Members | Yes | Yes | Yes, active department only | No |
| Departments | Yes | Yes | No | No |
| Invites | Yes | Yes | No | No |
| Requests | Yes | Yes | Yes, active department only | No |
| Compliance | Yes | Yes | Yes, active department only | No |
| Alerts | Yes | Yes | Yes, active department only | No |
| Activity | Yes | Yes | No | No |
| Reports | Yes | Yes | No | No |
| Settings | Yes | Yes | No | No |
| Notifications Panel | Yes | Yes | Yes, scoped | No |
| Raw media access | Yes | No | No | No |

## 7. Alerts Schema Handling

### Implementation Rule

- Do not invent alert status values in the UI.
- Use `alerts.status` exactly as returned by the backend.
- Use `alerts.action_type` exactly as returned by the backend.
- UI display may title-case or format the raw enum string, but must not remap it to a different workflow state.

### Required Angular Handling

- Create a shared `AlertSchemaAdapter` used by:
  - `AlertsService`
  - alert status chip component
  - notifications links to alerts
- The adapter must:
  - accept raw `status`
  - accept raw `action_type`
  - return display label only
  - never convert one backend status into a different UI status

### Developer Note

- If the Directus collection exposes allowed enum values through metadata, consume that metadata in a typed constant.
- If metadata is not yet available in the frontend, create a temporary schema contract file populated from backend source of truth before building the full alerts page.

## 8. Page Definitions For Implementation

### 8.1 Dashboard

| Item | Definition |
| --- | --- |
| Purpose | Operational overview for the active company or active department |
| Roles | owner, hr, manager |
| Collections | `business_profiles`, `business_profile_members`, `departments`, `shift_templates`, `scan_requests`, `wellness_scans`, `alerts`, `notifications` |
| Main Components | `DashboardContainer`, `DashboardScopeBanner`, `ReadinessSummaryCards`, `ShiftCoverageWidget`, `ReadinessDistributionChart`, `OpenAlertsWidget`, `PendingRequestsWidget`, `RecentActivityList`, `NotificationsPreview` |
| Empty State | No shift activity yet for current scope |
| Loading State | KPI skeletons, chart skeletons, activity list skeleton |
| Error State | Context-aware load failure panel with retry |
| CTAs | `Review Alerts`, `Open Compliance`, `Open Requests`, `View Reports`, `Manage Shift Templates` |

### 8.2 Company

| Item | Definition |
| --- | --- |
| Purpose | Company and account control page for the active company |
| Roles | owner, hr |
| Collections | `business_profiles`, `business_profile_members`, `departments`, `shift_templates`, `push_subscriptions` |
| Required Company Fields | `billing_status`, `employee_limit`, `timezone`, `default_language` |
| Main Components | `CompanyPageContainer`, `CompanyProfileCard`, `CompanyMetadataPanel`, `CompanyOperationalSummary`, `CompanyLimitsCard`, `CompanyLocaleCard`, `CompanyCountsStrip` |
| Empty State | No active company profile found |
| Loading State | Profile and metadata skeletons |
| Error State | Invalid or missing active company context panel |
| CTAs | `Edit Company Profile`, `Manage Departments`, `Review Members`, `Configure Shift Templates` |

### 8.3 Members

| Item | Definition |
| --- | --- |
| Purpose | Workforce directory, RBAC view, department membership management |
| Roles | owner, hr, manager |
| Collections | `business_profile_members`, `business_profiles`, `departments`, `request_invites`, `scan_requests`, `wellness_scans`, `alerts` |
| Main Components | `MembersPageContainer`, `MembersFilterBar`, `MembersTable`, `MemberRoleChip`, `MemberDepartmentChip`, `MemberDetailDrawer`, `MemberParticipationCell`, `MemberAlertSummaryCell` |
| Empty State | No members in scope |
| Loading State | Table skeleton and filter skeleton |
| Error State | Scope-aware members load error |
| CTAs | `Invite Members`, `Assign Department`, `Update Roles`, `View Member Activity` |

### 8.4 Departments

| Item | Definition |
| --- | --- |
| Purpose | Department structure and assignment model for company operations |
| Roles | owner, hr |
| Collections | `departments`, `business_profile_members`, `shift_templates`, `alerts` |
| Main Components | `DepartmentsPageContainer`, `DepartmentsGrid`, `DepartmentDetailPanel`, `DepartmentManagerCard`, `DepartmentShiftCoverageCard`, `DepartmentAlertsCard`, `DepartmentFormDialog` |
| Empty State | No departments configured |
| Loading State | Grid and detail skeletons |
| Error State | Departments load error panel |
| CTAs | `Create Department`, `Assign Manager`, `Link Shift Templates`, `Review Department Members` |

### 8.5 Invites

| Item | Definition |
| --- | --- |
| Purpose | Workforce onboarding queue and invite lifecycle management |
| Roles | owner, hr |
| Collections | `request_invites`, `business_profile_members`, `departments` |
| Main Components | `InvitesPageContainer`, `InviteCounters`, `InvitesTable`, `InviteStatusChip`, `InviteCreateDialog`, `InviteFilters`, `InviteActionsMenu` |
| Empty State | No invites sent |
| Loading State | Counter and queue skeletons |
| Error State | Invite queue load error with draft preservation |
| CTAs | `Send Invite`, `Resend Invite`, `Expire Invite`, `Review Claimed Members` |

### 8.6 Requests

| Item | Definition |
| --- | --- |
| Purpose | Dedicated scan request workflow page for creating, tracking, filtering, and following up on `scan_requests` |
| Roles | owner, hr, manager |
| Collections | `scan_requests`, `shift_templates`, `business_profile_members`, `departments`, `request_invites`, `wellness_scans` |
| Main Components | `RequestsPageContainer`, `RequestsKpiStrip`, `RequestsFilterBar`, `RequestsTable`, `RequestCreateDialog`, `RequestStatusChip`, `RequestScopeBanner`, `PendingInvitesPanel`, `RequestFollowUpPanel` |
| Empty State | No scan requests found for current scope |
| Loading State | KPI, filter, and table skeletons |
| Error State | Requests workflow error panel with retry |
| CTAs | `Create Requests`, `Resend Requests`, `Open Compliance`, `Open Invites`, `Review Overdue Requests` |

### 8.7 Compliance

| Item | Definition |
| --- | --- |
| Purpose | Shift completion, readiness evidence, and consent coverage workspace |
| Roles | owner, hr, manager |
| Collections | `shift_templates`, `scan_requests`, `wellness_scans`, `scan_results`, `consent_logs`, `departments`, `business_profile_members` |
| Main Components | `CompliancePageContainer`, `ComplianceKpiStrip`, `ShiftTemplateCoverageTable`, `CompletionTrendChart`, `ConsentCoverageWidget`, `DepartmentComplianceTable`, `WorkerComplianceTable`, `ReadinessDistributionPanel` |
| Empty State | No shift templates or scan requests for current scope |
| Loading State | Table and chart skeletons |
| Error State | Compliance load error with scope hint |
| CTAs | `Create Shift Template`, `Open Requests`, `Review Overdue Requests`, `Export Compliance Report` |

### 8.8 Alerts

| Item | Definition |
| --- | --- |
| Purpose | Operational risk queue and follow-up workflow |
| Roles | owner, hr, manager |
| Collections | `alerts`, `scan_results`, `wellness_scans`, `scan_requests`, `business_profile_members`, `departments`, `notifications` |
| Main Components | `AlertsPageContainer`, `AlertsKpiStrip`, `AlertsFilterBar`, `AlertsTableOrQueue`, `AlertStatusChip`, `AlertActionTypeChip`, `AlertDetailDrawer`, `AlertAssignmentPanel`, `AlertTimelinePanel` |
| Status Handling | use raw `alerts.status` values from backend only |
| Action Handling | use raw `alerts.action_type` values from backend only |
| Empty State | No alerts in scope |
| Loading State | Queue, detail, and summary skeletons |
| Error State | Alerts load error with scope guidance |
| CTAs | `Open Alert`, `Assign Follow-Up`, `Update Status`, `Open Member Record` |

### 8.9 Activity

| Item | Definition |
| --- | --- |
| Purpose | Company audit trail for operational events |
| Roles | owner, hr |
| Collections | `activity_events`, `business_profile_members`, `departments` |
| Main Components | `ActivityPageContainer`, `ActivityFilterBar`, `ActivityTable`, `ActivityEventTypeChip`, `ActivityDetailDrawer`, `ActivityVolumeChart` |
| Empty State | No activity recorded yet |
| Loading State | Feed and chart skeletons |
| Error State | Activity load error |
| CTAs | `Filter Activity`, `Open Related Record`, `Export Activity` |

### 8.10 Reports

| Item | Definition |
| --- | --- |
| Purpose | Export job history and report generation workflow |
| Roles | owner, hr |
| Collections | `reports_exports`, `activity_events`, `scan_requests`, `wellness_scans`, `alerts`, `departments` |
| Main Components | `ReportsPageContainer`, `ReportsExportBuilder`, `ReportsJobsTable`, `ReportStatusChip`, `ReportScopeSelector`, `ReportFormatSelector`, `ReportDownloadCell` |
| Empty State | No report exports yet |
| Loading State | Builder and table skeletons |
| Error State | Reports load error with failed-job retry row state |
| CTAs | `Create Export`, `Download Report`, `Retry Failed Export`, `Open Compliance Scope` |

### 8.11 Notifications Panel

| Item | Definition |
| --- | --- |
| Purpose | Global shell element for in-app operational updates |
| Roles | owner, hr, manager |
| Collections | `notifications`, `alerts`, `scan_requests`, `request_invites`, `reports_exports` |
| Main Components | `NotificationBellButton`, `NotificationsPanel`, `NotificationList`, `NotificationRow`, `NotificationFilterTabs`, `UnreadBadge` |
| Empty State | No notifications for active company |
| Loading State | Badge and list skeletons |
| Error State | Non-blocking notification load error |
| CTAs | `Mark All Read`, `Open Alert`, `Open Request`, `Open Invite`, `View Report` |

### 8.12 Settings

| Item | Definition |
| --- | --- |
| Purpose | Lean first-release workspace settings page |
| Roles | owner, hr |
| Collections | `business_profiles`, `shift_templates`, `push_subscriptions` |
| Scope | Keep intentionally lean; do not build super-admin tooling |
| Main Components | `SettingsPageContainer`, `WorkspacePreferencesCard`, `ShiftDefaultsCard`, `NotificationDeliveryCard`, `PushSubscriptionsSummaryCard` |
| Empty State | Using default operational settings |
| Loading State | Small form and toggle skeletons |
| Error State | Settings load or save error with preserved draft |
| CTAs | `Save Settings`, `Update Notification Rules`, `Configure Shift Defaults` |

## 9. Component Breakdown Per Page

| Page | Container | Primary Presentational Components |
| --- | --- | --- |
| Dashboard | `DashboardPageContainer` | `ReadinessSummaryCards`, `ShiftCoverageWidget`, `ReadinessDistributionChart`, `OpenAlertsWidget`, `PendingRequestsWidget` |
| Company | `CompanyPageContainer` | `CompanyProfileCard`, `CompanyMetadataPanel`, `CompanyLimitsCard`, `CompanyLocaleCard` |
| Members | `MembersPageContainer` | `MembersFilterBar`, `MembersTable`, `MemberDetailDrawer` |
| Departments | `DepartmentsPageContainer` | `DepartmentsGrid`, `DepartmentDetailPanel`, `DepartmentFormDialog` |
| Invites | `InvitesPageContainer` | `InviteCounters`, `InvitesTable`, `InviteCreateDialog` |
| Requests | `RequestsPageContainer` | `RequestsKpiStrip`, `RequestsFilterBar`, `RequestsTable`, `RequestCreateDialog` |
| Compliance | `CompliancePageContainer` | `ComplianceKpiStrip`, `ShiftTemplateCoverageTable`, `CompletionTrendChart`, `WorkerComplianceTable` |
| Alerts | `AlertsPageContainer` | `AlertsKpiStrip`, `AlertsFilterBar`, `AlertsQueue`, `AlertDetailDrawer` |
| Activity | `ActivityPageContainer` | `ActivityFilterBar`, `ActivityTable`, `ActivityDetailDrawer` |
| Reports | `ReportsPageContainer` | `ReportsExportBuilder`, `ReportsJobsTable` |
| Settings | `SettingsPageContainer` | `WorkspacePreferencesCard`, `ShiftDefaultsCard`, `NotificationDeliveryCard` |
| Notifications | `NotificationsPanelContainer` | `NotificationBellButton`, `NotificationsPanel`, `NotificationList` |

## 10. Shared Reusable UI Components

- `ScopeBannerComponent`
- `PageToolbarComponent`
- `KpiCardComponent`
- `KpiStripComponent`
- `StatusChipComponent`
- `RoleChipComponent`
- `DepartmentChipComponent`
- `FilterBarComponent`
- `DateRangeFilterComponent`
- `EntityTableComponent`
- `TableEmptyStateComponent`
- `TableLoadingStateComponent`
- `ErrorPanelComponent`
- `SlideOverDrawerComponent`
- `ConfirmActionDialogComponent`
- `InlineMetricsCardComponent`
- `SectionHeaderComponent`
- `ExportStatusChipComponent`
- `NotificationBadgeComponent`

## 11. Shell / Sidebar / Topbar Requirements

### Shell Requirements

- Desktop shell with persistent sidebar and top bar
- Route outlet for dashboard pages
- Shared scope context injection
- Non-blocking notification polling

### Sidebar Requirements

- Role-aware navigation driven by route config
- Sections:
  - Overview
  - Organization
  - Operations
  - Administration
- Requests must be a first-class sidebar page under Operations
- Show active company and department scope

### Top Bar Requirements

- Page title
- Subtitle / purpose hint
- Company switcher
- Active department indicator
- Role indicator
- Notification bell
- User profile menu

## 12. Guard Requirements

### Shell Guard

- Require authenticated session
- Require `active_business_profile`
- Block `employee` from the admin shell

### Page Guard

- Validate page access against role matrix
- For manager pages, require `active_department`
- Redirect invalid department-scoped managers to Company or Members context setup

### Data Guard / Resolver Pattern

- Use route resolvers only for low-cost context data
- Keep large tables and dashboards inside feature containers with service-driven loading

## 13. Implementation Order

### Phase 1: Shell and Context

1. Shell layout, sidebar, top bar, company switcher, notifications bell
2. `BusinessContextService`
3. Role and scope guards
4. Shared UI primitives

### Phase 2: Core Operational Pages

5. Dashboard
6. Requests
7. Compliance
8. Alerts

### Phase 3: Organization Pages

9. Company
10. Members
11. Departments
12. Invites

### Phase 4: Oversight Pages

13. Activity
14. Reports
15. Notifications panel completion
16. Lean Settings

## 14. Page Build Priority Rationale

- `Dashboard`, `Requests`, `Compliance`, and `Alerts` deliver the core owner, HR, and manager operations workflow.
- `Company`, `Members`, `Departments`, and `Invites` complete workforce administration.
- `Activity`, `Reports`, and `Settings` depend on core workflow data and should follow once the operational loop is stable.

## 15. First-Pass Angular Directory Layout

```text
src/app/
|- core/
|  |- api/
|  |- auth/
|  `- context/
|- shell/
|  |- layout/
|  |- topbar/
|  |- sidebar/
|  `- notifications/
|- shared/
|  |- ui/
|  |- tables/
|  |- filters/
|  `- state/
`- features/
   |- dashboard/
   |- company/
   |- members/
   |- departments/
   |- invites/
   |- requests/
   |- compliance/
   |- alerts/
   |- activity/
   |- reports/
   `- settings/
```

## 16. Developer Notes

- Keep `Requests` independent from `Compliance` and `Alerts`. It is a real page and module.
- Keep `Settings` intentionally lean in v1.
- Keep `Company` as the account control page with company metadata, not billing checkout.
- Keep alert workflow terms backend-native by using `alerts.status` and `alerts.action_type` directly.
- Do not introduce employee-facing admin routes.
