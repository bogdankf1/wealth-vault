'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useGetTrialSettingsQuery,
  useUpdateTrialSettingsMutation,
} from '@/lib/api/adminApi';
import { Gift, Loader2, Save } from 'lucide-react';

export function TrialSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading, error } = useGetTrialSettingsQuery();
  const [updateSettings, { isLoading: isUpdating }] = useUpdateTrialSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [durationDays, setDurationDays] = useState(30);
  const [trialTier, setTrialTier] = useState('wealth');

  // Sync local state with fetched settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setDurationDays(settings.duration_days);
      setTrialTier(settings.trial_tier);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings({
        enabled,
        duration_days: durationDays,
        trial_tier: trialTier,
      }).unwrap();

      toast({
        title: 'Settings Saved',
        description: 'Trial settings have been updated successfully.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save trial settings.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            Failed to load trial settings
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-purple-600" />
          <CardTitle>Free Trial Settings</CardTitle>
        </div>
        <CardDescription>
          Configure free trial for new user registrations. When enabled, new users will automatically receive a trial subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="trial-enabled">Enable Free Trial</Label>
            <p className="text-sm text-muted-foreground">
              New users will automatically receive a free trial period
            </p>
          </div>
          <Switch
            id="trial-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Duration Days */}
        <div className="space-y-2">
          <Label htmlFor="duration-days">Trial Duration (days)</Label>
          <Input
            id="duration-days"
            type="number"
            min={1}
            max={365}
            value={durationDays}
            onChange={(e) => setDurationDays(parseInt(e.target.value) || 30)}
            className="max-w-[200px]"
            disabled={!enabled}
          />
          <p className="text-sm text-muted-foreground">
            Number of days the trial period will last
          </p>
        </div>

        {/* Trial Tier */}
        <div className="space-y-2">
          <Label htmlFor="trial-tier">Trial Tier</Label>
          <Select
            value={trialTier}
            onValueChange={setTrialTier}
            disabled={!enabled}
          >
            <SelectTrigger className="max-w-[200px]">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="wealth">Wealth</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            The tier new users will have access to during their trial
          </p>
        </div>

        {/* Save Button */}
        <div className="pt-4">
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Info Box */}
        {enabled && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>Current Configuration:</strong> New users will receive a {durationDays}-day free trial of the{' '}
              <span className="capitalize font-semibold">{trialTier}</span> tier. After the trial expires, they will be automatically downgraded to the Starter tier.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
