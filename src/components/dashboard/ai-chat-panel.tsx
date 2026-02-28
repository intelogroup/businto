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
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/50 shadow-sm mt-3 space-y-4"
    >
        <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm ring-4 ring-indigo-50/50">
                <Bus className="h-6 w-6" />
            </div>
            <div>
                <p className="font-bold text-neutral-900 text-sm tracking-tight">3 Premium Vehicles Found</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <Sparkles className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <p className="text-[11px] font-medium text-neutral-500">Matching your school run route</p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pb-1">
            <div className="bg-white/60 p-3 rounded-xl border border-white/40">
                <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mb-1">Cheapest</p>
                <p className="font-bold text-neutral-900">$1,250</p>
            </div>
            <div className="bg-indigo-600 p-3 rounded-xl shadow-sm shadow-indigo-200">
                <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-200 mb-1">Fastest</p>
                <p className="font-bold text-white">$1,480</p>
            </div>
        </div>

        <Button size="sm" className="w-full bg-neutral-900 hover:bg-black text-white h-10 text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
            Compare Deep Quotes <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
    </motion.div>
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
                content: "Smarter routing for private rides. How can I help today?",
            }
        ],
    } as any);

    const isLoading = status === 'streaming' || status === 'submitted';

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[AIChatPanel] Submitting via sendMessage:', input);
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
            // In a real app, this would use the Web Speech API
            // For this demo, we'll just simulate a recognized command
            setTimeout(() => {
                setInput("Find me a school bus for tomorrow morning.");
                setIsListening(false);
            }, 3000);
        } else {
            setIsListening(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[AIChatPanel] Form submitted with input:', input);
        if (!input?.trim()) return;
        handleSubmit(e);
    };

    return (
        <Card className="h-full flex flex-col border border-neutral-200 shadow-none bg-white rounded-2xl overflow-hidden relative" style={{ boxShadow: 'none' }}>

            <div className="flex-1 relative overflow-hidden flex flex-col h-full">
                {/* Header - Overlaid with backdrop blur - Reduced height */}
                <CardHeader className="absolute top-0 w-full bg-white px-5 py-2 flex flex-row items-center justify-between z-30 border-b border-neutral-100">
                    <div className="flex items-center gap-2.5">
                        <div className="relative">
                            <div className="h-9 w-9 rounded-xl bg-neutral-900 flex items-center justify-center overflow-hidden">
                                <img src="/brand-mark.svg" alt="Businto AI" className="w-6 h-6 outline-none" />
                            </div>
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold text-neutral-900 tracking-tight">
                                Businto AI
                            </CardTitle>
                        </div>
                    </div>

                </CardHeader>

                {/* Chat Area - Full height with spacer for header */}
                <div className="flex-1 overflow-hidden relative z-10 bg-neutral-50">
                    <ScrollArea className="h-full w-full" style={{ overscrollBehaviorY: 'contain' }}>
                        {/* Header Spacer - approximately 52px (py-2 + content) */}
                        <div className="h-[52px]" />

                        <div className="px-5 py-5 space-y-6 min-h-full flex flex-col">
                            <div className="flex-1 space-y-6">
                                {messages.map((msg: Message) => (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 15, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                        className={cn(
                                            "flex gap-3 w-full",
                                            msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                        )}
                                    >
                                        {msg.role === "assistant" && (
                                            <div className="h-8 w-8 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-neutral-200 mt-1">
                                                <img src="/brand-mark.svg" alt="AI" className="w-4 h-4 invert" />
                                            </div>
                                        )}
                                        <div className={cn(
                                            "max-w-[80%] flex flex-col gap-1",
                                            msg.role === "user" ? "items-end" : "items-start"
                                        )}>
                                            <div className={cn(
                                                "rounded-2xl px-4 py-2.5 text-sm shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] leading-relaxed tracking-tight transition-all duration-300",
                                                msg.role === "assistant"
                                                    ? "bg-white border border-neutral-100 text-neutral-800 rounded-tl-none font-medium"
                                                    : "bg-neutral-900 text-white rounded-tr-none px-5 font-medium"
                                            )}>
                                                {msg.content}
                                                {msg.role === "assistant" && msg.content.includes("Vehicles Found") && (
                                                    <div className="w-full">
                                                        {MOCK_WIDGET}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 opacity-50">
                                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest" suppressHydrationWarning>
                                                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}

                                {isLoading && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex gap-3"
                                    >
                                        <div className="bg-white px-4 py-2.5 rounded-2xl rounded-tl-none border border-neutral-200 flex gap-1.5 items-center">
                                            {[0, 1, 2].map((i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={{ y: [0, -3, 0] }}
                                                    transition={{
                                                        repeat: Infinity,
                                                        duration: 0.8,
                                                        delay: i * 0.15,
                                                        ease: "easeInOut"
                                                    }}
                                                    className="h-1.5 w-1.5 bg-indigo-400 rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                            <div ref={scrollRef} className="h-px" />
                            {/* Footer Spacer - approximately 20px buffer before line */}
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
                                className="absolute inset-0 bg-white/95 backdrop-blur-xl z-30 flex flex-col items-center justify-center text-center p-8"
                            >
                                <div className="relative mb-8">
                                    <motion.div
                                        animate={{
                                            scale: [1, 1.4, 1],
                                            opacity: [0.5, 0.2, 0.5]
                                        }}
                                        transition={{ repeat: Infinity, duration: 2 }}
                                        className="absolute inset-0 rounded-full bg-indigo-500 blur-2xl"
                                    />
                                    <motion.div
                                        animate={{
                                            scale: [1, 1.1, 1],
                                            rotate: [0, 5, -5, 0]
                                        }}
                                        transition={{ repeat: Infinity, duration: 3 }}
                                        className="relative h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-xl shadow-indigo-200 ring-8 ring-white"
                                    >
                                        <Mic className="h-8 w-8" />
                                    </motion.div>
                                </div>
                                <h3 className="text-xl font-bold text-neutral-900 mb-2 tracking-tight">AI Listening...</h3>
                                <p className="text-neutral-500 font-medium text-sm max-w-[200px]">I&apos;m ready for your voice command.</p>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsListening(false)}
                                    className="mt-10 rounded-xl border-neutral-200 text-neutral-600 px-6 font-bold hover:bg-neutral-50"
                                >
                                    Stop Listening
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <CardFooter className="px-5 py-2 bg-white border-t border-neutral-100 flex flex-col gap-2 relative z-30">
                    <form
                        className="flex w-full items-center gap-2 group transition-all duration-300"
                        onSubmit={handleSubmit}
                    >
                        <div className="flex-1 relative flex items-center">
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className={cn(
                                    "absolute left-1 h-8 w-8 rounded-lg shrink-0 transition-colors z-10",
                                    isListening ? "bg-rose-50 text-rose-500" : "text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50"
                                )}
                                onClick={toggleListening}
                            >
                                <Mic className="h-4 w-4" />
                            </Button>
                            <Input
                                placeholder="How can I help you?"
                                value={input}
                                onChange={handleInputChange}
                                className="pl-10 pr-4 h-10 rounded-xl bg-white border-neutral-200 focus:bg-white text-sm placeholder:text-neutral-400 shadow-none transition-colors focus-visible:ring-0 focus-visible:border-neutral-900"
                            />
                        </div>
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input?.trim() || isLoading}
                            onClick={() => console.log('[AIChatPanel] Send button clicked, input:', input)}
                            className="h-10 w-10 rounded-xl bg-neutral-900 hover:bg-black text-white disabled:opacity-30 shadow-none shrink-0 transition-all hover:scale-105 active:scale-95"
                        >
                            <Send className="h-4.5 w-4.5" />
                        </Button>
                    </form>
                </CardFooter>
            </div>
        </Card>
    );
}
