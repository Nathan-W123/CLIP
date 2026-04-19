/**
 * Template catalog for capture flows.
 * Templates are seeded into SQLite (`template_schemas`) on migrate; prefer `getTemplateByIdWithDb` when you have `db`.
 */

export { getTemplateById } from './templates';
export { getTemplateByIdWithDb } from '../db/templateSchemas';
