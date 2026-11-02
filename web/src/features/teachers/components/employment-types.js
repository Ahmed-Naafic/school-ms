// Stored as the plain label string (Teacher.employmentType is a free-form
// String column), so no backend change or migration is needed.
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time'];

// `current` keeps a legacy free-text value selectable (and visible) when
// editing a Teacher saved before this became a fixed list.
export function employmentTypeOptions(current = '') {
  const types = current && !EMPLOYMENT_TYPES.includes(current) ? [...EMPLOYMENT_TYPES, current] : EMPLOYMENT_TYPES;
  return [{ value: '', label: 'Not specified' }, ...types.map((type) => ({ value: type, label: type }))];
}
