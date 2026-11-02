import React from 'react';
import { Dialog, Input, Switch } from '../../../shared/components';

// (Architecture Update — Periods) The setup wizard's own defaults, matching
// the Business Specification exactly — most Admins accept these as-is, so
// they sit inside a collapsed "Advanced" section rather than the main form.
const DEFAULT_TEACHING_PERIOD_COUNT = 6;
const DEFAULT_INCLUDE_BREAK = true;
const DEFAULT_BREAK_AFTER_PERIOD = 3;

export function CreateShiftDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [teachingPeriodCount, setTeachingPeriodCount] = React.useState(DEFAULT_TEACHING_PERIOD_COUNT);
  const [includeBreak, setIncludeBreak] = React.useState(DEFAULT_INCLUDE_BREAK);
  const [breakAfterPeriod, setBreakAfterPeriod] = React.useState(DEFAULT_BREAK_AFTER_PERIOD);
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setName('');
    setStartTime('');
    setEndTime('');
    setTeachingPeriodCount(DEFAULT_TEACHING_PERIOD_COUNT);
    setIncludeBreak(DEFAULT_INCLUDE_BREAK);
    setBreakAfterPeriod(DEFAULT_BREAK_AFTER_PERIOD);
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name,
        startTime,
        endTime,
        teachingPeriodCount: Number(teachingPeriodCount),
        includeBreak,
        breakAfterPeriod: Number(breakAfterPeriod),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleConfirm}
      title="Create Shift"
      confirmLabel={submitting ? 'Creating…' : 'Create Shift'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />

        <details className="rounded-md border border-gray-300 p-3 dark:border-gray-500">
          <summary className="cursor-pointer text-[13px] font-bold text-navy-900 dark:text-white">
            Period structure (advanced)
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Input
              label="Number of Teaching Periods"
              type="number"
              min="1"
              value={teachingPeriodCount}
              onChange={(e) => setTeachingPeriodCount(e.target.value)}
            />
            <Switch label="Include Break" checked={includeBreak} onChange={setIncludeBreak} />
            {includeBreak && (
              <Input
                label="Break after Period"
                type="number"
                min="1"
                value={breakAfterPeriod}
                onChange={(e) => setBreakAfterPeriod(e.target.value)}
              />
            )}
          </div>
        </details>

        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
