import { pgEnum } from 'drizzle-orm/pg-core';

// Enum for task status
export const taskStatusEnum = ['Pending', 'In Progress', 'Complete', 'Failed', 'Cancelled'];

// Enum for resource type
export const resourceTypeEnum = ['lora'];

// Add other database-related enums here if they need to be shared 
// between server-side schema and client-side type definitions. 