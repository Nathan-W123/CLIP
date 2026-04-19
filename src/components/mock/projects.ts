import type { MockProject, ProjectType } from './types';

type CreatableProjectType = Extract<ProjectType, 'checklist' | 'data_collection'>;

let createdProjectCount = 0;

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function daysAgoIso(days: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Coral Reef Health — active checklist, pending sync, full step detail for the detail screen.
const coralReefHealth: MockProject = {
  id: 'proj-coral-reef',
  title: 'Coral reef health',
  masterSchemaId: 'coral_reef_health',
  type: 'checklist',
  syncStatus: 'pending',
  lastUsedAt: minutesAgoIso(12),
  currentStep: 4,
  totalSteps: 7,
  updatedAt: '12m ago',
  date: '4/18',
  recentActivity: [
    { id: 'act-004', label: '#4 completed: Northeast basin pH recorded' },
    { id: 'act-003', label: '#3 completed: Baseline water conditions recorded' },
  ],
  steps: [
    {
      id: 'step-cr-001',
      order: 1,
      title: 'Arrive at survey site',
      status: 'completed',
      completedAt: '8:42 AM',
      body:
        'Confirmed team arrival at North Reef transect marker. GPS location verified and survey area matched the planned route.',
    },
    {
      id: 'step-cr-002',
      order: 2,
      title: 'Check equipment',
      status: 'completed',
      completedAt: '8:49 AM',
      body: 'All required field tools were verified before survey start.',
      entries: [
        { key: 'Equipment status', value: '' },
        { key: 'Camera', value: 'Ready' },
        { key: 'Temperature probe', value: 'Ready' },
        { key: 'Slate', value: 'Ready' },
        { key: 'Sample bags', value: 'Ready' },
      ],
    },
    {
      id: 'step-cr-003',
      order: 3,
      title: 'Record baseline water conditions',
      status: 'completed',
      completedAt: '9:05 AM',
      body: 'Water temp 26.4°C, visibility 8m, current low. No unusual turbidity observed.',
      entries: [
        { key: 'Temperature', value: '26.4°C' },
        { key: 'Visibility', value: '8m' },
        { key: 'Current', value: 'Low' },
      ],
    },
    {
      id: 'step-cr-004',
      order: 4,
      title: 'Northeast basin pH reading',
      status: 'completed',
      completedAt: '9:22 AM',
      body: 'pH probe calibrated and deployed at northeast basin marker.',
      entries: [
        { key: 'pH', value: '8.1' },
        { key: 'Salinity', value: '35 ppt' },
      ],
    },
    {
      id: 'step-cr-005',
      order: 5,
      title: 'Coral coverage survey — Transect A',
      status: 'active',
    },
    {
      id: 'step-cr-006',
      order: 6,
      title: 'Fish species count',
      status: 'pending',
    },
    {
      id: 'step-cr-007',
      order: 7,
      title: 'Wrap-up and debrief',
      status: 'pending',
    },
  ],
};

// Dolphin Observations — data collection project, synced, no step detail needed.
const dolphinObservations: MockProject = {
  id: 'proj-dolphin-obs',
  title: 'Dolphin Observations',
  masterSchemaId: 'dolphin_observations',
  type: 'data_collection',
  syncStatus: 'synced',
  lastUsedAt: daysAgoIso(21, 14, 15),
  updatedAt: '3 weeks ago',
  date: '3/21',
  description: 'Behavioral observation log — pod tracking',
};

// Water Testing — completed checklist, synced.
const waterTesting: MockProject = {
  id: 'proj-water-testing',
  title: 'Water testing',
  type: 'checklist',
  syncStatus: 'synced',
  lastUsedAt: daysAgoIso(21, 11, 30),
  isCompleted: true,
  currentStep: 5,
  totalSteps: 5,
  updatedAt: '3 weeks ago',
  date: '3/21',
  description: 'Weekly water quality compliance check',
};

// All projects — order determines Today vs Recent grouping via helpers.
export const MOCK_PROJECTS: MockProject[] = [
  coralReefHealth,
  dolphinObservations,
  waterTesting,
];

export function getMockProjects(): MockProject[] {
  return [...MOCK_PROJECTS];
}

export function findMockProjectById(id: string): MockProject | undefined {
  return MOCK_PROJECTS.find(project => project.id === id);
}

export function createMockProject(
  type: CreatableProjectType,
  options?: {
    masterSchemaId?: string;
    title?: string;
    description?: string;
  },
): MockProject {
  createdProjectCount += 1;
  const now = new Date();
  const label = type === 'checklist' ? 'Checklist' : 'Data collection';
  const defaultTitle = `Untitled ${label.toLowerCase()}`;
  const project: MockProject = {
    id: `proj-created-${now.getTime()}-${createdProjectCount}`,
    title: options?.title ?? defaultTitle,
    type,
    syncStatus: 'draft',
    lastUsedAt: now.toISOString(),
    updatedAt: 'just now',
    date: formatShortDate(now),
    description:
      options?.description ??
      (type === 'checklist'
        ? 'New checklist project'
        : 'New data collection project'),
    recentActivity: [],
    ...(options?.masterSchemaId
      ? { masterSchemaId: options.masterSchemaId }
      : {}),
  };

  MOCK_PROJECTS.unshift(project);
  return project;
}

export function recordMockCapture(projectId: string, summary: string): MockProject | undefined {
  const project = findMockProjectById(projectId);
  if (!project) return undefined;

  const now = new Date();
  project.syncStatus = 'pending';
  project.lastUsedAt = now.toISOString();
  project.updatedAt = 'just now';
  project.date = formatShortDate(now);

  const nextStep =
    project.type === 'checklist' && project.currentStep !== undefined
      ? project.currentStep + 1
      : 1;

  if (project.type === 'checklist' && project.currentStep !== undefined) {
    project.currentStep = project.totalSteps
      ? Math.min(nextStep, project.totalSteps)
      : nextStep;
  }

  const label =
    project.type === 'checklist'
      ? `#${nextStep} completed: ${summary}`
      : `Captured: ${summary}`;

  project.recentActivity = [
    { id: `act-${now.getTime()}`, label },
    ...(project.recentActivity ?? []),
  ].slice(0, 3);

  return project;
}

// Named exports for screens that need a specific project by id.
export { coralReefHealth, dolphinObservations, waterTesting };
