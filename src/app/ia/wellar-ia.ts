export type ActiveMemberRole = 'owner' | 'hr' | 'manager' | 'employee';

export type PublicPageId =
  | 'home'
  | 'product'
  | 'industries'
  | 'pricing'
  | 'contact'
  | 'login'
  | 'download-app';

export type WorkspacePageId =
  | 'dashboard'
  | 'workforce'
  | 'company'
  | 'members'
  | 'departments'
  | 'invites'
  | 'compliance'
  | 'alerts'
  | 'activity'
  | 'reports'
  | 'settings'
  | 'requests'
  | 'profile';

export type NavIcon =
  | 'dashboard'
  | 'workforce'
  | 'company'
  | 'members'
  | 'departments'
  | 'invites'
  | 'compliance'
  | 'alerts'
  | 'activity'
  | 'reports'
  | 'settings'
  | 'requests'
  | 'profile';

export type SidebarSectionId = 'overview' | 'organization' | 'operations' | 'admin';

export type SidebarNavGroupId = 'Main' | 'Operations' | 'Intelligence' | 'Admin';

export type SidebarNavIcon =
  | 'dashboard'
  | 'users'
  | 'send'
  | 'shield'
  | 'alert'
  | 'reports'
  | 'company'
  | 'settings';

export type SidebarNavItem = {
  label: string;
  route: string;
  icon: SidebarNavIcon;
  description: string;
  matchRoutes: string[];
  roles: ActiveMemberRole[];
};

export type SidebarNavGroup = {
  group: SidebarNavGroupId;
  items: SidebarNavItem[];
};

export type PublicRouteDefinition = {
  id: PublicPageId;
  path: string;
  label: string;
  title: string;
  description: string;
};

export type WorkspaceRouteDefinition = {
  id: WorkspacePageId;
  path: string;
  label: string;
  title: string;
  description: string;
  icon: NavIcon;
  roles: ActiveMemberRole[];
  sidebar: boolean;
  section?: SidebarSectionId;
  requiresDepartmentForManager?: boolean;
  rawMediaAccess?: 'all' | 'owner-only';
};

export const PUBLIC_ROUTE_MAP: readonly PublicRouteDefinition[] = [
  {
    id: 'home',
    path: '',
    label: 'Home',
    title: 'Wellar AI',
    description: 'Pre-shift readiness and compliance control for operational teams.'
  },
  {
    id: 'product',
    path: 'product',
    label: 'Product',
    title: 'Product',
    description: 'How Wellar AI connects mobile scans with operational decisions in web.'
  },
  {
    id: 'industries',
    path: 'industries',
    label: 'Industries',
    title: 'Industries',
    description: 'Use cases for transport, manufacturing, logistics, and field operations.'
  },
  {
    id: 'pricing',
    path: 'pricing',
    label: 'Pricing',
    title: 'Pricing',
    description: 'Commercial packages for companies running readiness and compliance workflows.'
  },
  {
    id: 'contact',
    path: 'contact',
    label: 'Request Demo',
    title: 'Request Demo',
    description: 'Contact the Wellar team for rollout planning and company onboarding.'
  },
  {
    id: 'login',
    path: 'login',
    label: 'Login',
    title: 'Login',
    description: 'Sign in to the operational control center.'
  },
  {
    id: 'download-app',
    path: 'download-app',
    label: 'Download App',
    title: 'Download App',
    description: 'Install the mobile app employees use for pre-shift scans.'
  }
] as const;

