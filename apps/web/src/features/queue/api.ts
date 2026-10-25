// Typed queue API surface. Implementations remain centralized in lib/api for backwards compatibility.
export { listQueueTickets, callQueueTicket, getQueueTrackingStatus, getTicketNotifications } from "@/lib/api";
export type { QueueTicket, QueueTrackingStatus, TicketNotification } from "@/lib/api";
