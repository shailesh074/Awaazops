import { z } from "zod";

export const ORDER_STATUSES = [
  "OUT_FOR_DELIVERY",
  "ATTEMPTED",
  "RESCHEDULED",
  "DELIVERED",
  "FAILED",
  "ON_HOLD",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

export const orderSchema = z.object({
  /** Canonical stored ID, e.g. "ORD-4821". Agents usually speak only the digits. */
  id: z.string(),
  customerName: z.string(),
  customerPhoneMasked: z.string(),
  addressLine: z.string(),
  locality: z.string(),
  city: z.string(),
  pincode: z.string(),
  status: orderStatusSchema,
  priority: prioritySchema,
  assignedAgentId: z.string().nullable(),
  slotStart: z.iso.datetime(),
  slotEnd: z.iso.datetime(),
  instructions: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Order = z.infer<typeof orderSchema>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  phoneMasked: z.string(),
  hub: z.string(),
  preferredLanguage: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;
