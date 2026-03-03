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
import { Sparkles } from "lucide-react";

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fetch AI suggestions when new messages arrive
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (messages.length === 0 || loadingSuggestions) return;
      
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_id === user?.id) {
        setSuggestions([]); // Don't suggest if user was the last sender
        return;
      }

      setLoadingSuggestions(true);
      try {
        const response = await fetch('/api/chat/suggestions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': user?.id || ''
          },
          body: JSON.stringify({
            messages: messages.slice(-5),
            requestId,
            bookingId,
            role: user?.role === 'operator' ? 'operator' : 'user'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error("Failed to fetch suggestions:", err);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 1000); // Debounce
    return () => clearTimeout(timer);
  }, [messages, user?.id, user?.role, requestId, bookingId]);

  useEffect(() => {
    // Mark unread messages as read
    const unreadIds = messages
      .filter(m => m.recipient_id === user?.id && !m.is_read)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  }, [messages, user?.id, markAsRead]);

  const handleSend = async (content?: string) => {
    const text = content || inputValue.trim();
    if (!text || sending) return;

    try {
      setSending(true);
      await sendMessage(recipientId, text);
      if (!content) setInputValue("");
      setSuggestions([]);
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
    <div className="flex flex-col h-full bg-white rounded-md border border-neutral-200">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-neutral-100 bg-white/30">
        <Avatar className="h-9 w-9 border border-neutral-200">
          <AvatarImage src={recipientAvatar} />
          <AvatarFallback className="bg-white">
            <User className="h-4 w-4 text-neutral-400" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">{recipientName}</h3>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
            {requestId ? "Request Channel" : "Booking Confirmed"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 bg-white/30">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-5 w-5 border-2 border-neutral-900 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-neutral-400 text-sm font-medium">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex justify-center mb-6">
                  <span className="text-[10px] font-bold text-neutral-400 bg-white border border-neutral-200 px-3 py-1 rounded-full uppercase tracking-wider">
                    {date}
                  </span>
                </div>
                <div className="space-y-4">
                  {dateMessages.map((message) => {
                    const isOwn = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          isOwn ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        {!isOwn && (
                          <Avatar className="h-7 w-7 shrink-0 border border-neutral-100">
                            <AvatarImage src={message.sender?.avatar_url} />
                            <AvatarFallback className="bg-white text-[10px] font-bold">
                              {message.sender?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            "max-w-[80%] rounded-md px-3.5 py-2 shadow-sm transition-colors duration-150",
                            isOwn
                              ? "bg-neutral-900 text-white rounded-tr-none"
                              : "bg-white border border-neutral-200 text-neutral-900 rounded-tl-none"
                          )}
                        >
                          <p className="text-sm leading-relaxed">{message.content}</p>
                          <p
                            className={cn(
                              "text-[9px] mt-1.5 font-medium uppercase tracking-tight",
                              isOwn ? "text-neutral-400" : "text-neutral-400"
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

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-3 bg-white border-t border-neutral-100 flex flex-wrap gap-2">
          <div className="w-full flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3 w-3 text-neutral-400" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">AI Suggested Reply</span>
          </div>
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={sending}
              className="text-[11px] font-medium bg-white border border-neutral-200 hover:border-neutral-900 hover:bg-white text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-md transition-colors duration-150 text-left max-w-full"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white border-t border-neutral-100">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 h-10 rounded-md border-neutral-200 text-sm focus-visible:ring-neutral-900"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || sending}
            className="h-10 w-10 bg-neutral-900 hover:bg-black text-white shrink-0 rounded-md transition-colors"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
