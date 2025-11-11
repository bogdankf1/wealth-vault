'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Send, ArrowLeft, RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useGetUserTopicsQuery,
  useCreateTopicMutation,
  useGetTopicDetailQuery,
  useAddMessageMutation,
  SupportTopicStatus,
  type SupportTopic,
} from '@/lib/api/supportApi';
import { formatDistanceToNow } from 'date-fns';

export default function HelpCenterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicMessage, setNewTopicMessage] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  const { data: topics, isLoading: topicsLoading, refetch: refetchTopics } = useGetUserTopicsQuery();
  const { data: topicDetail, isLoading: detailLoading, refetch: refetchDetail } = useGetTopicDetailQuery(
    selectedTopicId || '',
    { skip: !selectedTopicId }
  );
  const [createTopic, { isLoading: creating }] = useCreateTopicMutation();
  const [addMessage, { isLoading: replying }] = useAddMessageMutation();

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !newTopicMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in both title and message',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createTopic({
        title: newTopicTitle,
        message: newTopicMessage,
      }).unwrap();

      toast({
        title: 'Success',
        description: 'Your support topic has been created',
      });

      setNewTopicTitle('');
      setNewTopicMessage('');
      refetchTopics();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create topic. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTopicId) return;

    try {
      await addMessage({
        topicId: selectedTopicId,
        message: { message: replyMessage },
      }).unwrap();

      toast({
        title: 'Success',
        description: 'Your reply has been sent',
      });

      setReplyMessage('');
      refetchDetail();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send reply. Please try again.',
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

  if (selectedTopicId && topicDetail) {
    // Detail view
    return (
      <div className="container mx-auto py-6 px-4 max-w-5xl">
        <Button
          variant="ghost"
          onClick={() => setSelectedTopicId(null)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Topics
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl">{topicDetail.title}</CardTitle>
                <CardDescription className="mt-2">
                  Created {formatDistanceToNow(new Date(topicDetail.created_at))} ago
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                {getStatusBadge(topicDetail.status)}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDetail()}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Disclaimer */}
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> We typically respond within 24-48 hours. Please refresh this page to see new replies from our support team.
              </p>
            </div>

            {/* Messages */}
            <div className="space-y-4 mb-6">
              {topicDetail.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.is_admin_reply ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.is_admin_reply
                        ? 'bg-muted'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold">
                        {message.is_admin_reply ? 'Support Team' : 'You'}
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
            {topicDetail.status !== SupportTopicStatus.RESOLVED && (
              <form onSubmit={handleAddReply} className="space-y-4">
                <Textarea
                  placeholder="Type your reply here..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={4}
                  required
                />
                <Button type="submit" disabled={replying || !replyMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  {replying ? 'Sending...' : 'Send Reply'}
                </Button>
              </form>
            )}

            {topicDetail.status === SupportTopicStatus.RESOLVED && (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                <p className="text-sm text-green-800 dark:text-green-200">
                  This topic has been marked as resolved. If you need further assistance, please create a new topic.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Help Center</h1>
        <p className="text-muted-foreground">
          Get help with your questions or report issues. Our support team is here to assist you.
        </p>
      </div>

      {/* Create new topic form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Create New Support Topic</CardTitle>
          <CardDescription>
            Have a question or need help? Create a new topic and we will get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTopic} className="space-y-4">
            <div>
              <Input
                placeholder="Topic title (e.g., 'Unable to add expense')"
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                required
                maxLength={255}
              />
            </div>
            <div>
              <Textarea
                placeholder="Describe your issue or question in detail..."
                value={newTopicMessage}
                onChange={(e) => setNewTopicMessage(e.target.value)}
                rows={4}
                required
              />
            </div>
            <Button type="submit" disabled={creating}>
              <MessageSquare className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Create Topic'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Topics list */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Your Support Topics</h2>

        {topicsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : topics && topics.length > 0 ? (
          <div className="space-y-4">
            {topics.map((topic) => (
              <Card
                key={topic.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTopicId(topic.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{topic.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Created {formatDistanceToNow(new Date(topic.created_at))} ago
                        {topic.last_message_at && (
                          <> · Last activity {formatDistanceToNow(new Date(topic.last_message_at))} ago</>
                        )}
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
              <p className="text-muted-foreground mb-2">No support topics yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first topic above to get help from our support team.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
