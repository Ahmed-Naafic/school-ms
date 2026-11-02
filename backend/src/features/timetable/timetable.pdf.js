// Server-side PDF generation via pdfkit — a new dependency and a new code
// path for this project (Technical Design's Architecture section, flagged
// the same way native TIME columns were flagged when first introduced). This
// module has exactly one job: lay out a grid pdfkit can draw. It never
// queries the database or re-implements any business rule — it calls the
// exact same view-assembly functions the JSON API routes call, per Business
// Rule #17 ("printing/PDF never re-implement Timetable business logic").
const PDFDocument = require('pdfkit');
const service = require('./timetable.service');

const ALL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function cellLabel(lesson) {
  if (!lesson) return '';
  const subject = lesson.subject ? lesson.subject.name : '';
  const teacher = lesson.teacher ? lesson.teacher.fullName : '';
  const cls = lesson.class ? lesson.class.name : '';
  return [subject, teacher, cls].filter(Boolean).join('\n');
}

// Renders one Day x Period grid (Class Timetable and Teacher Timetable both
// share this exact shape — rows = Days, columns = Periods).
function drawDayPeriodGrid(doc, title, lessons) {
  doc.fontSize(16).text(title, { align: 'center' });
  doc.moveDown();

  const periodIds = [...new Set(lessons.map((l) => l.period && l.period.id).filter(Boolean))];
  const periodLabels = new Map();
  for (const lesson of lessons) {
    if (lesson.period) periodLabels.set(lesson.period.id, lesson.period.name);
  }

  const byDayPeriod = new Map();
  for (const lesson of lessons) {
    if (!lesson.period) continue;
    byDayPeriod.set(`${lesson.dayOfWeek}:${lesson.period.id}`, lesson);
  }

  const startX = doc.x;
  const startY = doc.y;
  const dayColWidth = 90;
  const periodColWidth = Math.max(70, Math.min(120, (doc.page.width - 2 * doc.page.margins.left - dayColWidth) / Math.max(periodIds.length, 1)));
  const rowHeight = 50;

  // Header row
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Day', startX, startY, { width: dayColWidth });
  periodIds.forEach((periodId, index) => {
    doc.text(periodLabels.get(periodId) || periodId, startX + dayColWidth + index * periodColWidth, startY, {
      width: periodColWidth,
    });
  });

  doc.font('Helvetica').fontSize(8);
  let rowY = startY + 20;
  for (const day of ALL_DAYS) {
    doc.text(day.slice(0, 3), startX, rowY + 4, { width: dayColWidth });
    periodIds.forEach((periodId, index) => {
      const lesson = byDayPeriod.get(`${day}:${periodId}`);
      doc.text(cellLabel(lesson), startX + dayColWidth + index * periodColWidth, rowY + 4, {
        width: periodColWidth,
      });
    });
    rowY += rowHeight;
  }

  doc.y = rowY + 10;
}

// versionType ('DRAFT' | 'PUBLISHED') is threaded straight through to the
// same view-assembly functions the JSON routes call — Architecture Update
// (Generation-First); defaults to 'DRAFT' for School Admin's own review
// context, matching those functions' own default.
async function generateTimetablePdf(schoolId, viewType, targetId, versionType = 'DRAFT') {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (viewType === 'master') {
    const grouped = await service.getMasterTimetable(schoolId, { versionType });
    if (grouped.length === 0) {
      doc.fontSize(16).text('Master Timetable', { align: 'center' });
      doc.moveDown().fontSize(10).text('No active Lessons scheduled yet.');
    }
    grouped.forEach((group, index) => {
      if (index > 0) doc.addPage();
      const title = `Master Timetable — ${group.class ? group.class.name : 'Unassigned'}`;
      drawDayPeriodGrid(doc, title, group.lessons);
    });
  } else if (viewType === 'class') {
    const lessons = await service.getClassTimetable(schoolId, targetId, { versionType });
    drawDayPeriodGrid(doc, 'Class Timetable', lessons);
  } else if (viewType === 'teacher') {
    const lessons = await service.getTeacherTimetable(schoolId, targetId, { versionType });
    drawDayPeriodGrid(doc, 'Teacher Timetable', lessons);
  }

  doc.end();
  return done;
}

module.exports = { generateTimetablePdf };
