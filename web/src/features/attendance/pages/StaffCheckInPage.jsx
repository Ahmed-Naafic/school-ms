import React from 'react';
import { Button, Card } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { AttendanceStatusDot } from '../components/AttendanceStatusDot';
import * as attendanceService from '../services/attendance.service';

const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late' };

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Business Lifecycle §5-6 (v1.7): a Teacher, Accountant, or Manager records
// their OWN arrival — never a Manager/Admin clicking on their behalf. There
// is no "view my own status" read endpoint (Section H.1 only ever needed a
// write); this page simply offers the one action and reports whatever the
// server returns, exactly like the Manager-facing pages already did before
// this action moved to self-service. Clicking a second time on an already-
// recorded day surfaces the existing 409 as a plain message, not a crash.
export function StaffCheckInPage() {
  const { showToast } = useToast();
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [alreadyRecorded, setAlreadyRecorded] = React.useState(false);

  const handleComeIn = async () => {
    setChecking(true);
    try {
      const record = await attendanceService.recordSelfArrival();
      setResult(record);
      setAlreadyRecorded(false);
      showToast({ tone: 'success', title: 'Arrival recorded' });
    } catch (err) {
      if (err.status === 409) {
        setAlreadyRecorded(true);
      } else {
        showToast({ tone: 'danger', title: 'Could not record arrival', description: err.message });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">My Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Record your own arrival for today — status is determined automatically from the time you check in.
        </p>
      </div>

      <Card>
        {result ? (
          <div className="flex items-center gap-3">
            <AttendanceStatusDot status={result.status} filled size="md" />
            <div>
              <p className="font-display text-lg font-bold text-navy-900 dark:text-white">
                {STATUS_LABEL[result.status] || result.status}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Arrived at {formatTime(result.recordedAt)}</p>
            </div>
          </div>
        ) : alreadyRecorded ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You've already checked in for today. If this looks wrong, ask your Manager to review it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">You haven't checked in yet today.</p>
            <Button onClick={handleComeIn} disabled={checking}>
              {checking ? 'Checking in…' : 'Come'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
