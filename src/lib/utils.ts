import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get Tailwind classes for status badge based on trip status
 */
export function getStatusBadgeColor(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "bg-yellow-500 hover:bg-yellow-600",
    matched: "bg-purple-500 hover:bg-purple-600",
    quoted: "bg-blue-500 hover:bg-blue-600",
    booked: "bg-green-500 hover:bg-green-600",
    completed: "bg-white0 hover:bg-neutral-600",
    cancelled: "bg-red-500 hover:bg-red-600",
  };
  
  return statusMap[status] || "bg-neutral-300 hover:bg-neutral-400";
}

/**
 * Get service type display configuration
 */
export function getServiceTypeConfig(serviceType: 'school' | 'medical' | 'wedding') {
  const config = {
    school: { 
      label: 'School Run', 
      badgeClass: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
      iconBg: 'bg-amber-100 text-amber-600'
    },
    medical: { 
      label: 'Care Ride', 
      badgeClass: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
      iconBg: 'bg-sky-100 text-sky-600'
    },
    wedding: { 
      label: 'Event Shuttle', 
      badgeClass: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
      iconBg: 'bg-indigo-100 text-indigo-600'
    },
  };
  
  return config[serviceType] || config.school;
}

/**
 * Format trip date in human-friendly format
 */
export function formatTripDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

/**
 * Format time string (HH:MM:SS or HH:MM) to 12-hour format
 */
export function formatTripTime(timeString: string): string {
  if (!timeString) return 'Not set';
  
  const parts = timeString.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${displayHours}:${minutes} ${ampm}`;
}
