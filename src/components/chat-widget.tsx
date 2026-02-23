"use client";

import { useState } from "react";
import { MessageCircle, X, Send, Mic } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);

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
                            <CardHeader className="bg-indigo-600 text-white p-4 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Image
                                        src="/brand-mark.svg"
                                        alt="Businto"
                                        width={18}
                                        height={18}
                                        className="rounded-sm"
                                    />
                                    Businto Live Dispatch
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
                            <CardContent className="p-0 h-[450px] flex flex-col bg-neutral-100">
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                                                AI
                                            </div>
                                            <div className="bg-white p-3 rounded-2xl rounded-tl-none text-sm text-neutral-800 max-w-[80%] border border-neutral-300">
                                                connected to live dispatch. Use voice or text to request a quote or check status.
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                                <div className="p-3 border-t border-neutral-300 bg-white">
                                    <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
                                        <Button size="icon" variant="outline" className="shrink-0 bg-white border-neutral-300 hover:bg-neutral-50 hover:text-indigo-600 rounded-xl">
                                            <Mic className="w-4 h-4" />
                                        </Button>
                                        <Input
                                            placeholder="Message dispatch..."
                                            className="bg-white border-neutral-300 focus-visible:ring-0 focus-visible:bg-white rounded-xl"
                                        />
                                        <Button size="icon" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl">
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
                    className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center p-0"
                >
                    {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
                </Button>
            </motion.div>
        </div>
    );
}
