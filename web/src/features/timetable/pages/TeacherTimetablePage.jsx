import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card } from '../../../shared/components';
import { TimetableGrid } from '../components/TimetableGrid';
import { sortDays } from '../utils/formatting';
import * as timetableService from '../services/timetable.service';
import * as teachersService from '../../teachers/services/teachers.service';
import * as scheduleService from '../../school-schedule/services/school-schedule.service';

// Read-only — a derived projection of the same Lessons the Master Timetable
// itself edits (Business Rule #13). One Teacher only — same layout as the
// Class Timetable.
export function TeacherTimetablePage() {
  const { teacherId } = useParams();
  const [searchParams] = useSearchParams();
  const [lessons, setLessons] = React.useState([]);
  const [days, setDays] = React.useState([]);
  const [teacherName, setTeacherName] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [view, teacher, calendar] = await Promise.all([
          timetableService.getTeacherTimetable(teacherId),
          teachersService.getTeacher(teacherId),
          scheduleService.getSchoolCalendar(),
        ]);
        setLessons(view);
        setTeacherName(teacher.fullName);
        setDays(sortDays(calendar.workingDays));
      } finally {
        setLoading(false);
      }
    })();
  }, [teacherId]);

  // Reached from the Master Timetable's own Print picker choosing "Teacher"
  // — auto-triggers print once this page's own data has loaded.
  React.useEffect(() => {
    if (!loading && searchParams.get('autoprint') === '1') {
      window.print();
    }
  }, [loading, searchParams]);

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between no-print">
        <div>
          <Link to="/timetable" className="mb-1 block text-sm text-teal-600 hover:underline dark:text-teal-400">
            ← Back to Master Timetable
          </Link>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Teacher Timetable — {teacherName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Read-only.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => timetableService.downloadTeacherTimetablePdf(teacherId)}>
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="print-area">
        <Card>
          {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p> : <TimetableGrid lessons={lessons} days={days} />}
        </Card>
      </div>
    </div>
  );
}
