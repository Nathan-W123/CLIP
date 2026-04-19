export type {
  ProjectType,
  ProjectSyncStatus,
  ProjectRecencyBucketId,
  StepStatus,
  StepEntry,
  ChecklistStep,
  ActivityEntry,
  MockProject,
  MockTemplate,
  ContentBlock,
  ProjectSection,
  ProjectPageContent,
  ProjectRecencyGroup,
  HistoryEntry,
} from './types';

export {
  MOCK_PROJECTS,
  coralReefHealth,
  createMockProject,
  dolphinObservations,
  findMockProjectById,
  getMockProjects,
  recordMockCapture,
  waterTesting,
} from './projects';
export { MOCK_TEMPLATES } from './templates';
export { MOCK_HISTORY, findProjectContent } from './projectContent';
export {
  appendTranscriptionNote,
  getVoiceCaptureSection,
} from './transcriptionNotes';
export {
  formatProjectSubtitle,
  formatStepProgress,
  formatStepHeader,
  getProjectTypeLabel,
  groupProjectsByLastUsed,
  sortProjectsByLastUsed,
  splitProjectsByRecency,
  findProjectById,
} from './helpers';
