/**
 * "Results brought to you by tScore" (#110): the credit at the foot of every results PDF and the
 * series PDF, and on every live results view. Defined here, once: the logo, the words, the call to
 * action and the link. It is always shown; there is no setting to hide it.
 *
 * The logo is all rights reserved (assets/LICENSE). A modified version of tScore must replace or
 * remove RESULTS_CREDIT_LOGO, and should change the link to its own project.
 */
import { RESULTS_CREDIT_LOGO } from './generated/results-credit.js';
import { english, type Translate } from './words.js';

export { RESULTS_CREDIT_LOGO };

/** Where "Get involved" goes: short and stable, so old PDFs never break. */
export const RESULTS_CREDIT_URL = 'https://github.com/offdarecord/tScore';
/** The logo's text alternative: the name, never translated. */
export const RESULTS_CREDIT_NAME = 'tScore';
/** The link as shown. */
export const RESULTS_CREDIT_LINK_TEXT = 'github.com/offdarecord/tScore';

export interface CreditWords {
  /** Before the logo: "Results brought to you by". */
  readonly by: string;
  /** The call to action, before the link. */
  readonly ask: string;
}

export function creditWords(t: Translate = english): CreditWords {
  return {
    by: t('core.creditBy', 'Results brought to you by'),
    ask: t('core.creditAsk', 'Want tScore for your club or region? Get involved:'),
  };
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Styles for `creditHtml`, for the PDFs' <style>. Small and grey: never competes with the event. */
export const CREDIT_CSS = `
  .credit { margin-top: 10px; break-inside: avoid; break-before: avoid; display: flex; align-items: center; gap: 3mm; color: #555; font-size: 8pt; }
  .credit img { height: 11mm; width: auto; }
  .credit a { color: #555; }`;

/** The credit for a printed page: logo, words and a clickable link. */
export function creditHtml(t: Translate = english): string {
  const words = creditWords(t);
  return `<div class="credit"><span>${escape(words.by)}</span><img src="${RESULTS_CREDIT_LOGO}" alt="${RESULTS_CREDIT_NAME}"><span>${escape(words.ask)} <a href="${RESULTS_CREDIT_URL}">${RESULTS_CREDIT_LINK_TEXT}</a></span></div>`;
}
