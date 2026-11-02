import React from 'react';
import { Card, Tabs } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { SubjectStatusBadge } from '../components/SubjectStatusBadge';
import * as subjectsService from '../services/subjects.service';

const LEVEL_LABELS = { PRIMARY: 'Primary', SECONDARY: 'Secondary' };

// Read-only for School Admin — no create/edit/assign/archive/remove
// affordance anywhere on this page, per Business Rule #1.
export function MySubjectsPage() {
  const { account } = useAuth();
  const [assignments, setAssignments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [levelFilter, setLevelFilter] = React.useState('');

  React.useEffect(() => {
    subjectsService
      .listSchoolSubjects(account.schoolId)
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, [account.schoolId]);

  const countOf = (level) => assignments.filter((row) => row.subject.educationLevel === level).length;
  const levelTabs = [
    { value: '', label: `All (${assignments.length})` },
    ...['PRIMARY', 'SECONDARY']
      .filter((level) => countOf(level) > 0)
      .map((level) => ({ value: level, label: `${LEVEL_LABELS[level]} (${countOf(level)})` })),
  ];
  const visible = levelFilter
    ? assignments.filter((row) => row.subject.educationLevel === levelFilter)
    : assignments;

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Subjects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Subjects assigned to your school by the platform administrator.
        </p>
      </div>

      {assignments.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs tabs={levelTabs} value={levelFilter} onChange={setLevelFilter} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {levelFilter ? `${LEVEL_LABELS[levelFilter]} Subjects` : 'all Subjects'}
          </span>
        </div>
      )}

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Subjects assigned to your school yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Education Level</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{row.subject.name}</td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                      {LEVEL_LABELS[row.subject.educationLevel]}
                    </td>
                    <td className="px-5 py-3">
                      <SubjectStatusBadge status={row.subject.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
