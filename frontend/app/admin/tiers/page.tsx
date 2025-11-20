/**
 * Tier management page - manage subscription tiers and feature assignments
 */
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleHeader } from '@/components/ui/module-header';
import { LoadingCards } from '@/components/ui/loading-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
    useGetAdminTiersQuery,
    useGetTierFeaturesQuery,
    useGetAllFeaturesQuery,
    useUpdateTierMutation,
    useAssignFeatureToTierMutation,
    Tier, TierFeature,
} from '@/lib/api/adminApi';
import { Crown, Edit, Check, X, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TiersPage() {
  const { toast } = useToast();
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriceMonthly, setEditedPriceMonthly] = useState(0);
  const [editedPriceAnnual, setEditedPriceAnnual] = useState(0);
  const [editedIsActive, setEditedIsActive] = useState(true);

  const { data: tiers, isLoading } = useGetAdminTiersQuery();
  const { data: allFeatures } = useGetAllFeaturesQuery();

  // Fetch features for each tier (we need to call hooks unconditionally)
  const starterFeatures = useGetTierFeaturesQuery(tiers?.find(t => t.name === 'starter')?.id || '', {
    skip: !tiers?.find(t => t.name === 'starter'),
  });
  const growthFeatures = useGetTierFeaturesQuery(tiers?.find(t => t.name === 'growth')?.id || '', {
    skip: !tiers?.find(t => t.name === 'growth'),
  });
  const wealthFeatures = useGetTierFeaturesQuery(tiers?.find(t => t.name === 'wealth')?.id || '', {
    skip: !tiers?.find(t => t.name === 'wealth'),
  });

  // Create a map of tier features
  const tierFeaturesMap: Record<string, TierFeature[]> = {};
  if (tiers) {
    const starterTier = tiers.find(t => t.name === 'starter');
    const growthTier = tiers.find(t => t.name === 'growth');
    const wealthTier = tiers.find(t => t.name === 'wealth');

    if (starterTier && starterFeatures.data) tierFeaturesMap[starterTier.id] = starterFeatures.data;
    if (growthTier && growthFeatures.data) tierFeaturesMap[growthTier.id] = growthFeatures.data;
    if (wealthTier && wealthFeatures.data) tierFeaturesMap[wealthTier.id] = wealthFeatures.data;
  }

  // Fetch features for selected tier in dialog
  const { data: selectedTierFeatures } = useGetTierFeaturesQuery(selectedTier?.id || '', {
    skip: !selectedTier,
  });

  const [updateTier, { isLoading: isUpdating }] = useUpdateTierMutation();
  const [assignFeature, { isLoading: isAssigning }] = useAssignFeatureToTierMutation();

  const handleEditTier = (tier: Tier) => {
    setSelectedTier(tier);
    setEditedDisplayName(tier.display_name);
    setEditedDescription(tier.description || '');
    setEditedPriceMonthly(tier.price_monthly);
    setEditedPriceAnnual(tier.price_annual);
    setEditedIsActive(tier.is_active);
    setEditDialogOpen(true);
  };

  const handleUpdateTier = async () => {
    if (!selectedTier) return;

    try {
      await updateTier({
        tierId: selectedTier.id,
        display_name: editedDisplayName,
        description: editedDescription,
        price_monthly: editedPriceMonthly,
        price_annual: editedPriceAnnual,
        is_active: editedIsActive,
      }).unwrap();

      toast({
        title: 'Tier updated',
        description: 'Tier has been successfully updated.',
      });
      setEditDialogOpen(false);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update tier. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleManageFeatures = (tier: Tier) => {
    setSelectedTier(tier);
    setFeatureDialogOpen(true);
  };

  const handleToggleFeature = async (featureId: string, currentlyEnabled: boolean) => {
    if (!selectedTier) return;

    try {
      await assignFeature({
        tierId: selectedTier.id,
        feature_id: featureId,
        enabled: !currentlyEnabled,
      }).unwrap();

      toast({
        title: 'Feature updated',
        description: `Feature ${!currentlyEnabled ? 'enabled' : 'disabled'} for tier.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update feature. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getTierBadgeColor = (tierName: string) => {
    switch (tierName) {
      case 'wealth':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'growth':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'starter':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const isFeatureEnabled = (featureId: string) => {
    return selectedTierFeatures?.some((tf) => tf.feature_id === featureId && tf.enabled) || false;
  };


  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <ModuleHeader
        title="Tier Management"
        description="Manage subscription tiers, pricing, and feature assignments"
      />

      {/* Tiers Grid */}
      {isLoading ? (
        <LoadingCards count={3} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers?.map((tier) => (
            <Card key={tier.id} className={!tier.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex items-center space-x-2">
                      {tier.name === 'wealth' && <Crown className="h-5 w-5 text-purple-600" />}
                      <span>{tier.display_name}</span>
                    </CardTitle>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Subscription tier with pricing and feature access controls</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTierBadgeColor(
                      tier.name
                    )}`}
                  >
                    {tier.name}
                  </span>
                </div>
                <CardDescription className="line-clamp-2">
                  {tier.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Monthly</span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(tier.price_monthly)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Annual</span>
                    <span className="text-xl font-semibold text-gray-900 dark:text-white">
                      {formatPrice(tier.price_annual)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 h-4">
                    {tier.price_monthly > 0 ? (
                      <>Save {formatPrice(tier.price_monthly * 12 - tier.price_annual)}/year</>
                    ) : (
                      <>&nbsp;</>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-4 border-t dark:border-gray-700">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      tier.is_active ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  ></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {tier.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex space-x-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => handleEditTier(tier)} className="flex-1">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleManageFeatures(tier)} className="flex-1">
                    Manage Features
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Features Comparison Table */}
      {!isLoading && tiers && allFeatures && allFeatures.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Feature Comparison</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Quick overview of which features are enabled for each tier</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>Overview of feature availability across all tiers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b dark:border-gray-700">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      Feature
                    </th>
                    {tiers.map((tier) => (
                      <th key={tier.id} className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        {tier.display_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allFeatures.map((feature, index) => (
                    <tr key={feature.id} className={`border-b dark:border-gray-700 ${index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">{feature.name}</div>
                        {feature.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{feature.description}</div>
                        )}
                      </td>
                      {tiers.map((tier) => {
                        const tierFeatures = tierFeaturesMap[tier.id] || [];
                        const isEnabled = tierFeatures.some((tf) => tf.feature_id === feature.id && tf.enabled);
                        return (
                          <td key={tier.id} className="py-3 px-4 text-center">
                            {isEnabled ? (
                              <Check className="h-5 w-5 text-green-600 mx-auto" />
                            ) : (
                              <X className="h-5 w-5 text-gray-300 dark:text-gray-600 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Tier Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Tier</DialogTitle>
            <DialogDescription>Update tier details and pricing</DialogDescription>
          </DialogHeader>
          {selectedTier && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Tier Name (System)</Label>
                <Input value={selectedTier.name} disabled className="mt-1" />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={editedDisplayName}
                  onChange={(e) => setEditedDisplayName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Monthly Price (USD)</Label>
                  <Input
                    type="number"
                    value={editedPriceMonthly}
                    onChange={(e) => setEditedPriceMonthly(parseFloat(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Annual Price (USD)</Label>
                  <Input
                    type="number"
                    value={editedPriceAnnual}
                    onChange={(e) => setEditedPriceAnnual(parseFloat(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch checked={editedIsActive} onCheckedChange={setEditedIsActive} />
                <Label>Tier is active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTier} disabled={isUpdating}>
              {isUpdating ? 'Updating...' : 'Update Tier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Features Dialog */}
      <Dialog open={featureDialogOpen} onOpenChange={setFeatureDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Features - {selectedTier?.display_name}</DialogTitle>
            <DialogDescription>Enable or disable features for this tier</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {allFeatures?.map((feature) => {
              const enabled = isFeatureEnabled(feature.id);
              return (
                <div
                  key={feature.id}
                  className="flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">{feature.name}</div>
                    {feature.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {feature.description}
                      </div>
                    )}
                    {feature.module && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Module: {feature.module}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={enabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleFeature(feature.id, enabled)}
                    disabled={isAssigning}
                    className="ml-4"
                  >
                    {enabled ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-2" />
                        Disabled
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatureDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
