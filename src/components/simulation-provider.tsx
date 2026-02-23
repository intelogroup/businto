"use client";

import { useEffect } from "react";

export function SimulationProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleNewRequest = (event: any) => {
            // Skip if no detail provided (refresh events)
            if (!event.detail || !event.detail.request) return;

            const { request } = event.detail;

            // Simulate 3 operators bidding over 10 seconds
            [3000, 7000, 12000].forEach((delay, index) => {
                setTimeout(() => {
                    const stored = localStorage.getItem('transport_requests');
                    if (stored) {
                        const requests = JSON.parse(stored);
                        const reqIdx = requests.findIndex((r: any) => r.id === request.id);

                        if (reqIdx !== -1) {
                            if (!requests[reqIdx].quotes) requests[reqIdx].quotes = [];

                            const quote = {
                                id: Math.random().toString(36).substr(2, 9),
                                operator: ["Alpha Transit", "Boston Coach", "SafeWay Vans"][index],
                                price: Math.floor(Math.random() * 200) + 100,
                                timestamp: new Date().toISOString()
                            };

                            requests[reqIdx].quotes.push(quote);
                            localStorage.setItem('transport_requests', JSON.stringify(requests));

                            // Notify components (like sidebar) to refresh
                            window.dispatchEvent(new CustomEvent('new-transport-request'));
                        }
                    }
                }, delay);
            });
        };

        window.addEventListener('new-transport-request', handleNewRequest);
        return () => window.removeEventListener('new-transport-request', handleNewRequest);
    }, []);

    return <>{children}</>;
}
