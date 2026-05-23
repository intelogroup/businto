"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

import { useChat } from "@ai-sdk/react";

const QUICK_PROMPTS = [
    "Check my trips",
    "How does quoting work?",
    "What services do you offer?",
];

const MOCK_WIDGET = (
    <div className="bg-white rounded-lg p-4 border border-neutral-200 mt-3 space-y-4">
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-neutral-900 flex items-center justify-center text-white shrink-0">
                <Bus className="h-5 w-5" />
            </div>
            <div>
                <p className="font-semibold text-neutral-900 text-sm">3 Premium Vehicles Found</p>
                <p className="text-[11px] font-medium text-neutral-500">Matching your school run route</p>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pb-1">
            <div className="bg-white p-3 rounded-md border border-neutral-200">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">Cheapest</p>
                <p className="font-bold text-neutral-900">$1,250</p>
            </div>
            <div className="bg-neutral-900 p-3 rounded-md border border-neutral-900">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-300 mb-1">Fastest</p>
                <p className="font-bold text-white">$1,480</p>
            </div>
        </div>
        <Button size="sm" className="w-full bg-neutral-900 hover:bg-black text-white h-9 text-xs font-semibold rounded-md transition-colors duration-150">
            Compare Deep Quotes <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
    </div>
);

/**
 * Renders simple markdown (bold + lists) using safe React elements.
 * Previously used innerHTML which could allow XSS from AI output.
 */
function renderMarkdown(text: string) {
    const lines = text.split('\n');

    /** Split a line into text and <strong> segments safely. */
    const renderBold = (line: string) => {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
        );
    };

    return lines.map((line, i) => {
        if (/^[-*]\s/.test(line)) {
            return (
                <li key={i} className="ml-4 list-disc">
                    {renderBold(line.replace(/^[-*]\s/, ''))}
                </li>
            );
        }
        return line.trim() ? (
            <p key={i} className="mb-0.5 last:mb-0">{renderBold(line)}</p>
        ) : <br key={i} />;
    });
}

function TripMentionBadge({ content }: { content: string }) {
    const match = content.match(/Trip\s+([A-F0-9]{6,8})/i);
    if (!match) return null;
    return (
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-neutral-50 border border-neutral-200 inline-flex items-center gap-2 text-[11px]">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="font-mono font-semibold text-neutral-700">{match[1].toUpperCase()}</span>
            <span className="text-neutral-400">referenced</span>
        </div>
    );
}

/** Extract plain text from a UIMessage (parts-based) or legacy message (content string). */
function getMsgText(msg: any): string {
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text as string)
            .join('');
    }
    return msg.content ?? '';
}

const SPEECH_SUPPORTED =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const WELCOME_MESSAGE = {
    id: "initial-1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Professional dispatch assistant. How can I help with your logistics today?" }],
};

