# Payment & Credit System

## Overview

Reigh uses a credit-based payment system with manual purchases and optional automatic top-ups via Stripe.

| Feature | Details |
|---------|---------|
| **Purchase Range** | $5–$100 in $5 increments |
| **Balance Display** | Dollar format ($10.50), real-time updates |
| **Payment Processor** | Stripe Checkout |

## Credit Usage

- Image generation & AI editing
- Task processing (video travel, upscaling, etc.)
- Advanced AI features

---

## Auto-Top-Up System

### How It Works

| Step | Description |
|------|-------------|
| 1. **Setup** | User enables auto-top-up during first purchase (opt-out default) |
| 2. **Threshold** | Auto-calculates to 20% of purchase amount (adjustable) |
| 3. **Trigger** | When balance drops below threshold |
| 4. **Charge** | Uses saved payment method, credits appear immediately |

### Configuration

| Setting | Range | Default |
|---------|-------|---------|
| **Top-up Amount** | $5–$100 | Mirrors manual purchase amount |
| **Threshold** | $1 to (amount - $1) | 20% of top-up amount |
| **Rate Limit** | Max 1 charge/hour | — |

### Auto-Top-Up States

| State | Indicator | Description |
|-------|-----------|-------------|
| 🟢 **Active** | Green box | Enabled + setup complete |
| 🔵 **Setup Needed** | Blue box | Enabled but needs first purchase |
| 🟡 **Deactivated** | Yellow box | Was setup, now disabled |
| ⚪ **Not Setup** | Gray box | Disabled, no payment method |

---

## Safety Mechanisms

| Mechanism | Purpose |
|-----------|---------|
| **Rate Limiting** | Max 1 auto-charge per hour |
| **Threshold Validation** | Threshold must be < top-up amount |
| **Payment Validation** | Verifies saved method before charging |
| **Failure Logging** | Failed charges logged, user notified |

---

## Integration

### Stripe Integration

- **Checkout**: Creates sessions for manual purchases
- **Webhooks**: Handles payment confirmations
- **Saved Methods**: Stored securely for auto-top-up
- **Off-Session Charging**: Background charges when threshold triggered

### Transaction Flow

```
Manual Purchase → Stripe Checkout → Webhook → Credits Added
Auto Top-Up → Saved Method → Off-Session Charge → Credits Added
```

### Database

- `users.credits` — Current balance
- `credits_ledger` — Transaction audit log (immutable)

---

## User Interface

### Purchase Flow
1. Slider: $5–$100 amount selection
2. Checkbox: Auto-top-up enable (default: checked)
3. Button: "Add $X" or "Add $X and set-up auto-top-up"

### Mobile vs Desktop

| Feature | Mobile | Desktop |
|---------|--------|---------|
| Tabs | Add Credits, History, Task Log | Same |
| Task Log Filtering | Basic | Advanced (cost, status, type, project) |
| CSV Export | Limited | Full |

---

## Current Limitations

| Area | Limitation |
|------|------------|
| **Payment Methods** | Single saved method per user |
| **Currency** | USD only |
| **Scheduling** | No time-based controls |
| **Spending Limits** | No daily/monthly caps |
| **Notifications** | No email for auto-charges |

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Auto-top-up not triggering | Is balance actually below threshold? Is feature enabled? |
| Failed charges | Payment method valid? Check Stripe dashboard |
| Credits not appearing | Check webhook logs, verify transaction in `credits_ledger` |

---

<div align="center">

**📚 Related**

[Edge Functions](./edge_functions.md) • [Database & Storage](./db_and_storage.md)

</div>
