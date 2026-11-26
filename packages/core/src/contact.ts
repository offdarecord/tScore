/**
 * Where people send things to the maintainers (presets/contact.json, issue #108): feature
 * suggestions and shared card profiles. Data, not code, so it can change without touching the
 * code that uses it. tScore never sends anything itself; these only fill in the person's own
 * mail app or browser.
 */
import contact from '../../../presets/contact.json';

export interface Contact {
  /** A tScore-only address (never a personal one). */
  readonly email: string;
  /** The GitHub "New card type" issue form. */
  readonly new_card_type_form: string;
}

/** Check the contact preset: a plain address and an https link to the project's issues. */
export function checkContact(data: unknown): Contact {
  const c = data as Partial<Record<keyof Contact, unknown>> | null;
  if (
    !c ||
    typeof c.email !== 'string' ||
    !/^[^\s@?&#]+@[^\s@?&#]+\.[a-z]{2,}$/i.test(c.email) ||
    typeof c.new_card_type_form !== 'string' ||
    !c.new_card_type_form.startsWith('https://github.com/offdarecord/tScore/issues/new')
  ) {
    throw new Error('presets/contact.json is not valid: it needs an email and an issue form link.');
  }
  return { email: c.email, new_card_type_form: c.new_card_type_form };
}

export const CONTACT: Contact = checkContact(contact);
