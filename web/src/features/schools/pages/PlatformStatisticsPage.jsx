import React from 'react';
import { Card } from '../../../shared/components';
import * as schoolsService from '../services/schools.service';

export function PlatformStatisticsPage() {
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    schoolsService.getPlatformStatistics().then(setStats);
  }, []);

  if (!stats) {
    return <div className="mx-auto max-w-container px-4 py-8 sm:px-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  const tiles = [
    { label: 'Total schools', value: stats.totalSchools },
    { label: 'Active', value: stats.activeSchools },
    { label: 'Suspended', value: stats.suspendedSchools },
    { label: 'Closed', value: stats.closedSchools },
  ];

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-navy-900 dark:text-white">Platform overview</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Aggregate statistics only — never a single school's underlying data.
      </p>

      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="font-display text-3xl font-bold text-navy-900 dark:text-white">{tile.value}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tile.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
