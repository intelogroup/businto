"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, Bot, User, Sparkles, Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
    id: string;
    role: "user" | "ai";
    content: string;
    widget?: React.ReactNode;
    timestamp: Date;
}

const MOCK_WIDGET = (
    <div className="bg-white rounded-xl p-4 border border-neutral-100 shadow-sm mt-3 space-y-3">
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Bus className="h-5 w-5" />
            </div>
            <div>
                <p className="font-bold text-neutral-900 text-sm">3 Vehicles Found</p>
                <p className="text-xs text-neutral-500">Matching your requirements</p>
            </div>
        </div>
        <div className="space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Best Option</span>
                <span className="font-bold text-emerald-600">$1,250.00</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full w-[85%] bg-emerald-500 rounded-full" />
            </div>
        </div>
        <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs font-bold rounded-lg">
            View Quotes <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
    </div>
);

export function AIChatPanel() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            role: "ai",
            content: "Hello! I'm your AI Dispatch Assistant. I can help you find routes, manage fleets, or get instant quotes. How can I help today?",
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isTyping]);

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputValue("");
        setIsListening(false);
        setIsTyping(true);

        // Mock AI Response
        setTimeout(() => {
            const newAiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "ai",
                content: "I've analyzed the available operators in your area. Here are some options that match your criteria.",
                widget: MOCK_WIDGET,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, newAiMsg]);
            setIsTyping(false);
        }, 2000);
    };

    const toggleListening = () => {
        if (!isListening) {
            setIsListening(true);
            // Mock speech recognition completion
            setTimeout(() => {
                handleSendMessage("Find me a school bus for tomorrow morning.");
            }, 3000);
        } else {
            setIsListening(false);
        }
    };

    return (
        <Card className="h-full flex flex-col border-none shadow-sm ring-1 ring-black/[0.03] bg-white rounded-xl overflow-hidden relative">
            {/* Header */}
            <CardHeader className="bg-white border-b border-neutral-50 px-4 py-3 flex flex-row items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <div className="h-8 w-8 rounded-md bg-black flex items-center justify-center overflow-hidden">
                            <img src="/brand-mark.svg" alt="Businto AI" className="w-6 h-6" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white"></span>
                        </span>
                    </div>
                    <div>
                        <CardTitle className="text-sm font-semibold text-neutral-900">Businto AI</CardTitle>
                        <p className="text-[10px] font-medium text-neutral-400">Online</p>
                    </div>
                </div>
            </CardHeader>

            {/* Chat Area */}
            <CardContent className="flex-1 p-0 overflow-hidden bg-neutral-50/30 relative">
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none" />

                <ScrollArea className="h-full px-4 py-4">
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${msg.role === "ai" ? "bg-black" : "bg-neutral-900 text-white"
                                    }`}>
                                    {msg.role === "ai" ? <img src="/brand-mark.svg" className="w-5 h-5" alt="AI" /> : <User className="h-4 w-4" />}
                                </div>
                                <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                                    <div className={`p-4 rounded-lg text-sm font-medium shadow-sm ${msg.role === "ai"
                                        ? "bg-white text-neutral-700 rounded-tl-none border border-neutral-100"
                                        : "bg-neutral-900 text-white rounded-tr-none"
                                        }`}>
                                        {msg.content}
                                    </div>
                                    {msg.widget && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            {msg.widget}
                                        </motion.div>
                                    )}
                                    <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wider px-1" suppressHydrationWarning>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </motion.div>
                        ))}

                        {isTyping && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex gap-4"
                            >
                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="bg-white p-4 rounded-lg rounded-tl-none border border-neutral-100 shadow-sm flex gap-1.5 items-center">
                                    <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" />
                                </div>
                            </motion.div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                {/* Listening Overlay */}
                <AnimatePresence>
                    {isListening && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-6"
                        >
                            <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className="h-20 w-20 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-sm"
                            >
                                <Mic className="h-8 w-8" />
                            </motion.div>
                            <h3 className="text-xl font-semibold text-neutral-900 mb-2">Listening...</h3>
                            <p className="text-neutral-500 font-medium">Speak now, I&apos;m listening to your request.</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsListening(false)}
                                className="mt-8 text-neutral-400 hover:text-neutral-900"
                            >
                                Cancel
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>

            {/* Input Area */}
            <CardFooter className="p-3 bg-white border-t border-neutral-50 relative z-30">
                <form
                    className="flex w-full gap-2 relative"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage(inputValue);
                    }}
                >
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={`h-9 w-9 rounded-md shrink-0 ${isListening ? "bg-rose-50 text-rose-500" : "bg-neutral-50 text-neutral-500 hover:bg-neutral-100"}`}
                        onClick={toggleListening}
                    >
                        <Mic className="h-4 w-4" />
                    </Button>
                    <Input
                        placeholder="Type a message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="h-9 rounded-md bg-neutral-50 border-transparent focus:bg-white text-sm placeholder:text-neutral-400"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!inputValue.trim()}
                        className="h-9 w-9 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}
