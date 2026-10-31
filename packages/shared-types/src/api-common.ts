import type { IsoDateTime, Uuid } from "./api.js";

/** Spring Data Page JSON. Fields not needed by clients remain server-owned. */
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
  numberOfElements: number;
}

/** app/api/common/error/ApiErrorResponse.java */
export interface ApiFieldViolation {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  timestamp: IsoDateTime;
  status: number;
  code: string;
  message: string;
  path: string;
  errors: ApiFieldViolation[];
}

/** app/api/dto/notification/NotificationResponse.java */
export interface NotificationResponse {
  id: Uuid;
  orderId: Uuid | null;
  queueTicketId: Uuid | null;
  notificationType: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
}
