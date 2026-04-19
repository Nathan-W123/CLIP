import type { MockTemplate } from './types';

// Templates shown in the "Start a new project" horizontal scroll row.
// These are UI-only tiles — no backend wiring.
export const MOCK_TEMPLATES: MockTemplate[] = [
  {
    id: 'tmpl-checklist',
    name: 'checklist',
    label: 'Checklist',
    previewDescription: 'Step-by-step voice-guided workflow',
  },
  {
    id: 'tmpl-data-collection',
    name: 'data_collection',
    label: 'Data Collection',
    previewDescription: 'Capture structured field records',
  },
  {
    id: 'tmpl-notes',
    name: 'notes',
    label: 'Notes',
    previewDescription: 'Free-form voice notes and observations',
  },
];
