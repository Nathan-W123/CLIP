/**
 * In-memory voice transcription entries keyed by project.
 * Shown as `note`-type blocks under "Voice captures" on the project screen.
 */
import type { ContentBlock, ProjectSection } from './types';

const blocksByProject = new Map<string, ContentBlock[]>();

function nowTimestamp(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Prepend newest transcription so it appears at the top of the list. */
export function appendTranscriptionNote(projectId: string, body: string): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  const block: ContentBlock = {
    type: 'note',
    timestamp: nowTimestamp(),
    body: trimmed,
  };
  const list = blocksByProject.get(projectId) ?? [];
  blocksByProject.set(projectId, [block, ...list]);
}

export function getVoiceCaptureSection(projectId: string): ProjectSection | null {
  const blocks = blocksByProject.get(projectId);
  if (!blocks?.length) return null;
  return {
    id: 'voice-captures',
    title: 'Voice captures',
    blocks,
  };
}
