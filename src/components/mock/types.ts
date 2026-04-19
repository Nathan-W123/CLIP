// Frontend-only types for the Clip mock data layer.
// These are UI-facing and not tied to any backend schema or SQLite contract.

export type ProjectType = 'checklist' | 'data_collection' | 'notes';

export type ProjectSyncStatus = 'synced' | 'pending' | 'draft' | 'active';

export type StepStatus = 'completed' | 'active' | 'pending';

export type ProjectRecencyBucketId =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'a_while_ago';

// A key-value pair rendered as "Key: Value" inside a step body.
// Empty value renders the key as a standalone label line.
export interface StepEntry {
  key: string;
  value: string;
}

export interface ChecklistStep {
  id: string;
  order: number;
  title: string;
  status: StepStatus;
  completedAt?: string;   // display string, e.g. "8:49 AM"
  body?: string;          // free-form paragraph text
  entries?: StepEntry[];  // structured field list rendered below body
}

// Compact activity line shown inline on the home card, e.g. "#4 completed: …"
export interface ActivityEntry {
  id: string;
  label: string;
}

export interface MockProject {
  id: string;
  title: string;
  type: ProjectType;
  syncStatus: ProjectSyncStatus;
  // ISO timestamp used for sorting/grouping by the last recording session.
  lastUsedAt: string;
  // Checklist progress — undefined for non-checklist types
  currentStep?: number;
  totalSteps?: number;
  isCompleted?: boolean;
  // Display timestamps — pre-formatted for UI, no date math needed
  updatedAt: string;  // e.g. "12m ago", "3 weeks ago"
  date: string;       // e.g. "4/18", "3/21"
  // Home screen inline preview (2 most recent activity lines)
  recentActivity?: ActivityEntry[];
  // Full step data for detail screen
  steps?: ChecklistStep[];
  // Short description for data_collection / notes projects
  description?: string;
}

export interface ProjectRecencyGroup {
  id: ProjectRecencyBucketId;
  label: string;
  projects: MockProject[];
}

export interface MockTemplate {
  id: string;
  name: ProjectType;          // used as the display label
  label: string;              // human-readable: "Checklist", "Data Collection", "Notes"
  previewDescription: string; // one-liner shown under the tile
}

// ─── Project notes-page content types ────────────────────────────────────────
// These power the generic project workspace scaffold.
// Each ContentBlock is a discriminated union — add new variants as the app grows.

export type ContentBlock =
  | { type: 'text';       body: string }
  | { type: 'note';       timestamp: string; body: string }
  | { type: 'progress';   current: number; total: number; label?: string }
  | { type: 'entry-list'; entries: Array<{ id: string; label: string; done: boolean }> }
  | { type: 'fields';     fields: Array<{ label: string; value: string }> };

export interface ProjectSection {
  id: string;
  title: string;
  blocks: ContentBlock[];
}

export interface ProjectPageContent {
  projectId: string;
  overviewText?: string;
  sections: ProjectSection[];
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  projectId: string;
  projectTitle: string;
  capturedAt: string;   // pre-formatted display string, e.g. "Today, 9:22 AM"
  summary: string;      // one-line capture summary
  syncStatus: ProjectSyncStatus;
}
