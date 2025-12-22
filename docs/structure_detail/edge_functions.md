# Edge Functions Reference

> **Overview**: Supabase Edge Functions handle backend operations including AI processing, payments, and task management.

---

## 🚀 Active Functions

### AI & Task Processing

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| **`single-image-generate`** | FAL image generation | Tool parameters, prompts | Task ID |
| **`steerable-motion`** | Video generation | Motion parameters, images | Task ID |
| **`ai-prompt`** | Prompt enhancement | Base prompt, creativity level | Enhanced prompt |
| **`calculate-task-cost`** | Credit calculation | Tool ID, parameters | Cost estimate |

### Task Queue Management

| Function | Purpose | Description |
|----------|---------|-------------|
| **`create-task`** | Task creation | Validates credits, creates queued task |
| **`claim-next-task`** | Worker polling | Returns next available task for processing. Uses model affinity to prefer tasks matching worker's current model |
| **`complete_task`** | Task completion | Handles task output, creates generations/variants, deducts credits. Supports `create_as_generation` flag to force new generation instead of variant when `based_on` is present |
| **`update-task-status`** | Status updates | Real-time task status broadcasting |
| **`update-worker-model`** | Worker model tracking | Workers call this to report their currently loaded model for task affinity matching |
| **`update-shot-pair-prompts`** | Metadata updates | Updates shot_generations metadata (pair_prompt, enhanced_prompt, etc.) from orchestrator task |

### Payment Processing

| Function | Purpose | Features |
|----------|---------|----------|
| **`stripe-checkout`** | Payment sessions | Creates Stripe checkout sessions |
| **`stripe-webhook`** | Payment webhooks | Handles payment confirmations, credits top-ups |
| **`grant-credits`** | Credit management | Admin credit allocation |

### Authentication & Security

| Function | Purpose | Usage |
|----------|---------|-------|
| **`generate-pat`** | Personal Access Tokens | Creates PAT tokens for local workers |
| **`revoke-pat`** | Token revocation | Invalidates PAT tokens |

---

## 📋 Function Categories

### Real-time Operations
- Task status broadcasts
- Generation creation triggers
- Credit balance updates

### External Integrations
- **FAL-AI**: Image/video generation APIs
- **Stripe**: Payment processing
- **Groq**: AI prompt enhancement

### Database Operations
- Task queue management
- Generation lifecycle
- User credit tracking

---

## 🔧 Development Notes

### Authentication Patterns
- **PAT Tokens**: Use for external worker authentication - secure, revocable
- **Service Role**: Use for cloud-based processing - higher privileges, rate-limited

### Performance Considerations
- Task completion now uses SQL triggers instead of Edge Functions for better performance
- Batch operations where possible to reduce function invocation costs
- Use database functions for complex queries rather than multiple API calls

### Integration Points
- **External Workers**: Functions expect Headless-Wan2GP format for task payloads
- **Real-time Updates**: All status changes broadcast via Supabase Realtime
- **Error Handling**: Functions return standardized error formats for consistent UI handling

---

## 🔗 Related Documentation

- [Task Worker Lifecycle](task_worker_lifecycle.md) - Complete task processing flow
- [Database & Storage](db_and_storage.md) - Schema and triggers
- [Data Persistence](data_persistence.md) - State management patterns
