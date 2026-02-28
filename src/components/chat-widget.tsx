"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Mic, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "@ai-sdk/react";

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
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
        console.log('[ChatWidget] Form submitted with input:', input);
        if (!input?.trim()) return;
        handleSubmit(e);
    };

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
                        <Card className="w-[380px] shadow-2xl border border-neutral-300 overflow-hidden rounded-2xl">
                            <CardHeader className="bg-neutral-900 text-white p-4 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                        <Image
                                            src="/brand-mark.svg"
                                            alt="Businto"
                                            width={14}
                                            height={14}
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
                            <CardContent className="p-0 h-[450px] flex flex-col bg-neutral-50">
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-4">
                                        {messages.map((m: any) => (
                                            <div 
                                                key={m.id} 
                                                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                                            >
                                                {m.role === 'assistant' && (
                                                    <div className="h-8 w-8 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-[10px] font-bold border border-indigo-200">
                                                        AI
                                                    </div>
                                                )}
                                                <div 
                                                    className={`p-3 rounded-2xl text-sm max-w-[85%] ${
                                                        m.role === 'user' 
                                                            ? 'bg-neutral-900 text-white rounded-tr-none' 
                                                            : 'bg-white text-neutral-800 rounded-tl-none border border-neutral-200'
                                                    }`}
                                                >
                                                    {m.content}
                                                </div>
                                            </div>
                                        ))}
                                        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                                            <div className="flex gap-2">
                                                <div className="h-8 w-8 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-[10px] font-bold border border-indigo-200 animate-pulse">
                                                    AI
                                                </div>
                                                <div className="bg-white p-3 rounded-2xl rounded-tl-none text-sm text-neutral-400 border border-neutral-200 flex items-center gap-2">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    Typing...
                                                </div>
                                            </div>
                                        )}
                                        <div ref={scrollRef} />
                                    </div>
                                </ScrollArea>
                                <div className="p-3 border-t border-neutral-200 bg-white">
                                    <form className="flex gap-2" onSubmit={handleFormSubmit}>
                                        <Button type="button" size="icon" variant="outline" className="shrink-0 bg-white border-neutral-200 hover:bg-neutral-50 hover:text-indigo-600 rounded-xl">
                                            <Mic className="w-4 h-4" />
                                        </Button>
                                        <Input
                                            value={input}
                                            onChange={handleInputChange}
                                            placeholder="Ask dispatch anything..."
                                            className="bg-white border-neutral-200 focus-visible:ring-0 focus-visible:border-neutral-900 rounded-xl h-10"
                                        />
                                        <Button 
                                            type="submit" 
                                            size="icon" 
                                            className="bg-neutral-900 hover:bg-black rounded-xl shrink-0 h-10 w-10 shadow-sm"
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

            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
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
