'use client';

import { useState } from 'react';
import { MessageSquare, Send, ArrowLeft, RefreshCw, Clock, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useGetAllTopicsAdminQuery,
  useGetTopicDetailAdminQuery,
  useAddAdminReplyMutation,
  useUpdateTopicStatusMutation,
  SupportTopicStatus,
} from '@/lib/api/supportApi';
import { formatDistanceToNow } from 'date-fns';

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: topics, isLoading: topicsLoading, refetch: refetchTopics } = useGetAllTopicsAdminQuery();
  const { data: topicDetail, isLoading: detailLoading, refetch: refetchDetail } = useGetTopicDetailAdminQuery(
    selectedTopicId || '',
    { skip: !selectedTopicId }
  );
  const [addReply, { isLoading: replying }] = useAddAdminReplyMutation();
  const [updateStatus, { isLoading: updatingStatus }] = useUpdateTopicStatusMutation();

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTopicId) return;

    try {
      await addReply({
        topicId: selectedTopicId,
        message: { message: replyMessage },
      }).unwrap();

      toast({
        title: 'Success',
        description: 'Your reply has been sent to the user',
      });

      setReplyMessage('');
      refetchDetail();
      refetchTopics();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send reply. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleStatusChange = async (newStatus: SupportTopicStatus) => {
    if (!selectedTopicId) return;

    try {
      await updateStatus({
        topicId: selectedTopicId,
        status: { status: newStatus },
      }).unwrap();

      toast({
        title: 'Success',
        description: `Topic status updated to ${newStatus}`,
      });

      refetchDetail();
      refetchTopics();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: SupportTopicStatus) => {
    switch (status) {
      case SupportTopicStatus.OPEN:
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-500">
            <Clock className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      case SupportTopicStatus.IN_PROGRESS:
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            <AlertCircle className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        );
      case SupportTopicStatus.RESOLVED:
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolved
          </Badge>
        );
      default:
        return null;
    }
  };

  const filteredTopics = topics?.filter((topic) => {
    if (statusFilter === 'all') return true;
    return topic.status === statusFilter;
  });

  if (selectedTopicId && topicDetail) {
    // Detail view
    return (
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => setSelectedTopicId(null)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to All Topics
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl">{topicDetail.title}</CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>
                      {topicDetail.user_name || 'Unknown User'} ({topicDetail.user_email || 'No email'})
                    </span>
                  </div>
                  <div>Created {formatDistanceToNow(new Date(topicDetail.created_at))} ago</div>
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-2">
                  {getStatusBadge(topicDetail.status)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchDetail()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <div className="w-full">
                  <Select
                    value={topicDetail.status}
                    onValueChange={(value) => handleStatusChange(value as SupportTopicStatus)}
                    disabled={updatingStatus}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SupportTopicStatus.OPEN}>Open</SelectItem>
                      <SelectItem value={SupportTopicStatus.IN_PROGRESS}>In Progress</SelectItem>
                      <SelectItem value={SupportTopicStatus.RESOLVED}>Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Messages */}
            <div className="space-y-4 mb-6">
              {topicDetail.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.is_admin_reply ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.is_admin_reply
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold">
                        {message.is_admin_reply ? 'You (Admin)' : message.user_name || 'User'}
                      </span>
                      <span className="text-xs opacity-70">
                        {formatDistanceToNow(new Date(message.created_at))} ago
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply form */}
            <form onSubmit={handleAddReply} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Admin Reply</label>
                <Textarea
                  placeholder="Type your reply to the user..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <Button type="submit" disabled={replying || !replyMessage.trim()}>
                <Send className="h-4 w-4 mr-2" />
                {replying ? 'Sending...' : 'Send Reply'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Support Center</h1>
          <p className="text-muted-foreground">
            Manage user support requests and provide assistance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Topics</SelectItem>
              <SelectItem value={SupportTopicStatus.OPEN}>Open</SelectItem>
              <SelectItem value={SupportTopicStatus.IN_PROGRESS}>In Progress</SelectItem>
              <SelectItem value={SupportTopicStatus.RESOLVED}>Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetchTopics()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      {topics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {topics.filter((t) => t.status === SupportTopicStatus.OPEN).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {topics.filter((t) => t.status === SupportTopicStatus.IN_PROGRESS).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {topics.filter((t) => t.status === SupportTopicStatus.RESOLVED).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Topics list */}
      {topicsLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Card key={idx}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filteredTopics && filteredTopics.length > 0 ? (
        <div className="space-y-4">
          {filteredTopics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedTopicId(topic.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{topic.title}</CardTitle>
                    <CardDescription className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span>
                          {topic.user_name || 'Unknown'} ({topic.user_email || 'No email'})
                        </span>
                      </div>
                      <div>
                        Created {formatDistanceToNow(new Date(topic.created_at))} ago
                        {topic.last_message_at && (
                          <> · Last activity {formatDistanceToNow(new Date(topic.last_message_at))} ago</>
                        )}
                      </div>
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(topic.status)}
                    <Badge variant="secondary">{topic.message_count} messages</Badge>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">
              {statusFilter === 'all'
                ? 'No support topics yet'
                : `No ${statusFilter} topics`}
            </p>
            <p className="text-sm text-muted-foreground">
              Support topics from users will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
