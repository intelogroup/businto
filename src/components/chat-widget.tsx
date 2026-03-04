"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Mic } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "@ai-sdk/react";

const QUICK_PROMPTS = [
    "Check my trips",
    "How does quoting work?",
    "What services do you offer?",
];

function renderMarkdown(text: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        // bold: **text**
        const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        if (/^[-*]\s/.test(line)) {
            return (
                <li
                    key={i}
                    className="ml-4 list-disc"
                    dangerouslySetInnerHTML={{ __html: bolded.replace(/^[-*]\s/, '') }}
                />
            );
        }
        return bolded ? (
            <p key={i} className="mb-0.5 last:mb-0" dangerouslySetInnerHTML={{ __html: bolded }} />
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

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
        api: '/api/chat',
        initialMessages: [
            {
                id: 'welcome',
                role: 'assistant',
                content: 'Welcome to Businto Live Dispatch. I can help you with trip statuses, service details, or help you start a new request. How can I assist you today?'
            }
        ]
    } as any) as any;

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input?.trim()) return;
        handleSubmit(e);
    };

    const sendQuickPrompt = (prompt: string) => {
        append({ role: 'user', content: prompt });
    };

    const showChips = messages.length === 1 && messages[0]?.id === 'welcome';

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className="mb-4"
                    >
                        <Card className="w-[380px] shadow-2xl border border-neutral-300 overflow-hidden rounded-lg">
                            <CardHeader className="bg-neutral-900 text-white p-4 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center border border-white/10">
                                        <Image
                                            src="/brand-mark.svg"
                                            alt="Businto"
                                            width={18}
                                            height={18}
                                        />
                                    </div>
                                    Live Dispatch Assistant
                                </CardTitle>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-white hover:bg-white/20"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 h-[520px] flex flex-col bg-white">
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-4">
                                        {messages.map((m: any) => (
                                            <div
                                                key={m.id}
                                                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                                            >
                                                {m.role === 'assistant' && (
                                                    <div className="h-8 w-8 shrink-0 rounded-full bg-black flex items-center justify-center">
                                                        <Image
                                                            src="/brand-mark.svg"
                                                            alt="Businto"
                                                            width={20}
                                                            height={20}
                                                        />
                                                    </div>
                                                )}
                                                <div className={`max-w-[85%] flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <div
                                                        className={`p-3 rounded-lg text-sm ${
                                                            m.role === 'user'
                                                                ? 'bg-neutral-900 text-white rounded-tr-none'
                                                                : 'bg-white text-neutral-800 rounded-tl-none border border-neutral-200'
                                                        }`}
                                                    >
                                                        {m.role === 'assistant'
                                                            ? <div className="prose-sm leading-relaxed">{renderMarkdown(m.content)}</div>
                                                            : m.content
                                                        }
                                                    </div>
                                                    {m.role === 'assistant' && <TripMentionBadge content={m.content} />}
                                                    {/* Quick action chips below welcome message */}
                                                    {m.id === 'welcome' && showChips && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {QUICK_PROMPTS.map((prompt) => (
                                                                <button
                                                                    key={prompt}
                                                                    onClick={() => sendQuickPrompt(prompt)}
                                                                    disabled={isLoading}
                                                                    className="text-[11px] px-2.5 py-1 rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:border-neutral-400 transition-colors font-medium disabled:opacity-40"
                                                                >
                                                                    {prompt}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {m.createdAt && (
                                                        <span className="text-[10px] text-neutral-400 mt-1 px-0.5">
                                                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Typing indicator */}
                                        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                                            <div className="flex gap-2">
                                                <div className="h-8 w-8 shrink-0 rounded-full bg-black flex items-center justify-center">
                                                    <Image src="/brand-mark.svg" alt="Businto" width={20} height={20} />
                                                </div>
                                                <div className="bg-white p-3 rounded-lg rounded-tl-none border border-neutral-200 flex items-center gap-1">
                                                    {[0, 0.15, 0.3].map((delay, i) => (
                                                        <motion.div
                                                            key={i}
                                                            className="w-1.5 h-1.5 rounded-full bg-neutral-400"
                                                            animate={{ y: [0, -4, 0] }}
                                                            transition={{ duration: 0.6, repeat: Infinity, delay, ease: "easeInOut" }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div ref={scrollRef} />
                                    </div>
                                </ScrollArea>
                                <div className="p-3 border-t border-neutral-200 bg-white">
                                    <form className="flex gap-2" onSubmit={handleFormSubmit}>
                                        <Button type="button" size="icon" variant="outline" className="shrink-0 bg-white border-neutral-200 hover:bg-white hover:text-indigo-600 rounded-lg">
                                            <Mic className="w-4 h-4" />
                                        </Button>
                                        <Input
                                            value={input}
                                            onChange={handleInputChange}
                                            placeholder="Ask dispatch anything..."
                                            className="bg-white border-neutral-200 focus-visible:ring-0 focus-visible:border-neutral-900 rounded-lg h-10"
                                        />
                                        <Button
                                            type="submit"
                                            size="icon"
                                            className="bg-neutral-900 hover:bg-black rounded-lg shrink-0 h-10 w-10 shadow-sm"
                                            disabled={!(input || '').trim() || isLoading}
                                        >
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </form>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                    onClick={() => setIsOpen(!isOpen)}
                    className="h-14 w-14 rounded-full bg-neutral-900 hover:bg-black text-white shadow-2xl flex items-center justify-center p-0 border border-white/10"
                >
                    {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
                </Button>
            </motion.div>
        </div>
    );
}
