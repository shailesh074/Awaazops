/** DEMO agents and orders (Bengaluru, demo day). Names and phone numbers are fictional. */
import type { Agent, Order, OrderStatus, Priority } from "@/domain";
import { ist } from "./build";

export const DEMO_AGENT_ID = "AG-101";

export const AGENTS: Agent[] = [
  { id: "AG-101", name: "Ravi Kumar", phoneMasked: "+91 98•••• 4410", hub: "Koramangala", preferredLanguage: "hi-en" },
  { id: "AG-102", name: "Sana Sheikh", phoneMasked: "+91 97•••• 1189", hub: "HSR Layout", preferredLanguage: "hi-en" },
  { id: "AG-103", name: "Arjun Nair", phoneMasked: "+91 99•••• 7302", hub: "Indiranagar", preferredLanguage: "en" },
  { id: "AG-104", name: "Pooja Yadav", phoneMasked: "+91 96•••• 5521", hub: "Whitefield", preferredLanguage: "hi" },
  { id: "AG-105", name: "Imran Khan", phoneMasked: "+91 98•••• 0937", hub: "Jayanagar", preferredLanguage: "hi-en" },
  { id: "AG-106", name: "Deepak Rawat", phoneMasked: "+91 95•••• 6648", hub: "BTM Layout", preferredLanguage: "hi" },
];

type OrderRow = [
  id: string,
  customer: string,
  address: string,
  locality: string,
  pincode: string,
  status: OrderStatus,
  priority: Priority,
  agent: string | null,
  slot: [string, string],
  instructions: string | null,
  updated: string,
];

const ROWS: OrderRow[] = [
  ["ORD-4821", "Meera Iyer", "Flat 12B, Prestige Acropolis", "Koramangala", "560095", "ATTEMPTED", "HIGH", "AG-101", ["13:00", "15:00"], null, "14:12"],
  ["ORD-4907", "Karthik Rao", "Tower 4, Salarpuria Greenage", "Koramangala", "560068", "OUT_FOR_DELIVERY", "MEDIUM", "AG-101", ["15:00", "17:00"], "Leave at reception desk", "13:48"],
  ["ORD-4935", "Ananya Gupta", "221, 5th Cross, 6th Block", "Koramangala", "560095", "DELIVERED", "LOW", "AG-101", ["10:00", "12:00"], null, "11:21"],
  ["ORD-4952", "Rohit Menon", "Villa 8, Adarsh Palm Retreat", "Koramangala", "560103", "OUT_FOR_DELIVERY", "MEDIUM", "AG-101", ["16:00", "18:00"], null, "09:05"],
  ["ORD-5307", "Farah Ali", "Flat 204, Sobha Daffodil, Sector 3", "HSR Layout", "560102", "ON_HOLD", "HIGH", "AG-102", ["12:00", "14:00"], "Corrected: flat 204 (not 402)", "12:41"],
  ["ORD-5590", "Vikram Joshi", "88, 27th Main, Sector 1", "HSR Layout", "560102", "RESCHEDULED", "MEDIUM", "AG-102", ["11:00", "13:00"], null, "11:37"],
  ["ORD-3388", "Neha Kulkarni", "Flat 7C, Mantri Paradise", "HSR Layout", "560076", "OUT_FOR_DELIVERY", "MEDIUM", "AG-102", ["14:00", "16:00"], null, "09:12"],
  ["ORD-5412", "Siddharth Bose", "14, 19th Main, Sector 4", "HSR Layout", "560102", "DELIVERED", "LOW", "AG-102", ["09:00", "11:00"], null, "10:02"],
  ["ORD-7761", "Lakshmi Pillai", "3rd Floor, 100 Ft Road", "Indiranagar", "560038", "OUT_FOR_DELIVERY", "MEDIUM", "AG-103", ["13:00", "15:00"], null, "09:20"],
  ["ORD-4410", "Aditya Shetty", "Flat 3A, 12th Main, HAL 2nd Stage", "Indiranagar", "560008", "ATTEMPTED", "HIGH", "AG-103", ["12:00", "14:00"], null, "13:26"],
  ["ORD-7802", "Priya Raman", "56, CMH Road", "Indiranagar", "560038", "DELIVERED", "LOW", "AG-103", ["10:00", "12:00"], null, "10:48"],
  ["ORD-6655", "Harsh Vardhan", "Plot 41, ITPL Main Road", "Whitefield", "560066", "ON_HOLD", "HIGH", "AG-104", ["11:00", "13:00"], null, "12:09"],
  ["ORD-6702", "Divya Menon", "Flat 1102, Prestige Shantiniketan", "Whitefield", "560048", "OUT_FOR_DELIVERY", "MEDIUM", "AG-104", ["15:00", "17:00"], null, "09:31"],
  ["ORD-6731", "Sameer Kapoor", "Tower B, Brigade Metropolis", "Whitefield", "560048", "DELIVERED", "LOW", "AG-104", ["09:00", "11:00"], null, "09:58"],
  ["ORD-6120", "Asha Reddy", "17, 9th Block, East End", "Jayanagar", "560069", "FAILED", "CRITICAL", "AG-105", ["11:00", "13:00"], null, "11:56"],
  ["ORD-6188", "Tanvi Desai", "402, 4th T Block", "Jayanagar", "560041", "OUT_FOR_DELIVERY", "MEDIUM", "AG-105", ["14:00", "16:00"], null, "09:40"],
  ["ORD-6214", "Nikhil Jain", "29, 11th Main, 3rd Block", "Jayanagar", "560011", "DELIVERED", "LOW", "AG-105", ["10:00", "12:00"], null, "10:33"],
  ["ORD-2290", "Kavya Hegde", "Flat 5, 16th Main, BTM 2nd Stage", "BTM Layout", "560076", "RESCHEDULED", "MEDIUM", "AG-106", ["10:00", "12:00"], null, "10:52"],
  ["ORD-2315", "Manoj Tiwari", "73, 7th Cross, BTM 1st Stage", "BTM Layout", "560029", "OUT_FOR_DELIVERY", "LOW", "AG-106", ["13:00", "15:00"], null, "09:14"],
  ["ORD-2342", "Ritu Saxena", "Flat 9D, Shobha Hibiscus", "BTM Layout", "560076", "DELIVERED", "LOW", "AG-106", ["09:00", "11:00"], null, "09:47"],
  ["ORD-2368", "Gaurav Singh", "12, 2nd Main, Madiwala", "BTM Layout", "560068", "OUT_FOR_DELIVERY", "MEDIUM", "AG-106", ["16:00", "18:00"], null, "09:16"],
  ["ORD-4999", "Shreya Das", "Flat 6, 4th Cross, Ejipura", "Koramangala", "560047", "OUT_FOR_DELIVERY", "LOW", null, ["17:00", "19:00"], null, "08:55"],
];

export const ORDERS: Order[] = ROWS.map(
  ([id, customerName, addressLine, locality, pincode, status, priority, assignedAgentId, slot, instructions, updated]) => ({
    id,
    customerName,
    customerPhoneMasked: "+91 •••••• " + id.slice(-4),
    addressLine,
    locality,
    city: "Bengaluru",
    pincode,
    status,
    priority,
    assignedAgentId,
    slotStart: ist(slot[0]),
    slotEnd: ist(slot[1]),
    instructions,
    updatedAt: ist(updated),
  }),
);
