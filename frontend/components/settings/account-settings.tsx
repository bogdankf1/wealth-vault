'use client';

import { useSession } from 'next-auth/react';
import { User, Mail, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { format } from 'date-fns';

export function AccountSettings() {
  const { data: session } = useSession();
  const { data: currentUser, isLoading } = useGetCurrentUserQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
          </CardHeader>
          <CardContent>
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>Your account details and information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Name</p>
              <p className="text-sm text-muted-foreground">
                {session?.user?.name || currentUser?.name || 'Not set'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">
                {session?.user?.email || currentUser?.email || 'Not set'}
              </p>
            </div>
          </div>

          {currentUser?.created_at && (
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Member Since</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(currentUser.created_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
