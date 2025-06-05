import { pgEnum } from 'drizzle-orm/pg-core';

// Enum for task status
export const taskStatusEnum = pgEnum('task_status', ['Pending', 'In Progress', 'Complete', 'Failed', 'Queued', 'Cancelled']);

// Add other database-related enums here if they need to be shared 
// between server-side schema and client-side type definitions. 