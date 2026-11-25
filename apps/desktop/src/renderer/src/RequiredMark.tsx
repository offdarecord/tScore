/**
 * The red asterisk that marks a box you must fill in, for places with no field label of their
 * own (a table's column heading). Field labels get the same mark from Mantine's `required` prop,
 * which also tells screen readers; this copy is hidden from them for the same reason.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" style={{ color: 'var(--mantine-color-error)' }}>
      *
    </span>
  );
}
