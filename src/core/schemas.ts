// Shared types for templates, captures, and validation — kept small for Expo bundle.

export interface FieldDefinition {
  key: string;
  label: string;
  /** When set, the parser can ask the LM to use the right JSON type (number vs string). */
  valueType?: 'text' | 'integer' | 'real' | 'boolean';
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
  /**
   * When set, equals `MasterSchema.supabaseTable` / schema id — row syncs to that Supabase master table.
   * When null, row syncs to the legacy `captures` table.
   */
  masterTable?: string | null;
}
