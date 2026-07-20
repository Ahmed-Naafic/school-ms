import React from 'react';
import { Card } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { SubjectStatusBadge } from '../components/SubjectStatusBadge';
import * as subjectsService from '../services/subjects.service';

// Read-only for School Admin — no create/edit/assign/archive/remove
// affordance anywhere on this page, per Business Rule #1.
export function MySubjectsPage() {
  const { account } = useAuth();
  const [assignments, setAssignments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    subjectsService
      .listSchoolSubjects(account.schoolId)
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, [account.schoolId]);

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Subjects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Subjects assigned to your school by the platform administrator.
        </p>
      </div>

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
                {assignments.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{row.subject.name}</td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                      {row.subject.educationLevel === 'PRIMARY' ? 'Primary' : 'Secondary'}
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
