/**
 * Label sheet templates shipped with tScore (presets/label-templates/, ADR 0008), checked
 * against their schema when loaded.
 */
import l7651 from '../../../../presets/label-templates/L7651.json';
import type { LabelTemplate } from '../generated/label-template.js';
import { validateLabelTemplateSchema } from '../generated/validators.js';
import { checkSchema } from '../validation.js';

export type { LabelTemplate } from '../generated/label-template.js';

/** Check a template against its schema and that its labels fit on the page. */
export function checkLabelTemplate(data: unknown): LabelTemplate {
  const r = checkSchema<LabelTemplate>(validateLabelTemplateSchema, data);
  if (!r.ok) {
    throw new Error(
      `Label template is not valid: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
  }
  const t = r.value;
  const right = t.margin.left_mm + (t.columns - 1) * t.pitch.across_mm + t.label.width_mm;
  const bottom = t.margin.top_mm + (t.rows - 1) * t.pitch.down_mm + t.label.height_mm;
  if (right > t.page.width_mm + 0.01 || bottom > t.page.height_mm + 0.01) {
    throw new Error(`Label template ${t.id}: the labels run off the page.`);
  }
  if (t.pitch.across_mm < t.label.width_mm || t.pitch.down_mm < t.label.height_mm) {
    throw new Error(`Label template ${t.id}: the labels overlap.`);
  }
  return t;
}

/** Built-in templates; the first is the default. */
export const LABEL_TEMPLATES: readonly LabelTemplate[] = [l7651].map(checkLabelTemplate);

export const DEFAULT_LABEL_TEMPLATE = 'L7651';

/** The template with this id, or the default when it's unknown or not set. */
export function labelTemplate(id: string | undefined): LabelTemplate {
  const found = LABEL_TEMPLATES.find((t) => t.id === id) ?? LABEL_TEMPLATES[0];
  if (!found) throw new Error('No label templates are installed.');
  return found;
}
