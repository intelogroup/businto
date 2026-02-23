"use client";

import { useState, useRef, useEffect } from "react";
import { Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMessages, Message } from "@/hooks/use-messages";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface MessageThreadProps {
  requestId?: string;
  bookingId?: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
}

export function MessageThread({
  requestId,
  bookingId,
  recipientId,
  recipientName,
  recipientAvatar
}: MessageThreadProps) {
  const { user } = useAuth();
  const { messages, loading, sendMessage, markAsRead } = useMessages({ requestId, bookingId });
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    // Mark unread messages as read
    const unreadIds = messages
      .filter(m => m.recipient_id === user?.id && !m.is_read)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  }, [messages, user?.id, markAsRead]);

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    try {
      setSending(true);
      await sendMessage(recipientId, inputValue.trim());
      setInputValue("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-neutral-300">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-neutral-200">
        <Avatar className="h-10 w-10">
          <AvatarImage src={recipientAvatar} />
          <AvatarFallback className="bg-neutral-200">
            <User className="h-5 w-5 text-neutral-600" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-semibold text-neutral-900">{recipientName}</h3>
          <p className="text-xs text-neutral-600">
            {requestId ? "Request Chat" : "Booking Chat"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-neutral-600 text-sm">No messages yet</p>
            <p className="text-neutral-500 text-xs mt-1">Send a message to start the conversation</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex justify-center mb-4">
                  <span className="text-xs text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full">
                    {date}
                  </span>
                </div>
                <div className="space-y-3">
                  {dateMessages.map((message) => {
                    const isOwn = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-2",
                          isOwn ? "flex-row-reverse" : ""
                        )}
                      >
                        {!isOwn && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={message.sender?.avatar_url} />
                            <AvatarFallback className="bg-neutral-200 text-xs">
                              {message.sender?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            "max-w-[70%] rounded-lg px-3 py-2",
                            isOwn
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-neutral-150 text-neutral-900 rounded-tl-none"
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p
                            className={cn(
                              "text-[10px] mt-1",
                              isOwn ? "text-indigo-200" : "text-neutral-500"
                            )}
                          >
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-neutral-200">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            placeholder="Type a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 h-10"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || sending}
            className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
