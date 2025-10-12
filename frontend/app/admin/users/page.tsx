/**
 * User management page - list, search, and manage users
 */
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleHeader } from '@/components/ui/module-header';
import { LoadingTable } from '@/components/ui/loading-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  useGetUsersQuery,
  useGetTiersQuery,
  useUpdateUserMutation,
  useSuspendUserMutation,
  useUnsuspendUserMutation,
  User,
} from '@/lib/api/adminApi';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Edit,
  UserX,
  UserCheck,
  Crown,
  Shield,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function UsersPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedRole, setEditedRole] = useState('');
  const [editedTier, setEditedTier] = useState('');

  const { data: usersData, isLoading } = useGetUsersQuery({
    page,
    page_size: 20,
    search: search || undefined,
    role: roleFilter || undefined,
    tier_name: tierFilter || undefined,
  });

  const { data: tiers } = useGetTiersQuery();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const [suspendUser] = useSuspendUserMutation();
  const [unsuspendUser] = useUnsuspendUserMutation();

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditedRole(user.role);
    setEditedTier(user.tier_name || '');
    setEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const tierId = tiers?.find((t) => t.name === editedTier)?.id;
      await updateUser({
        userId: selectedUser.id,
        role: editedRole,
        tier_id: tierId,
      }).unwrap();

      toast({
        title: 'User updated',
        description: 'User has been successfully updated.',
      });
      setEditDialogOpen(false);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSuspend = async (userId: string) => {
    try {
      await suspendUser({ userId, reason: 'Suspended by admin' }).unwrap();
      toast({
        title: 'User suspended',
        description: 'User has been successfully suspended.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to suspend user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUnsuspend = async (userId: string) => {
    try {
      await unsuspendUser(userId).unwrap();
      toast({
        title: 'User unsuspended',
        description: 'User has been successfully unsuspended.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to unsuspend user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'USER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getTierBadgeColor = (tierName: string | null) => {
    switch (tierName) {
      case 'wealth':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'growth':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'starter':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <ModuleHeader
        title="User Management"
        description="View and manage all platform users"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Search & Filters</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Search users by email or name, and filter by role and subscription tier</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter || 'all'} onValueChange={(value) => { setRoleFilter(value === 'all' ? '' : value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tierFilter || 'all'} onValueChange={(value) => { setTierFilter(value === 'all' ? '' : value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="wealth">Wealth</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Users</CardTitle>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">View all registered users with their roles, tiers, and account status. Use actions to edit, impersonate, or suspend users.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardDescription className="mt-1">
                {usersData?.total ? `${usersData.total} total users` : 'Loading...'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingTable count={10} />
          ) : usersData?.users && usersData.users.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b dark:border-gray-700">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        User
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Tier
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Joined
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.users.map((user) => (
                      <tr key={user.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {user.name || 'No name'}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {user.email}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(
                              user.role
                            )}`}
                          >
                            {user.role === 'ADMIN' && <Shield className="w-3 h-3 mr-1" />}
                            {user.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTierBadgeColor(
                              user.tier_name
                            )}`}
                          >
                            {user.tier_name === 'wealth' && <Crown className="w-3 h-3 mr-1" />}
                            {user.tier_display_name || user.tier_name || 'No tier'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              user.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {format(new Date(user.created_at), 'MMM dd, yyyy')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              title="Edit user"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {user.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSuspend(user.id)}
                                title="Suspend user"
                              >
                                <UserX className="h-4 w-4 text-red-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnsuspend(user.id)}
                                title="Unsuspend user"
                              >
                                <UserCheck className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, usersData.total)} of{' '}
                  {usersData.total} users
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {Math.ceil(usersData.total / 20)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil(usersData.total / 20)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">No users found</div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user role and tier assignment
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Email</Label>
                <Input value={selectedUser.email} disabled className="mt-1" />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={editedRole} onValueChange={setEditedRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tier</Label>
                <Select value={editedTier} onValueChange={setEditedTier}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers?.map((tier) => (
                      <SelectItem key={tier.id} value={tier.name}>
                        {tier.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={isUpdating}>
              {isUpdating ? 'Updating...' : 'Update User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
