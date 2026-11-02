import React from 'react';
import { Badge, IconButton, Tooltip } from '../../../shared/components';
import { DAY_LABELS } from '../utils/formatting';

// A Day (rows) x Period (columns) grid — the shape Class Timetable and
// Teacher Timetable both share (Business Specification's own Timetable
// Views section). editable=true (Master Timetable only) shows per-cell
// Edit/Archive/Lock/Split actions; every other view is read-only.
// `days` is the school's own configured Working Days only (already sorted
// into calendar order by the caller, via `sortDays`) — a non-Working Day is
// never rendered as an empty row, even if it has no Lessons.
export function TimetableGrid({ lessons, days, editable = false, onEdit, onArchive, onReactivate, onLock, onUnlock, onSplit }) {
  const periodIds = [...new Set(lessons.map((l) => l.period && l.period.id).filter(Boolean))];
  const periodLabel = new Map();
  lessons.forEach((l) => {
    if (l.period) periodLabel.set(l.period.id, l.period.name);
  });

  const byDayPeriod = new Map();
  lessons.forEach((l) => {
    if (!l.period) return;
    byDayPeriod.set(`${l.dayOfWeek}:${l.period.id}`, l);
  });

  if (periodIds.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No Lessons scheduled yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
            <th className="px-3 py-2 font-bold">Day</th>
            {periodIds.map((periodId) => (
              <th key={periodId} className="px-3 py-2 font-bold">
                {periodLabel.get(periodId)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
              <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">{DAY_LABELS[day]}</td>
              {periodIds.map((periodId) => {
                const lesson = byDayPeriod.get(`${day}:${periodId}`);
                if (!lesson) {
                  return <td key={periodId} className="px-3 py-2 text-gray-300 dark:text-navy-700">—</td>;
                }
                const isActive = lesson.status === 'ACTIVE';
                return (
                  <td key={periodId} className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {lesson.subject ? lesson.subject.name : '—'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {lesson.teacher ? lesson.teacher.fullName : ''}
                        {lesson.class ? ` · ${lesson.class.name}` : ''}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Cancelled'}</Badge>
                        {lesson.locked && <Badge tone="warning">Locked</Badge>}
                        {lesson.lessonGroupId && <Badge tone="accent">Double</Badge>}
                      </div>
                      {editable && (
                        <div className="flex flex-wrap gap-1">
                          {isActive ? (
                            <>
                              {!lesson.locked && (
                                <Tooltip label="Move / Swap">
                                  <IconButton label="Move / Swap" size="sm" onClick={() => onEdit(lesson)}>
                                    <EditIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {!lesson.locked && (
                                <Tooltip label="Cancel">
                                  <IconButton label="Cancel" size="sm" onClick={() => onArchive(lesson)}>
                                    <CancelIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip label={lesson.locked ? 'Unlock' : 'Lock'}>
                                <IconButton
                                  label={lesson.locked ? 'Unlock' : 'Lock'}
                                  size="sm"
                                  onClick={() => (lesson.locked ? onUnlock(lesson) : onLock(lesson))}
                                >
                                  <LockIcon locked={lesson.locked} />
                                </IconButton>
                              </Tooltip>
                              {lesson.lessonGroupId && (
                                <Tooltip label="Split Double Period">
                                  <IconButton label="Split Double Period" size="sm" onClick={() => onSplit(lesson)}>
                                    <SplitIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </>
                          ) : (
                            <Tooltip label="Restore">
                              <IconButton label="Restore" size="sm" onClick={() => onReactivate(lesson)}>
                                <RestoreIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function LockIcon({ locked }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M2 13v3a2 2 0 0 0 2 2h3" />
      <path d="M22 13v3a2 2 0 0 1-2 2h-3" />
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 3" />
    </svg>
  );
}