export function AIChatPanel() {
    const { user } = useAuth();
    const supabase = createClient();

    const sessionIdRef = useRef<string | null>(null);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    const { messages, sendMessage, status, setMessages } = useChat({
        api: '/api/chat',
        initialMessages: [WELCOME_MESSAGE],
    } as any) as any;

    // Load or create a session and fetch message history
    useEffect(() => {
        if (!user) {
            setHistoryLoaded(true);
            return;
        }
        (async () => {
            const { data: session } = await supabase
                .from('ai_chat_sessions')
                .select('id')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();

            let sessionId: string;
            if (session) {
                sessionId = session.id;
            } else {
                const { data: newSession } = await supabase
                    .from('ai_chat_sessions')
                    .insert({ user_id: user.id })
                    .select('id')
                    .single();
                sessionId = newSession!.id;
            }
            sessionIdRef.current = sessionId;

            const { data: dbMessages } = await supabase
                .from('ai_chat_messages')
                .select('id, role, content, created_at')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (dbMessages && dbMessages.length > 0) {
                const loaded = dbMessages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    parts: [{ type: 'text', text: m.content }],
                    createdAt: new Date(m.created_at),
                }));
                setMessages([WELCOME_MESSAGE, ...loaded]);
            }
            setHistoryLoaded(true);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const isLoading = status === 'streaming' || status === 'submitted';

    const [input, setInput] = useState("");
    const [isListening, setIsListening] = useState(false);
    const recognizerRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Prevent browser from auto-focusing the chat input on mount
    useEffect(() => {
        inputRef.current?.blur();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    // Save assistant reply after streaming completes
    const prevStatusRef = useRef(status);
    useEffect(() => {
        if (prevStatusRef.current === 'streaming' && status === 'ready' && sessionIdRef.current) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === 'assistant') {
                const content = getMsgText(lastMsg);
                supabase.from('ai_chat_messages')
                    .insert({ session_id: sessionIdRef.current, role: 'assistant', content })
                    .then(() => {
                        supabase.from('ai_chat_sessions')
                            .update({ updated_at: new Date().toISOString() })
                            .eq('id', sessionIdRef.current!);
                    });
            }
        }
        prevStatusRef.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const text = input;
        sendMessage({ text });
        setInput("");
        // Save user message immediately
        if (sessionIdRef.current) {
            supabase.from('ai_chat_messages')
                .insert({ session_id: sessionIdRef.current, role: 'user', content: text });
        }
    };

    if (!historyLoaded) return null;

    const toggleListening = () => {
        if (!SPEECH_SUPPORTED) return;

        if (isListening) {
            recognizerRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognizer = new SpeechRecognition();
        recognizer.lang = 'en-US';
        recognizer.continuous = false;
        recognizer.interimResults = false;

        recognizer.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            sendMessage({ text: transcript });
        };

        recognizer.onerror = () => setIsListening(false);
        recognizer.onend = () => setIsListening(false);

        recognizer.start();
        recognizerRef.current = recognizer;
        setIsListening(true);
    };

    const showChips = messages.length === 1 && messages[0]?.id === 'initial-1';

    return (
        <Card className="flex flex-col h-[640px] border border-neutral-200 bg-white rounded-lg overflow-hidden relative">
            <div className="flex-1 relative overflow-hidden flex flex-col h-full">
                {/* Header */}
                <CardHeader className="absolute top-0 w-full bg-white px-5 py-3 flex flex-row items-center justify-between z-30 border-b border-neutral-200">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-neutral-900 flex items-center justify-center shrink-0">
                            <img src="/brand-mark.svg" alt="Businto AI" className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-sm font-semibold text-neutral-900">
                            Businto Assistant
                        </CardTitle>
                    </div>
                </CardHeader>

                {/* Chat Area */}
                <div className="flex-1 overflow-hidden relative z-10 bg-white">
                    <ScrollArea className="h-full w-full">
                        <div className="h-[56px]" />

                        <div className="px-5 py-5 space-y-6 min-h-full flex flex-col">
                            <div className="flex-1 space-y-6">
                                {messages.map((msg: any) => {
                                    const text = getMsgText(msg);
                                    return (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                "flex gap-3 w-full",
                                                msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            {msg.role === "assistant" && (
                                                <div className="h-7 w-7 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 border border-neutral-200 mt-1">
                                                    <img src="/brand-mark.svg" alt="AI" className="w-3.5 h-3.5 invert" />
                                                </div>
                                            )}
                                            <div className={cn(
                                                "max-w-[85%] flex flex-col gap-1",
                                                msg.role === "user" ? "items-end" : "items-start"
                                            )}>
                                                <div className={cn(
                                                    "rounded-lg px-4 py-2.5 text-sm transition-colors duration-150",
                                                    msg.role === "assistant"
                                                        ? "bg-white border border-neutral-200 text-neutral-800 font-normal"
                                                        : "bg-neutral-900 text-white font-normal"
                                                )}>
                                                    {msg.role === "assistant"
                                                        ? <div className="prose-sm leading-relaxed">{renderMarkdown(text)}</div>
                                                        : text
                                                    }
                                                    {msg.role === "assistant" && text.includes("Vehicles Found") && (
                                                        <div className="w-full">{MOCK_WIDGET}</div>
                                                    )}
                                                </div>
                                                {msg.role === "assistant" && <TripMentionBadge content={text} />}
                                                {/* Quick-prompt chips below welcome message */}
                                                {msg.id === 'initial-1' && showChips && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                                        {QUICK_PROMPTS.map((prompt) => (
                                                            <button
                                                                key={prompt}
                                                                onClick={() => sendMessage({ text: prompt })}
                                                                disabled={isLoading}
                                                                className="text-[11px] px-2.5 py-1 rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:border-neutral-400 transition-colors font-medium disabled:opacity-40"
                                                            >
                                                                {prompt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {msg.createdAt && (
                                                    <span className="text-[10px] font-medium text-neutral-400 px-1 uppercase tracking-wider">
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {isLoading && (
                                    <div className="flex gap-3">
                                        <div className="bg-white px-4 py-2.5 rounded-lg border border-neutral-200 flex gap-1.5 items-center">
                                            {[0, 1, 2].map((i) => (
                                                <div key={i} className="h-1.5 w-1.5 bg-neutral-300 rounded-full animate-pulse" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div ref={scrollRef} className="h-px" />
                            <div className="h-[20px]" />
                        </div>
                    </ScrollArea>

                    {/* Listening Overlay */}
                    <AnimatePresence>
                        {isListening && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center text-center p-8"
                            >
                                <div className="h-16 w-16 rounded-full bg-neutral-900 text-white flex items-center justify-center mb-6">
                                    <Mic className="h-6 w-6" />
                                </div>
                                <h3 className="text-lg font-semibold text-neutral-900 mb-1">Listening...</h3>
                                <p className="text-neutral-500 text-sm">Speak your request.</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={toggleListening}
                                    className="mt-8 rounded-md border-neutral-200 text-neutral-600 px-6 font-semibold"
                                >
                                    Cancel
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <CardFooter className="px-5 py-3 bg-white border-t border-neutral-200 relative z-30">
                    <form className="flex w-full items-center gap-2" onSubmit={handleSubmit}>
                        <div className="flex-1 relative flex items-center">
                            {SPEECH_SUPPORTED && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                        "absolute left-1 h-8 w-8 rounded shrink-0 transition-colors z-10",
                                        isListening ? "text-red-500 bg-red-50" : "text-neutral-400 hover:text-neutral-900"
                                    )}
                                    onClick={toggleListening}
                                >
                                    <Mic className="h-4 w-4" />
                                </Button>
                            )}
                            <Input
                                ref={inputRef}
                                placeholder="How can I help you?"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className={cn(
                                    "pr-4 h-10 rounded-md bg-white border-neutral-200 text-sm placeholder:text-neutral-400 shadow-none focus-visible:ring-0 focus-visible:outline-none",
                                    SPEECH_SUPPORTED ? "pl-10" : "pl-4"
                                )}
                            />
                        </div>
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input.trim() || isLoading}
                            className="h-10 w-10 rounded-md bg-neutral-900 hover:bg-black text-white shrink-0 transition-colors"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </CardFooter>
            </div>
        </Card>
    );
}
