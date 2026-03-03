"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, Sparkles, Bus, ArrowRight, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

import { useChat } from "@ai-sdk/react";

type Message = any;

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
                <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1 text-neutral-300">Fastest</p>
                <p className="font-bold text-white">$1,480</p>
            </div>
        </div>

        <Button size="sm" className="w-full bg-neutral-900 hover:bg-black text-white h-9 text-xs font-semibold rounded-md transition-colors duration-150">
            Compare Deep Quotes <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
    </div>
);

export function AIChatPanel() {
    const { user } = useAuth();
    const router = useRouter();
    const [input, setInput] = useState("");
    const { messages, sendMessage, status, error: chatError } = useChat({
        initialMessages: [
            {
                id: "initial-1",
                role: "assistant",
                content: "Professional dispatch assistant. How can I help with your logistics today?",
            }
        ],
    } as any);

    const isLoading = status === 'streaming' || status === 'submitted';

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        sendMessage({ text: input });
        setInput("");
    };

    const [isListening, setIsListening] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    const toggleListening = () => {
        if (!isListening) {
            setIsListening(true);
            setTimeout(() => {
                setInput("Find me a school bus for tomorrow morning.");
                setIsListening(false);
            }, 3000);
        } else {
            setIsListening(false);
        }
    };

    return (
        <Card className="h-full flex flex-col border border-neutral-200 bg-white rounded-xl overflow-hidden relative">

            <div className="flex-1 relative overflow-hidden flex flex-col h-full">
                {/* Header */}
                <CardHeader className="absolute top-0 w-full bg-white px-5 py-3 flex flex-row items-center justify-between z-30 border-b border-neutral-200">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-neutral-900 flex items-center justify-center shrink-0">
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
                                {messages.map((msg: Message) => (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex gap-3 w-full",
                                            msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                        )}
                                    >
                                        {msg.role === "assistant" && (
                                            <div className="h-7 w-7 rounded bg-neutral-900 flex items-center justify-center shrink-0 border border-neutral-200 mt-1">
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
                                                {msg.content}
                                                {msg.role === "assistant" && msg.content.includes("Vehicles Found") && (
                                                    <div className="w-full">
                                                        {MOCK_WIDGET}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-medium text-neutral-400 px-1 uppercase tracking-wider" suppressHydrationWarning>
                                                {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}

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
                                <h3 className="text-lg font-semibold text-neutral-900 mb-1">AI Listening...</h3>
                                <p className="text-neutral-500 text-sm">Ready for your voice command.</p>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsListening(false)}
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
                            <Input
                                placeholder="How can I help you?"
                                value={input}
                                onChange={handleInputChange}
                                className="pl-10 pr-4 h-10 rounded-md bg-white border-neutral-200 text-sm placeholder:text-neutral-400 shadow-none focus-visible:ring-0 focus-visible:outline-none"
                            />
                        </div>
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input?.trim() || isLoading}
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
