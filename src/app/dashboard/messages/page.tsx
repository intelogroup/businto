"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageThread } from "@/components/chat/message-thread";
import { useAuth } from "@/hooks/use-auth";
import {
  MessageSquare,
  ArrowLeft,
  User,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ThreadSummary {
  threadKey: string;
  requestId: string | null;
  bookingId: string | null;
  otherUser: {
    id: string;
    full_name: string;
    avatar_url?: string;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    isFromMe: boolean;
  };
  unreadCount: number;
  messageCount: number;
}

export default function MessagesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const response = await fetch("/api/messages/threads");
      const data = await response.json();
      if (response.ok) {
        setThreads(data.threads || []);
      }
    } catch (error) {
      console.error("Failed to fetch threads:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchThreads();
    }
  }, [user, fetchThreads]);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-20 container mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex justify-center py-24">
            <div className="animate-spin h-6 w-6 border-2 border-neutral-900 border-t-transparent rounded-full" />
          </div>
        </main>
      </div>
    );
  }

  // Thread detail view (mobile-first: full screen)
  if (selectedThread) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-4 container mx-auto max-w-[800px] px-4 sm:px-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              onClick={() => {
                setSelectedThread(null);
                fetchThreads(); // Refresh unread counts
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              All Messages
            </Button>
          </div>
          <div className="h-[calc(100vh-160px)]">
            <MessageThread
              requestId={selectedThread.requestId || undefined}
              bookingId={selectedThread.bookingId || undefined}
              recipientId={selectedThread.otherUser.id}
              recipientName={selectedThread.otherUser.full_name}
              recipientAvatar={selectedThread.otherUser.avatar_url}
            />
          </div>
        </main>
      </div>
    );
  }

  // Thread list view
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20 container mx-auto max-w-[800px] px-4 sm:px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Messages</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchThreads}
            className="h-9 rounded-md"
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin h-6 w-6 border-2 border-neutral-900 border-t-transparent rounded-full" />
          </div>
        ) : threads.length === 0 ? (
          <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                <Inbox className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-1">No Messages Yet</h3>
              <p className="text-neutral-500 text-sm text-center max-w-sm">
                When you start chatting with operators about your trips, conversations will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => (
              <button
                key={thread.threadKey}
                className={cn(
                  "w-full text-left p-4 rounded-lg border bg-white hover:bg-neutral-50 transition-colors duration-100 cursor-pointer",
                  thread.unreadCount > 0
                    ? "border-neutral-300 shadow-sm"
                    : "border-neutral-200"
                )}
                onClick={() => setSelectedThread(thread)}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0 border border-neutral-200">
                    <AvatarImage src={thread.otherUser.avatar_url} />
                    <AvatarFallback className="bg-neutral-900 text-white text-xs font-semibold">
                      {thread.otherUser.full_name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2) || <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={cn(
                          "text-sm truncate",
                          thread.unreadCount > 0
                            ? "font-bold text-neutral-900"
                            : "font-medium text-neutral-700"
                        )}
                      >
                        {thread.otherUser.full_name}
                      </h3>
                      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider shrink-0">
                        {formatRelativeTime(thread.lastMessage.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1 font-bold uppercase tracking-wider border-neutral-200 text-neutral-400 shrink-0"
                      >
                        {thread.requestId ? "Request" : "Booking"}
                      </Badge>
                      {thread.otherUser.role === "operator" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 font-bold uppercase tracking-wider border-sky-200 text-sky-600 shrink-0"
                        >
                          Operator
                        </Badge>
                      )}
                    </div>

                    <p
                      className={cn(
                        "text-xs mt-1 truncate",
                        thread.unreadCount > 0
                          ? "font-semibold text-neutral-800"
                          : "text-neutral-500"
                      )}
                    >
                      {thread.lastMessage.isFromMe ? "You: " : ""}
                      {thread.lastMessage.content}
                    </p>
                  </div>

                  {thread.unreadCount > 0 && (
                    <div className="flex items-center shrink-0 mt-1">
                      <span className="bg-neutral-900 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                        {thread.unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
