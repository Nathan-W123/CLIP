// Shared types for templates, captures, and validation — kept small for Expo bundle.

export interface FieldDefinition {
  key: string;
  label: string;
}

export type Template =
  | { id: string; name: string; type: 'checklist' }
  | { id: string; name: string; type: 'notes' }
  | {
      id: string;
      name: string;
      type: 'database_entry';
      schemaDefinition: FieldDefinition[];
    };

export interface ClipRecord {
  id: string;
  templateId: string;
  templateName: string;
  payload: unknown;
  rawTranscript: string;
  confidenceScore: number;
  validated: boolean;
  synced: boolean;
  capturedAt: string;
}