export const WORKSPACE_ROUTE_MAP: readonly WorkspaceRouteDefinition[] = [
  {
    id: 'dashboard',
    path: 'dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    description: "Company-scoped readiness overview for today's operation.",
    icon: 'dashboard',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'overview'
  },
  {
    id: 'workforce',
    path: 'workforce',
    label: 'Workforce',
    title: 'Workforce',
    description: 'Workforce roster, access roles, and readiness participation.',
    icon: 'workforce',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'organization'
  },
  {
    id: 'company',
    path: 'company',
    label: 'Company',
    title: 'Company',
    description: 'Business profile, activation status, and company-level controls.',
    icon: 'company',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'organization'
  },
  {
    id: 'members',
    path: 'members',
    label: 'Workforce',
    title: 'Workforce',
    description: 'Legacy workforce route for compatibility.',
    icon: 'workforce',
    roles: ['owner', 'hr', 'manager'],
    sidebar: false,
    section: 'organization'
  },
  {
    id: 'departments',
    path: 'departments',
    label: 'Departments',
    title: 'Departments',
    description: 'Department structure and access boundaries for company operations.',
    icon: 'departments',
    roles: ['owner', 'hr'],
    sidebar: false,
    section: 'organization'
  },
  {
    id: 'invites',
    path: 'invites',
    label: 'Invites',
    title: 'Invites',
    description: 'Pending access invites and workforce onboarding progress.',
    icon: 'invites',
    roles: ['owner', 'hr'],
    sidebar: false,
    section: 'organization'
  },
  {
    id: 'compliance',
    path: 'compliance',
    label: 'Compliance',
    title: 'Compliance',
    description: 'Pre-shift completion, consent coverage, and export-ready evidence.',
    icon: 'compliance',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'operations'
  },
  {
    id: 'alerts',
    path: 'alerts',
    label: 'Alerts',
    title: 'Alerts',
    description: 'Escalations for High Risk, Elevated Fatigue, and follow-up workflows.',
    icon: 'alerts',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'operations'
  },
  {
    id: 'activity',
    path: 'activity',
    label: 'Activity',
    title: 'Activity',
    description: 'Company activity stream across requests, scans, alerts, and exports.',
    icon: 'activity',
    roles: ['owner', 'hr'],
    sidebar: false,
    section: 'operations'
  },
  {
    id: 'reports',
    path: 'reports',
    label: 'Reports',
    title: 'Reports',
    description: 'Operational reports and export jobs for audits and reviews.',
    icon: 'reports',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'operations'
  },
  {
    id: 'settings',
    path: 'settings',
    label: 'Settings',
    title: 'Settings',
    description: 'Workspace settings, notifications, integrations, API keys, privacy, and security.',
    icon: 'settings',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'admin'
  },
  {
    id: 'requests',
    path: 'scan-requests',
    label: 'Scan Requests',
    title: 'Scan Requests',
    description: 'Scan requests scoped to the active company and department.',
    icon: 'requests',
    roles: ['owner', 'hr', 'manager'],
    sidebar: true,
    section: 'operations'
  },
  {
    id: 'profile',
    path: 'profile',
    label: 'Profile',
    title: 'Profile',
    description: 'Signed-in user profile and session tools.',
    icon: 'profile',
    roles: ['owner', 'hr', 'manager'],
    sidebar: false
  }
] as const;

export const SIDEBAR_NAV: readonly SidebarNavGroup[] = [
  {
    group: 'Main',
    items: [
      {
        label: 'Dashboard',
        route: '/app/dashboard',
        icon: 'dashboard',
        description: 'Open the operational readiness overview for today.',
        matchRoutes: ['/app/dashboard'],
        roles: ['owner', 'hr', 'manager']
      }
    ]
  },
  {
    group: 'Operations',
    items: [
      {
        label: 'Workforce',
        route: '/app/workforce',
        icon: 'users',
        description: 'Manage the workforce roster, roles, and departments.',
        matchRoutes: ['/app/workforce', '/app/members', '/app/departments', '/app/invites'],
        roles: ['owner', 'hr', 'manager']
      },
      {
        label: 'Scan Requests',
        route: '/app/scan-requests',
        icon: 'send',
        description: 'Create and manage readiness scan requests.',
        matchRoutes: ['/app/scan-requests', '/app/requests'],
        roles: ['owner', 'hr', 'manager']
      },
      {
        label: 'Compliance',
        route: '/app/compliance',
        icon: 'shield',
        description: 'Track completion, gaps, and compliance by team.',
        matchRoutes: ['/app/compliance'],
        roles: ['owner', 'hr', 'manager']
      },
      {
        label: 'Alerts',
        route: '/app/alerts',
        icon: 'alert',
        description: 'Review escalations, high-risk states, and follow-up items.',
        matchRoutes: ['/app/alerts'],
        roles: ['owner', 'hr', 'manager']
      }
    ]
  },
  {
    group: 'Intelligence',
    items: [
      {
        label: 'Reports',
        route: '/app/reports',
        icon: 'reports',
        description: 'Review trends, summaries, and exportable executive reports.',
        matchRoutes: ['/app/reports'],
        roles: ['owner', 'hr', 'manager']
      }
    ]
  },
  {
    group: 'Admin',
    items: [
      {
        label: 'Company',
        route: '/app/company',
        icon: 'company',
        description: 'Manage company profile, limits, timezone, and workspace status.',
        matchRoutes: ['/app/company'],
        roles: ['owner', 'hr', 'manager']
      },
      {
        label: 'Settings',
        route: '/app/settings',
        icon: 'settings',
        description: 'Manage workspace settings, integrations, security, and privacy.',
        matchRoutes: ['/app/settings'],
        roles: ['owner', 'hr', 'manager']
      }
    ]
  }
] as const;

