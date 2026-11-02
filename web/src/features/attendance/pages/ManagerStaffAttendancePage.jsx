import React from 'react';
import { Button, Card, Input } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { AttendanceStatusDot } from '../components/AttendanceStatusDot';
import { StaffExcuseModal } from '../components/StaffExcuseModal';
import * as attendanceService from '../services/attendance.service';

const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', EXCUSED: 'Excused', NOT_RECORDED: 'Not recorded' };
const STATUS_TEXT_CLASS = {
  PRESENT: 'text-success',
  LATE: 'text-warning',
  ABSENT: 'text-danger',
  EXCUSED: 'text-navy-800 dark:text-navy-100',
  NOT_RECORDED: 'text-gray-500 dark:text-gray-400',
};

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// Business Lifecycle §5, §11 (v1.7; v2.0): each Teacher/Accountant may
// self-record their own "Come" (StaffCheckInPage), or their Manager may
// record it for them directly from this roster while their row is still
// NOT_RECORDED (Business Rule #42) — clicking that row's control never opens
// the Excuse popup. PRESENT/LATE/ABSENT are always automatic; EXCUSED is the
// one status a Manager may apply directly to an already-recorded row, via the
// popup below — never a fourth "PRESENT/ABSENT/LATE" option in that popup,
// and never available for NOT_RECORDED. A Manager can never reach a
// Manager's or an Admin's own attendance through this page — the backend
// never returns them here, and never accepts them as a "Come" target either
// (Business Rules #16, #33, #42).
//
// (v1.9, Business Rule #41) Excuse is today-only through the normal action;
// a past date routes through the separate, explicitly-labeled historical
// correction action instead; a future date is never actionable at all. The
// date picker itself is untouched — viewing any date's roster is still
// allowed, only the Excuse action's reach is restricted.
export function ManagerStaffAttendancePage() {
  const { showToast } = useToast();
  const [date, setDate] = React.useState(todayDateStr());
  const [staff, setStaff] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [actingOn, setActingOn] = React.useState(null);
  const [excuseTarget, setExcuseTarget] = React.useState(null);
  const triggerRefs = React.useRef({});

  const today = todayDateStr();
  const isToday = date === today;
  const isFuture = date > today;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await attendanceService.getManagerStaffAttendance(date);
      setStaff(data);
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => {
    load();
  }, [load]);

  // (v2.0) NOT_RECORDED's own control never opens the Excuse popup — clicking
  // it records that staff member's arrival directly, reusing the same
  // server-timestamp/derive-status mechanism as self check-in (Business Rule
  // #42). Every other status keeps opening the Excuse popup, unchanged below.
  const handleComeForRow = async (s) => {
    setActingOn(s.accountId);
    try {
      await attendanceService.recordManagerStaffArrival(s.accountId);
      showToast({ tone: 'success', title: 'Arrival recorded' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not record arrival', description: err.message });
    } finally {
      setActingOn(null);
    }
  };

  const handleConfirmExcuse = async () => {
    if (!excuseTarget) return;
    setActingOn(excuseTarget.accountId);
    setExcuseTarget(null);
    try {
      if (isToday) {
        await attendanceService.excuseManagerStaff(excuseTarget.accountId, date);
      } else {
        await attendanceService.excuseManagerStaffHistorical(excuseTarget.accountId, date);
      }
      showToast({ tone: 'success', title: 'Marked excused' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not mark excused', description: err.message });
    } finally {
      setActingOn(null);
    }
  };

  // Section H.2's Unexcuse action — the only way a mistaken "Excuse" click
  // is undone. Deliberately narrow: no status is ever chosen here, by design
  // (a Manager freely picking Present/Late/Absent would be unfair — status
  // must only ever come from a real, self-recorded "Come" arrival). The
  // server recomputes the real prior status if one exists, or removes the
  // record entirely. A single, deterministic reversal — not a "selection" —
  // so it stays a direct action rather than going through the popup. Left
  // unchanged by the v1.9 date restriction (see Change History).
  const handleUnexcuse = async (accountId) => {
    setActingOn(accountId);
    try {
      await attendanceService.unexcuseManagerStaff(accountId, date);
      showToast({ tone: 'success', title: 'Excuse undone' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not undo excuse', description: err.message });
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Staff Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Live arrivals for Teachers and Accountants — a staff member may self-record their own "Come," or you may
          record it for them while their row is Not Recorded; status is determined automatically from the arrival
          time.
        </p>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {!isToday && !isFuture && (
          <p className="mt-3 rounded-md bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
            Viewing a past date — Excuse now applies as a historical correction, clearly marked as such.
          </p>
        )}
        {isFuture && (
          <p className="mt-3 rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-navy-800 dark:text-gray-400">
            Viewing a future date — no action is available; Excuse can never be applied ahead of time.
          </p>
        )}
      </Card>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Teachers or Accountants at this school.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Staff Member</th>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-5 py-3 font-bold">Arrival Time</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const isExcused = s.status === 'EXCUSED';
                  return (
                    <tr key={s.accountId} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-gray-100">{s.email}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{s.role}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{formatTime(s.time)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {isExcused ? (
                            <>
                              <AttendanceStatusDot status="EXCUSED" filled />
                              <span className={['text-xs font-bold', STATUS_TEXT_CLASS.EXCUSED].join(' ')}>Excused</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnexcuse(s.accountId)}
                                disabled={actingOn === s.accountId}
                                className="ml-1"
                              >
                                Unexcuse
                              </Button>
                            </>
                          ) : s.status === 'NOT_RECORDED' ? (
                            <button
                              type="button"
                              onClick={() => handleComeForRow(s)}
                              disabled={actingOn === s.accountId || !isToday}
                              aria-label={
                                isToday
                                  ? `${s.email}, status: Not recorded. Press to record arrival now.`
                                  : `${s.email}, status: Not recorded. Recording arrival is only available for today.`
                              }
                              className="flex min-h-[36px] items-center gap-2 rounded-pill px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <AttendanceStatusDot status={null} filled={false} />
                              <span className={['text-xs font-bold', STATUS_TEXT_CLASS.NOT_RECORDED].join(' ')}>Not recorded</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              ref={(el) => {
                                triggerRefs.current[s.accountId] = el;
                              }}
                              onClick={() => setExcuseTarget(s)}
                              disabled={actingOn === s.accountId || isFuture}
                              aria-haspopup="dialog"
                              aria-label={
                                isFuture
                                  ? `${s.email}, status: ${STATUS_LABEL[s.status] || s.status}. Excuse is not available for a future date.`
                                  : `${s.email}, status: ${STATUS_LABEL[s.status] || s.status}. Press to mark Excused${isToday ? '' : ` (historical correction for ${formatDateLabel(date)})`}.`
                              }
                              className="flex min-h-[36px] items-center gap-2 rounded-pill px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <AttendanceStatusDot status={s.status} filled />
                              <span className={['text-xs font-bold', STATUS_TEXT_CLASS[s.status] || ''].join(' ')}>
                                {STATUS_LABEL[s.status] || s.status}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <StaffExcuseModal
        open={Boolean(excuseTarget)}
        staffName={excuseTarget?.email}
        historical={!isToday}
        targetDateLabel={formatDateLabel(date)}
        onConfirm={handleConfirmExcuse}
        onClose={() => setExcuseTarget(null)}
        returnFocusRef={{ current: excuseTarget ? triggerRefs.current[excuseTarget.accountId] : null }}
      />
    </div>
  );
}
