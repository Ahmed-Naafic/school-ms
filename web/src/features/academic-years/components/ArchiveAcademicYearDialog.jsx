import React from 'react';
import { Dialog, Select } from '../../../shared/components';
import { formatAcademicYearLabel } from '../utils/format-academic-year-label';

// Archiving the Current Academic Year requires designating a replacement
// Active one in the same action (Business Rule #9) — this dialog reflects,
// not re-implements, that backend requirement: it just narrows the picker
// to the school's other Active years and blocks confirming without one.
export function ArchiveAcademicYearDialog({ open, academicYear, otherActiveYears = [], onClose, onConfirm }) {
  const [replacementId, setReplacementId] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReplacementId('');
      setError(null);
    }
  }, [open]);

  if (!academicYear) return null;

  const requiresReplacement = academicYear.isCurrent;

  const handleConfirm = async () => {
    setError(null);

    if (requiresReplacement && !replacementId) {
      setError('Choose a replacement Academic Year first.');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(academicYear.id, requiresReplacement ? replacementId : undefined);
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
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Archive this Academic Year?"
      description={
        requiresReplacement
          ? "This is the school's Current Academic Year — choose which Academic Year becomes Current instead before archiving. This never affects existing data referencing it; it only becomes ineligible for new use."
          : 'This never affects existing data referencing it; it only becomes ineligible for new use until reactivated.'
      }
      confirmLabel={submitting ? 'Archiving…' : 'Archive'}
    >
      {requiresReplacement && (
        <div className="flex flex-col gap-3">
          {otherActiveYears.length === 0 ? (
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              No other Active Academic Year exists to become Current — create one first.
            </p>
          ) : (
            <Select
              label="New Current Academic Year"
              value={replacementId}
              onChange={(e) => setReplacementId(e.target.value)}
              options={[
                { value: '', label: 'Choose a replacement' },
                ...otherActiveYears.map((y) => ({
                  value: y.id,
                  label: formatAcademicYearLabel(y.startDate, y.endDate),
                })),
              ]}
            />
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </Dialog>
  );
}
