import React from 'react';
import { Button, Card, Input } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import * as attendanceService from '../services/attendance.service';

const EMPTY_SETTINGS = {
  staffAttendanceStartTime: '',
  staffAttendanceLateThreshold: '',
  staffAttendanceAbsenceCutoff: '',
};

// Business Rule #38: there is no system-wide default for these three
// values — until School Admin sets all three here, "Come" is rejected for
// every staff member at this school (Business Lifecycle §11).
export function AttendanceSettingsPage() {
  const { showToast } = useToast();
  const [form, setForm] = React.useState(EMPTY_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    attendanceService.getAttendanceSettings().then((data) => {
      setForm({
        staffAttendanceStartTime: data.staffAttendanceStartTime || '',
        staffAttendanceLateThreshold: data.staffAttendanceLateThreshold || '',
        staffAttendanceAbsenceCutoff: data.staffAttendanceAbsenceCutoff || '',
      });
      setLoading(false);
    });
  }, []);

  const configured = Boolean(
    form.staffAttendanceStartTime && form.staffAttendanceLateThreshold && form.staffAttendanceAbsenceCutoff
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await attendanceService.updateAttendanceSettings(form);
      setForm(data);
      showToast({ tone: 'success', title: 'Staff Attendance Timing Settings saved' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not save settings', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Staff Attendance Timing</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure when staff attendance opens, when an arrival counts as late, and when an un-recorded staff
          member is reported absent. These apply to both Manager-recorded Teacher/Accountant attendance and
          School-Admin-recorded Manager attendance.
        </p>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <>
            {!configured && (
              <p className="mb-5 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning">
                Not configured yet — "Come" cannot be recorded for this school until all three times below are set.
              </p>
            )}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Input
                label="Start time"
                type="time"
                hint={'Before this, "Come" is rejected.'}
                value={form.staffAttendanceStartTime}
                onChange={(e) => setForm((prev) => ({ ...prev, staffAttendanceStartTime: e.target.value }))}
              />
              <Input
                label="Late threshold"
                type="time"
                hint="At or before this is Present; after is Late."
                value={form.staffAttendanceLateThreshold}
                onChange={(e) => setForm((prev) => ({ ...prev, staffAttendanceLateThreshold: e.target.value }))}
              />
              <Input
                label="Absence cutoff"
                type="time"
                hint="No arrival by this time reads as Absent."
                value={form.staffAttendanceAbsenceCutoff}
                onChange={(e) => setForm((prev) => ({ ...prev, staffAttendanceAbsenceCutoff: e.target.value }))}
              />
            </div>
            <div className="mt-6">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
