import React from 'react';
import { Badge, Dialog } from '../../../shared/components';
import * as timetableService from '../services/timetable.service';

// (Teacher weekly capacity Hard Constraint, Business Rule #30) A proactive,
// read-only check — lets the School Admin find and fix an over-committed
// Teacher before ever clicking Generate, rather than only finding out from
// a failed generation job's own errorMessage (the same figures either way).
export function TeacherCapacityDialog({ open, onClose }) {
  const [loading, setLoading] = React.useState(true);
  const [report, setReport] = React.useState([]);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    timetableService
      .getTeacherCapacityReport()
      .then((data) => setReport([...data].sort((a, b) => Number(b.overCapacity) - Number(a.overCapacity) || a.teacherName.localeCompare(b.teacherName))))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open]);

  const overCount = report.filter((r) => r.overCapacity).length;

  return (
    <Dialog open={open} onClose={onClose} title="Teacher Weekly Capacity" cancelLabel="Close">
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Checking…</p>
      ) : error ? (
        <p className="text-[13px] text-danger">{error}</p>
      ) : report.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No Teacher currently has an Active Teacher Subject Assignment for this Academic Year.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-gray-700 dark:text-gray-300">
            {overCount > 0
              ? `${overCount} Teacher${overCount > 1 ? 's are' : ' is'} over their own weekly capacity — Generate Timetable will refuse to run until this is fixed.`
              : 'Every Teacher is within their own weekly capacity.'}
          </p>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="py-2 pr-3 font-bold">Teacher</th>
                  <th className="py-2 pr-3 font-bold">Committed</th>
                  <th className="py-2 pr-3 font-bold">Capacity</th>
                  <th className="py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr key={row.teacherId} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-gray-100">{row.teacherName}</td>
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{row.committed} periods/week</td>
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{row.capacity} periods/week</td>
                    <td className="py-2">
                      <Badge tone={row.overCapacity ? 'danger' : 'success'}>
                        {row.overCapacity ? 'Over Capacity' : 'OK'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
