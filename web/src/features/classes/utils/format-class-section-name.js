// (ACR-002) Presentation-only combined name — Class "F1" + Section "A" =>
// "F1A". Never persisted, never sent to the backend, never parsed back apart
// to derive business meaning (Student-Management.md Business Rules #18-#19).
export function formatClassSectionName(className, sectionName) {
  if (!sectionName) {
    return className;
  }
  return `${className}${sectionName}`;
}
