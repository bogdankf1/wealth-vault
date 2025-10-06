/**
 * Dashboard page (placeholder for Phase 1)
 */
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Welcome to Wealth Vault</h1>
      <p className="mt-4 text-gray-600 dark:text-gray-400">
        Dashboard coming in Phase 1...
      </p>
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm">
          <strong>Logged in as:</strong> {session.user?.email}
        </p>
        <p className="text-sm">
          <strong>Tier:</strong> {session.user?.tier || 'starter'}
        </p>
        <p className="text-sm">
          <strong>Role:</strong> {session.user?.role || 'USER'}
        </p>
      </div>
    </div>
  );
}
