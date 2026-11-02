// Display-only helpers — never change what is stored, only how the Master
// Timetable renders it (Business Logic Ownership: the backend's own Class
// name is untouched; Class Management's own screens still show the full name).

// "Grade 8A" -> "G8A"; a name that already looks compact (e.g. "F1A") is
// returned unchanged.
export function compactClassName(name) {
  if (!name) return name;
  return name.replace(/^Grade\s+/i, 'G');
}

// This project's own Somalia Default School Calendar week starts Saturday
// (School Schedule Management's own Business Rule #3) — used to order
// Working Days left-to-right consistently, regardless of the order the
// backend happens to return them in.
export const CANONICAL_DAY_ORDER = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export function sortDays(days) {
  return [...days].sort((a, b) => CANONICAL_DAY_ORDER.indexOf(a) - CANONICAL_DAY_ORDER.indexOf(b));
}

export const DAY_LABELS = {
  SUNDAY: 'Sunday',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
};
