// Frontend-only project workspace content.
// Drives the generic ProjectScreen scaffold — swap in real data later.

import type { ProjectPageContent, HistoryEntry } from './types';

// ─── Coral reef health ────────────────────────────────────────────────────────

const coralReefContent: ProjectPageContent = {
  projectId: 'proj-coral-reef',
  overviewText:
    'North Reef transect marine survey. Monitoring coral coverage, water chemistry, and biodiversity along the northeast basin. 4 of 7 steps completed today.',
  sections: [
    {
      id: 'progress',
      title: 'Progress',
      blocks: [
        { type: 'progress', current: 4, total: 7, label: 'checklist steps' },
      ],
    },
    {
      id: 'in-progress',
      title: 'In progress',
      blocks: [
        {
          type: 'entry-list',
          entries: [
            { id: 'ip-5', label: 'Coral coverage survey — Transect A', done: false },
          ],
        },
      ],
    },
    {
      id: 'recent-notes',
      title: 'Recent notes',
      blocks: [
        {
          type: 'note',
          timestamp: '9:22 AM',
          body: 'Northeast basin pH: 8.1, salinity 35 ppt. Probe calibrated and deployed at marker.',
        },
        {
          type: 'note',
          timestamp: '9:05 AM',
          body: 'Baseline water conditions: temp 26.4°C, visibility 8m, current low. No unusual turbidity observed.',
        },
        {
          type: 'note',
          timestamp: '8:49 AM',
          body: 'All field equipment verified before survey start. Camera, temperature probe, slate, and sample bags ready.',
        },
        {
          type: 'note',
          timestamp: '8:42 AM',
          body: 'Arrived at North Reef transect marker. GPS location verified. Survey area matched planned route.',
        },
      ],
    },
    {
      id: 'completed',
      title: 'Completed',
      blocks: [
        {
          type: 'entry-list',
          entries: [
            { id: 'c-4', label: 'Northeast basin pH recorded', done: true },
            { id: 'c-3', label: 'Baseline water conditions recorded', done: true },
            { id: 'c-2', label: 'Equipment check', done: true },
            { id: 'c-1', label: 'Arrive at survey site', done: true },
          ],
        },
      ],
    },
    {
      id: 'remaining',
      title: 'Remaining',
      blocks: [
        {
          type: 'entry-list',
          entries: [
            { id: 'r-6', label: 'Fish species count', done: false },
            { id: 'r-7', label: 'Wrap-up and debrief', done: false },
          ],
        },
      ],
    },
  ],
};

// ─── Dolphin Observations ─────────────────────────────────────────────────────

const dolphinObsContent: ProjectPageContent = {
  projectId: 'proj-dolphin-obs',
  overviewText:
    'Behavioral observation log tracking pod movement and activity patterns around the north reef area.',
  sections: [
    {
      id: 'recent-notes',
      title: 'Recent notes',
      blocks: [
        {
          type: 'note',
          timestamp: '3/21 · 2:15 PM',
          body: 'Pod of 7 spotted near buoy 12. Two juveniles observed. Heading northwest.',
        },
        {
          type: 'note',
          timestamp: '3/21 · 11:30 AM',
          body: 'Morning survey complete. No dolphin activity in southeast quadrant.',
        },
      ],
    },
    {
      id: 'completed',
      title: 'Completed',
      blocks: [
        {
          type: 'entry-list',
          entries: [
            { id: 'do-3', label: 'Afternoon pod count submitted', done: true },
            { id: 'do-2', label: 'Morning sweep logged', done: true },
            { id: 'do-1', label: 'Survey equipment checked', done: true },
          ],
        },
      ],
    },
  ],
};

// ─── Water testing ────────────────────────────────────────────────────────────

const waterTestingContent: ProjectPageContent = {
  projectId: 'proj-water-testing',
  overviewText: 'Weekly water quality compliance check. All 5 checklist steps completed and data submitted.',
  sections: [
    {
      id: 'completed',
      title: 'Completed',
      blocks: [
        {
          type: 'entry-list',
          entries: [
            { id: 'wt-5', label: 'Final compliance sign-off', done: true },
            { id: 'wt-4', label: 'Chemical analysis submitted', done: true },
            { id: 'wt-3', label: 'Sample collection complete', done: true },
            { id: 'wt-2', label: 'Equipment calibrated', done: true },
            { id: 'wt-1', label: 'Site access confirmed', done: true },
          ],
        },
      ],
    },
    {
      id: 'notes',
      title: 'Notes',
      blocks: [
        {
          type: 'note',
          timestamp: '3/21 · 4:00 PM',
          body: 'All tests within compliance range. No anomalies detected. Results filed.',
        },
      ],
    },
  ],
};

// ─── Registry + helper ────────────────────────────────────────────────────────

const PROJECT_PAGE_CONTENT: ProjectPageContent[] = [
  coralReefContent,
  dolphinObsContent,
  waterTestingContent,
];

export function findProjectContent(projectId: string): ProjectPageContent | undefined {
  return PROJECT_PAGE_CONTENT.find(c => c.projectId === projectId);
}

// ─── History entries ──────────────────────────────────────────────────────────

export const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: 'hist-004',
    projectId: 'proj-coral-reef',
    projectTitle: 'Coral reef health',
    capturedAt: 'Today · 9:22 AM',
    summary: 'Northeast basin pH: 8.1, salinity 35 ppt',
    syncStatus: 'pending',
  },
  {
    id: 'hist-003',
    projectId: 'proj-coral-reef',
    projectTitle: 'Coral reef health',
    capturedAt: 'Today · 9:05 AM',
    summary: 'Baseline water: 26.4°C, visibility 8m, low current',
    syncStatus: 'pending',
  },
  {
    id: 'hist-002',
    projectId: 'proj-coral-reef',
    projectTitle: 'Coral reef health',
    capturedAt: 'Today · 8:49 AM',
    summary: 'Equipment check: camera, probe, slate, sample bags — all ready',
    syncStatus: 'pending',
  },
  {
    id: 'hist-001',
    projectId: 'proj-coral-reef',
    projectTitle: 'Coral reef health',
    capturedAt: 'Today · 8:42 AM',
    summary: 'Arrived at North Reef transect marker. GPS verified.',
    syncStatus: 'pending',
  },
  {
    id: 'hist-d-002',
    projectId: 'proj-dolphin-obs',
    projectTitle: 'Dolphin Observations',
    capturedAt: '3/21 · 2:15 PM',
    summary: 'Pod of 7 near buoy 12, two juveniles observed',
    syncStatus: 'synced',
  },
  {
    id: 'hist-d-001',
    projectId: 'proj-dolphin-obs',
    projectTitle: 'Dolphin Observations',
    capturedAt: '3/21 · 11:30 AM',
    summary: 'Morning sweep: no activity in southeast quadrant',
    syncStatus: 'synced',
  },
  {
    id: 'hist-w-001',
    projectId: 'proj-water-testing',
    projectTitle: 'Water testing',
    capturedAt: '3/21 · 4:00 PM',
    summary: 'All tests within compliance range, no anomalies',
    syncStatus: 'synced',
  },
];
