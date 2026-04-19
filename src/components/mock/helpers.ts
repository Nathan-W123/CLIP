import type {
  MockProject,
  ProjectRecencyBucketId,
  ProjectRecencyGroup,
  ProjectType,
} from './types';

const TYPE_LABEL: Record<ProjectType, string> = {
  checklist: 'Checklist',
  data_collection: 'Data Collection',
  notes: 'Notes',
};

const RECENCY_LABEL: Record<ProjectRecencyBucketId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  a_while_ago: 'A while ago',
};

const RECENCY_ORDER: ProjectRecencyBucketId[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'a_while_ago',
];

export function getProjectTypeLabel(type: ProjectType): string {
  return TYPE_LABEL[type];
}

// Formats the subtitle line shown under a project title on the home screen.
export function formatProjectSubtitle(project: MockProject): string {
  const parts: string[] = [getProjectTypeLabel(project.type)];

  if (project.type === 'checklist') {
    if (project.isCompleted) {
      parts.push('Completed');
    } else if (project.currentStep !== undefined && project.totalSteps !== undefined) {
      parts.push(`Step ${project.currentStep} of ${project.totalSteps}`);
    }
  }

  parts.push(`Updated ${project.updatedAt}`);
  parts.push(project.date);

  return parts.join(' · ');
}

export function sortProjectsByLastUsed(projects: MockProject[]): MockProject[] {
  return [...projects].sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

export function groupProjectsByLastUsed(
  projects: MockProject[],
  now = new Date(),
): ProjectRecencyGroup[] {
  const grouped = new Map<ProjectRecencyBucketId, MockProject[]>(
    RECENCY_ORDER.map(id => [id, []]),
  );

  sortProjectsByLastUsed(projects).forEach(project => {
    const bucket = getRecencyBucket(project.lastUsedAt, now);
    grouped.get(bucket)?.push(project);
  });

  return RECENCY_ORDER
    .map(id => ({
      id,
      label: RECENCY_LABEL[id],
      projects: grouped.get(id) ?? [],
    }))
    .filter(group => group.projects.length > 0);
}

// Returns the step progress label shown on the detail screen header.
export function formatStepProgress(project: MockProject): string | null {
  if (
    project.type !== 'checklist' ||
    project.currentStep === undefined ||
    project.totalSteps === undefined
  ) {
    return null;
  }
  if (project.isCompleted) return 'Completed';
  return `Step ${project.currentStep} of ${project.totalSteps}`;
}

// Returns the step detail header line shown in the detail view.
export function formatStepHeader(
  order: number,
  title: string,
  completedAt?: string,
): string {
  const parts = [`${order}. ${title}`, 'Completed'];
  if (completedAt) parts.push(completedAt);
  return parts.join(' · ');
}

// Legacy split retained for older screens/tests that still import it.
export function splitProjectsByRecency(projects: MockProject[]): {
  today: MockProject[];
  recent: MockProject[];
} {
  const today = projects.filter(
    p => p.syncStatus === 'active' || p.syncStatus === 'pending',
  );
  const recent = projects.filter(
    p => p.syncStatus === 'synced' || p.syncStatus === 'draft',
  );
  return { today, recent };
}

// Finds a project by id. Returns undefined if not found.
export function findProjectById(
  projects: MockProject[],
  id: string,
): MockProject | undefined {
  return projects.find(p => p.id === id);
}

function getRecencyBucket(lastUsedAt: string, now: Date): ProjectRecencyBucketId {
  const lastUsed = new Date(lastUsedAt);
  const daysAgo = getDayDifference(now, lastUsed);

  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 7) return 'this_week';
  if (
    lastUsed.getFullYear() === now.getFullYear() &&
    lastUsed.getMonth() === now.getMonth()
  ) {
    return 'this_month';
  }
  return 'a_while_ago';
}

function getDayDifference(now: Date, then: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.floor((today.getTime() - thenDay.getTime()) / 86_400_000);
}
