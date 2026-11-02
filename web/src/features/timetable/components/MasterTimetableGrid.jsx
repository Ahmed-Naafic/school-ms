import React from 'react';
import { Badge } from '../../../shared/components';
import { LessonActionsMenu } from './LessonActionsMenu';
import { compactClassName, DAY_LABELS } from '../utils/formatting';

// The true Master Timetable — one row per Class, columns grouped by Day
// then Period, the entire school on one screen. Class column and header
// row stay frozen while the body scrolls horizontally/vertically
// (position: sticky, no JS-driven layout). Break Periods are never passed
// in `periods` at all (they never carry a Lesson, per the Break Period
// Hard Constraint) — there is nothing to filter here, the column set is
// already Teaching-only by construction from the caller.
export function MasterTimetableGrid({ groups, days, periods, editMode, onMoveSwap, onLock, onUnlock, onSplit, onDelete, onCellClick }) {
  const lessonByClassDayPeriod = React.useMemo(() => {
    const map = new Map();
    for (const group of groups) {
      if (!group.class) continue;
      for (const lesson of group.lessons) {
        if (lesson.status !== 'ACTIVE' || !lesson.period) continue;
        map.set(`${group.class.id}|${lesson.dayOfWeek}|${lesson.period.id}`, lesson);
      }
    }
    return map;
  }, [groups]);

  const sortedGroups = React.useMemo(
    () => [...groups].filter((g) => g.class).sort((a, b) => a.class.name.localeCompare(b.class.name)),
    [groups]
  );

  if (periods.length === 0 || days.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No Periods or Working Days configured yet.</p>;
  }

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-navy-700" style={{ maxHeight: '75vh' }}>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 top-0 z-30 min-w-[90px] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-400"
            >
              Class
            </th>
            {days.map((day) => (
              <th
                key={day}
                colSpan={periods.length}
                className="sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-50 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-400"
              >
                {DAY_LABELS[day] || day}
              </th>
            ))}
          </tr>
          <tr>
            {days.map((day) =>
              periods.map((period) => (
                <th
                  key={`${day}-${period.id}`}
                  className="sticky top-[33px] z-20 min-w-[110px] border-b border-r border-gray-100 bg-gray-50 px-2 py-1 text-center text-[11px] font-semibold text-gray-500 dark:border-navy-800 dark:bg-navy-900 dark:text-gray-400"
                >
                  {period.name}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((group) => (
            <tr key={group.class.id}>
              <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-3 py-2 font-bold text-navy-900 dark:border-navy-700 dark:bg-navy-950 dark:text-white">
                {compactClassName(group.class.name)}
              </td>
              {days.map((day) =>
                periods.map((period) => {
                  const lesson = lessonByClassDayPeriod.get(`${group.class.id}|${day}|${period.id}`);
                  return (
                    <td
                      key={`${day}-${period.id}`}
                      onClick={editMode && !lesson ? () => onCellClick(group.class, day, period) : undefined}
                      className={[
                        'border-b border-r border-gray-100 px-2 py-1.5 align-top dark:border-navy-800',
                        editMode && !lesson ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-900' : '',
                      ].join(' ')}
                    >
                      {lesson ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[12.5px] font-semibold leading-tight text-gray-900 dark:text-gray-100">
                              {lesson.subject ? lesson.subject.name : '—'}
                            </span>
                            {editMode && (
                              <LessonActionsMenu
                                lesson={lesson}
                                onMoveSwap={onMoveSwap}
                                onLock={onLock}
                                onUnlock={onUnlock}
                                onSplit={onSplit}
                                onDelete={onDelete}
                              />
                            )}
                          </div>
                          <span className="text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                            {lesson.teacher ? lesson.teacher.fullName : ''}
                          </span>
                          {(lesson.locked || lesson.lessonGroupId) && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {lesson.locked && <Badge tone="warning">🔒 Locked</Badge>}
                              {lesson.lessonGroupId && <Badge tone="accent">🔵 Double</Badge>}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-navy-700">—</span>
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
