import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card } from '../../../shared/components';
import { TimetableGrid } from '../components/TimetableGrid';
import { sortDays } from '../utils/formatting';
import * as timetableService from '../services/timetable.service';
import * as classesService from '../../classes/services/classes.service';
import * as scheduleService from '../../school-schedule/services/school-schedule.service';

// Read-only — a derived projection of the same Lessons the Master Timetable
// itself edits (Business Rule #13). One Class only — used by Administrators
// for review and printing.
export function ClassTimetablePage() {
  const { classId } = useParams();
  const [searchParams] = useSearchParams();
  const [lessons, setLessons] = React.useState([]);
  const [days, setDays] = React.useState([]);
  const [className, setClassName] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [view, cls, calendar] = await Promise.all([
          timetableService.getClassTimetable(classId),
          classesService.getClass(classId),
          scheduleService.getSchoolCalendar(),
        ]);
        setLessons(view);
        setClassName(cls.name);
        setDays(sortDays(calendar.workingDays));
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

  // Reached from the Master Timetable's own Print picker choosing "Class" —
  // auto-triggers print once this page's own data has loaded, so the
  // Administrator doesn't have to click Print again after navigating here.
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
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Class Timetable — {className}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Read-only.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => timetableService.downloadClassTimetablePdf(classId)}>
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
