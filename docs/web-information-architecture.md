# Wellar AI Web Information Architecture

## Public Route Map

| Path | Page | Purpose |
| --- | --- | --- |
| `/` | Home / Landing | Product positioning and primary entry point |
| `/product` | Product | Explain mobile scan plus web control-center workflow |
| `/industries` | Industries | Industry-specific positioning and use cases |
| `/pricing` | Pricing | Commercial packaging and purchase framing |
| `/contact` | Request Demo / Contact | Demo request, rollout conversation, support contact |
| `/request-demo` | Request Demo alias | Redirects to `/contact` |
| `/login` | Login | Authentication entry for web dashboard |
| `/download-app` | Download App | Mobile app acquisition for scan completion |

## Authenticated Route Map

All authenticated routes require:

- valid session
- `active_business_profile`
- non-employee `active_member_role`

Manager-only department-scoped routes also require:

- `active_department`

| Path | Page | Primary Scope | Roles |
| --- | --- | --- | --- |
| `/dashboard` | Dashboard | Company or department summary | owner, hr, manager |
| `/company` | Company | Company profile and account control context | owner, hr |
| `/members` | Members | Company roster or manager department team | owner, hr, manager |
| `/departments` | Departments | Company department model | owner, hr |
| `/invites` | Invites | Workforce onboarding | owner, hr |
| `/requests` | Requests | Scan request workflow | owner, hr, manager |
| `/compliance` | Compliance | Completion, consent, readiness evidence | owner, hr, manager |
| `/alerts` | Alerts | Risk workflow and follow-up | owner, hr, manager |
| `/activity` | Activity | Company-wide operational event stream | owner, hr |
| `/reports` | Reports | Export jobs and reporting views | owner, hr |
| `/settings` | Settings | Lean workspace configuration | owner, hr |

### Utility Routes

| Path | Purpose | Roles |
| --- | --- | --- |
| `/profile` | User profile menu target | owner, hr, manager |
| `/business-center` | Compatibility redirect to `/company` | owner, hr |
| `/history` | Compatibility redirect to `/compliance` | owner, hr, manager |

## Sidebar Structure

### Overview

- Dashboard

### Organization

- Company
- Members
- Departments
- Invites

### Operations

- Requests
- Compliance
- Alerts
- Activity
- Reports

### Administration

- Settings

## Role-To-Page Matrix

| Page | owner | hr | manager | employee |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes | Yes, own department | No |
| Company | Yes | Yes | No | No |
| Members | Yes | Yes | Yes, own department | No |
| Departments | Yes | Yes | No | No |
| Invites | Yes | Yes | No | No |
| Requests | Yes | Yes | Yes, own department | No |
| Compliance | Yes | Yes | Yes, own department | No |
| Alerts | Yes | Yes | Yes, own department | No |
| Activity | Yes | Yes | No | No |
| Reports | Yes | Yes | No | No |
| Settings | Yes | Yes | No | No |
| Raw media access | Yes | No | No | No |

## Guard Rules

### Shell Guard

- Reject unauthenticated access to dashboard routes
- Reject access when `active_business_profile` is missing
- Reject employee access to the admin shell

### Page Guard

- Resolve the route definition by page id
- Check `active_member_role` against allowed roles
- Check `active_department` when manager routes are department-scoped
- Redirect denied users to `/dashboard`, `/company`, or `/download-app` depending on failure reason

## High-Level Component Tree

```text
App
|- PublicLayout
|  |- HomeLanding
|  |- MarketingPage (Product / Industries / Pricing)
|  |- ContactPage
|  |- Login
|  `- DownloadApp
`- LayoutComponent
   |- HeaderComponent
   |  |- PageTitle
   |  |- CompanySwitcher
   |  |- NotificationBell
   |  `- UserProfileMenu
   |- SidebarComponent
   |  |- OverviewNav
   |  |- OrganizationNav
   |  |- OperationsNav
   |  `- AdministrationNav
   `- RouterOutlet
      |- DashboardPage
      |- CompanyPage
      |- MembersPage
      |- DepartmentsPage
      |- InvitesPage
      |- RequestsPage
      |- CompliancePage
      |- AlertsPage
      |- ActivityPage
      |- ReportsPage
      |- SettingsPage
      `- ProfilePage
```