export const SIDEBAR_SECTIONS: ReadonlyArray<{ id: SidebarSectionId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'organization', label: 'Organization' },
  { id: 'operations', label: 'Operations' },
  { id: 'admin', label: 'Administration' }
] as const;

export const ROLE_TO_PAGE_MATRIX: Record<ActiveMemberRole, WorkspacePageId[]> = {
  owner: [
    'dashboard',
    'workforce',
    'company',
    'members',
    'departments',
    'invites',
    'compliance',
    'alerts',
    'activity',
    'reports',
    'settings',
    'requests',
    'profile'
  ],
  hr: [
    'dashboard',
    'workforce',
    'company',
    'members',
    'departments',
    'invites',
    'compliance',
    'alerts',
    'activity',
    'reports',
    'settings',
    'requests',
    'profile'
  ],
  manager: [
    'dashboard',
    'workforce',
    'company',
    'members',
    'compliance',
    'alerts',
    'reports',
    'requests',
    'settings',
    'profile'
  ],
  employee: []
};

export function normalizeActiveMemberRole(value: unknown): ActiveMemberRole | null {
  const normalized = (value ?? '').toString().trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'hr' || normalized === 'employee') {
    return normalized;
  }
  if (normalized === 'manager' || normalized === 'manger') {
    return 'manager';
  }
  return null;
}

export function getWorkspaceRouteByPath(path: string): WorkspaceRouteDefinition | undefined {
  return WORKSPACE_ROUTE_MAP.find((item) => item.path === path);
}

export function getWorkspaceRouteByUrlPath(path: string): WorkspaceRouteDefinition | undefined {
  const normalized = path
    .replace(/^\/+/, '')
    .replace(/^app\//, '')
    .split('?')[0]
    .split('#')[0];

  return getWorkspaceRouteByPath(normalized);
}

export function getWorkspaceRouteById(id: WorkspacePageId): WorkspaceRouteDefinition | undefined {
  return WORKSPACE_ROUTE_MAP.find((item) => item.id === id);
}

export function getSidebarNavForRole(role: ActiveMemberRole | null): SidebarNavGroup[] {
  if (!role || role === 'employee') {
    return [];
  }

  return SIDEBAR_NAV.map((group) => ({
    group: group.group,
    items: group.items.filter((item) => item.roles.includes(role))
  })).filter((group) => group.items.length > 0);
}

export function workspaceRouteHref(path: string): string {
  return `/app/${path.replace(/^\/+/, '')}`;
}

export function canAccessWorkspaceRoute(
  page: WorkspaceRouteDefinition | undefined,
  role: ActiveMemberRole | null,
  activeBusinessProfile: string | null,
  activeDepartment: string | null
): { allowed: boolean; reason: string } {
  if (!page) {
    return { allowed: false, reason: 'Unknown page.' };
  }

  if (!activeBusinessProfile) {
    return { allowed: false, reason: 'No active company selected.' };
  }

  if (!role || role === 'employee') {
    return { allowed: false, reason: 'This page is not available for employee accounts.' };
  }

  if (!page.roles.includes(role)) {
    return { allowed: false, reason: 'This page is not available for the active role.' };
  }

  if (role === 'manager' && page.requiresDepartmentForManager && !activeDepartment) {
    return { allowed: false, reason: 'Managers need an active department for this page.' };
  }

  return { allowed: true, reason: '' };
}

export function getSidebarItemsForRole(
  role: ActiveMemberRole | null,
  activeBusinessProfile: string | null,
  activeDepartment: string | null
): WorkspaceRouteDefinition[] {
  return WORKSPACE_ROUTE_MAP.filter((item) => {
    if (!item.sidebar) {
      return false;
    }
    return canAccessWorkspaceRoute(item, role, activeBusinessProfile, activeDepartment).allowed;
  });
}
