'use client';

import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <FileQuestion className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">Page Not Found</CardTitle>
              <CardDescription>
                The page you are looking for does not exist or has been moved.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 404 Visual */}
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <div className="text-8xl font-bold text-primary/20">404</div>
              <p className="text-muted-foreground">
                Oops! This page seems to have gone on vacation.
              </p>
            </div>
          </div>

          {/* Helpful Suggestions */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">What can you do?</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Check the URL for typos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Use the navigation menu to find what you are looking for</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Return to the dashboard and start over</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Contact support if you believe this is an error</span>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">Quick Links</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/dashboard/income">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  Income
                </Button>
              </Link>
              <Link href="/dashboard/expenses">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  Expenses
                </Button>
              </Link>
              <Link href="/dashboard/budgets">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  Budgets
                </Button>
              </Link>
              <Link href="/dashboard/goals">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  Goals
                </Button>
              </Link>
              <Link href="/dashboard/settings">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => router.back()} className="flex-1" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground">
            Still can not find what you are looking for?{' '}
            <Link href="/dashboard/help" className="text-primary hover:underline">
              Contact Support
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
