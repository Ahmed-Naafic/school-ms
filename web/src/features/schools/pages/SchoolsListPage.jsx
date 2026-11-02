import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Dialog } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import { CreateSchoolDialog } from '../components/CreateSchoolDialog';
import * as schoolsService from '../services/schools.service';

export function SchoolsListPage() {
  const { showToast } = useToast();
  const [schools, setSchools] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  // The first School Admin's one-time temporary password — shown in a dialog
  // (not a toast, which auto-dismisses) since it is never retrievable again.
  const [initialAdminCredentials, setInitialAdminCredentials] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setSchools(await schoolsService.listSchools());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    const school = await schoolsService.createSchool(data);
    showToast({ tone: 'success', title: 'School created' });
    if (school.initialSchoolAdmin?.temporaryPassword) {
      setInitialAdminCredentials(school.initialSchoolAdmin);
    }
    load();
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Schools</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Onboard and manage schools on the platform.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Onboard school</Button>
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : schools.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No schools yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Subscription</th>
                <th className="px-5 py-3 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                  <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{school.name}</td>
                  <td className="px-5 py-3">
                    <SchoolStatusBadge status={school.lifecycleStatus} />
                  </td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{school.subscriptionStatus}</td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/schools/${school.id}`} className="text-sm font-semibold text-teal-600 hover:text-teal-700">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      <CreateSchoolDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={handleCreate} />

      <Dialog
        open={initialAdminCredentials !== null}
        title="School Admin login credentials"
        description="Share these with the School Admin directly — the password will not be shown again. They must set their own password the first time they log in."
        cancelLabel="Done"
        onClose={() => setInitialAdminCredentials(null)}
      >
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="font-mono text-navy-900 dark:text-white">{initialAdminCredentials?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Temporary password</dt>
            <dd className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-wide text-navy-900 dark:border-gray-500 dark:bg-navy-800 dark:text-white">
              {initialAdminCredentials?.temporaryPassword}
            </dd>
          </div>
        </dl>
      </Dialog>
    </div>
  );
}
