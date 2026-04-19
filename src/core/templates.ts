import type { Template } from './schemas';

const templatesById: Record<string, Template> = {
  'tmpl-checklist': { id: 'tmpl-checklist', name: 'Checklist', type: 'checklist' },
  'tmpl-data-collection': {
    id: 'tmpl-data-collection',
    name: 'Data Collection',
    type: 'database_entry',
    schemaDefinition: [],
  },
  'tmpl-notes': { id: 'tmpl-notes', name: 'Notes', type: 'notes' },
};

export function getTemplateById(id: string | undefined): Template | null {
  if (!id || !(id in templatesById)) return null;
  return templatesById[id];
}
