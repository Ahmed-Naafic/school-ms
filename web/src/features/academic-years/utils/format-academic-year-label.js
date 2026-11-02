// The label is never stored on the backend (Technical Design Requirement
// #5) — it's derived here, identically to how the service layer derives it
// for the duplicate-label check, from the start/end dates' years only.
export function formatAcademicYearLabel(startDate, endDate) {
  const startYear = new Date(startDate).getUTCFullYear();
  const endYear = new Date(endDate).getUTCFullYear();
  return `${startYear}/${endYear}`;
}
