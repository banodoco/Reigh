# Payment & Credit System

> **Current State**: Description of how Reigh's payment and credit management system works today, including manual purchases and automatic top-up functionality.

## Table of Contents

- [1. Payment System Overview](#1-payment-system-overview)
- [2. Credit Management](#2-credit-management)
- [3. User Purchase Experience](#3-user-purchase-experience)
- [4. Auto-Top-Up System](#4-auto-top-up-system)
- [5. System Behavior & Rules](#5-system-behavior--rules)
- [6. User Interface States](#6-user-interface-states)
- [7. Integration & Processing](#7-integration--processing)
- [8. Current Limitations](#8-current-limitations)

---

## 1. Payment System Overview

Reigh operates on a credit-based payment system where users purchase credits upfront to use AI features. The system supports both manual credit purchases and automatic top-ups to ensure uninterrupted service.

### What Credits Are Used For

- **Image Generation**: AI-powered image creation and editing
- **Task Processing**: Various AI operations and transformations
- **Advanced Features**: Premium AI capabilities and processing

### Current Pricing Structure

- **Purchase Range**: $5 - $100 in $5 increments via slider interface
- **Real-time Balance**: Credits displayed in dollars with immediate updates
- **Pay-per-use**: Credits deducted only when AI features are actually used

### Key Capabilities

- ✅ **Instant Credit Purchases** - One-click buying through Stripe Checkout
- ✅ **Automatic Top-ups** - Optional hands-free credit replenishment
- ✅ **Real-time Balance Tracking** - Live credit balance monitoring
- ✅ **Smart Threshold Management** - Customizable low-balance triggers
- ✅ **Mobile-Optimized Interface** - Seamless experience across all devices
- ✅ **Secure Payment Processing** - Industry-standard Stripe integration

---

## 2. Credit Management

### Current Balance Display

Users see their credit balance prominently displayed at the top of the Credits interface in a clean, simplified format:
- **Real-time Updates**: Balance refreshes immediately after purchases or usage
- **Dollar Format**: Credits shown as currency ($10.50) rather than points or tokens
- **Loading States**: Smooth animation while balance is being fetched

### Transaction History

The system maintains a complete transaction history showing:
- **Purchase Records**: All credit additions with timestamps
- **Usage Tracking**: Detailed log of when and how credits were spent
- **Transaction Types**: Clear categorization (Purchase, Auto-top-up, Spend)
- **Export Capability**: Users can download complete transaction history as CSV

### Task Log Integration

A comprehensive task log shows:
- **AI Usage**: Every image generation, processing task, and AI operation
- **Cost Breakdown**: Exact credit cost for each operation (or "Free" for no-cost tasks)
- **Duration Tracking**: Processing time for completed tasks
- **Project Organization**: Tasks grouped by user projects
- **Filtering Options**: Filter by cost (free/paid), status, task type, and project

---

## 3. User Purchase Experience

### Purchase Interface

The credit purchase flow is designed for simplicity and transparency:

**Amount Selection**
- **Slider Interface**: Smooth slider from $5 to $100 in $5 increments
- **Large Display**: Purchase amount shown prominently in large, bold text
- **Real-time Updates**: All related settings update immediately as user adjusts amount

**Purchase Process**
- **One-Click Purchase**: Single button to initiate payment
- **Stripe Checkout**: Secure, industry-standard payment processing
- **Mobile Optimized**: Streamlined experience on all device sizes
- **Immediate Confirmation**: Credits appear in account immediately after successful payment

### Button Behavior

The purchase button adapts intelligently based on user state:
- **Standard Purchase**: "Add $50" for regular credit additions
- **Auto-top-up Setup**: "Add $50 and set-up auto-top-up" when configuring automation
- **Loading State**: Animated spinner during payment processing
- **Disabled State**: Grayed out when amount is $0 or during processing

---

## 4. Auto-Top-Up System

### How Auto-Top-Up Works

Auto-top-up is an optional feature that automatically purchases credits when a user's balance drops below a specified threshold. This ensures uninterrupted access to AI features without manual intervention.

**Basic Operation**
- **Threshold Monitoring**: System continuously monitors credit balance
- **Automatic Triggering**: When balance drops below threshold, auto-purchase initiates
- **Saved Payment Method**: Uses securely stored payment information from first purchase
- **Immediate Processing**: Credits added to account within moments of trigger

### User Setup Process

**Opt-in During First Purchase**
1. User visits credit purchase interface
2. Auto-top-up checkbox is **enabled by default** (opt-out approach)
3. User adjusts purchase amount (e.g., $70)
4. Threshold auto-calculates to 1/5 of amount (e.g., $14)
5. User can manually adjust threshold if desired
6. Purchase button shows "Add $70 and set-up auto-top-up"
7. Stripe securely saves payment method during transaction
8. Auto-top-up becomes active immediately

**Configuration Options**
- **Top-up Amount**: How much to charge when triggered (mirrors purchase amount slider)
- **Threshold**: Balance level that triggers auto-top-up (adjustable slider)
- **Enable/Disable**: Simple checkbox to activate or deactivate feature
- **Smart Defaults**: Threshold automatically calculates as 20% of top-up amount

### Auto-Top-Up States

The system displays different interfaces based on user's current auto-top-up status:

**🟢 Active State** (Enabled + Setup Complete)
- Green summary box with confirmation message
- Shows exact amounts: "We'll automatically charge $70 when balance drops below $14"
- Standard purchase button: "Add $70"

**🔵 Enabled but Not Setup** (Enabled + No Payment Method)
- Blue summary box explaining setup needed
- Special setup button: "Add $70 and set-up auto-top-up"
- First purchase will save payment method and activate auto-top-up

**🟡 Setup but Disabled** (Disabled + Payment Method Saved)
- Yellow summary box indicating deactivated state
- User can re-enable anytime with checkbox toggle
- Payment method remains securely stored

**⚪ Not Setup** (Disabled + No Payment Method)
- Gray preview showing how auto-top-up would work
- Standard purchase experience
- No setup occurs unless checkbox is enabled

---

## 5. System Behavior & Rules

### Auto-Top-Up Triggering

**When Auto-Top-Up Activates**
- User's credit balance drops below their configured threshold
- System checks every time credits are deducted from account
- Only triggers for users who have both enabled auto-top-up AND completed setup
- Rate limited to prevent multiple charges (maximum once per hour)

**Processing Timeline**
1. **Immediate Detection**: Balance drop detected instantly when credits are spent
2. **Validation**: System confirms user has active auto-top-up and valid payment method
3. **Charge Processing**: Stripe processes off-session payment using saved payment method
4. **Credit Addition**: Credits appear in user account within moments of successful charge
5. **Notification**: Transaction appears in user's transaction history

### Smart Default Behavior

**New User Experience**
- Auto-top-up checkbox starts **checked** (opt-out rather than opt-in)
- Threshold automatically calculates as 20% of purchase amount
- When user adjusts purchase slider, threshold updates proportionally
- Settings save automatically without confirmation dialogs

**Returning User Experience**
- Previous auto-top-up preferences are remembered and restored
- Purchase amount defaults to user's last auto-top-up amount (if configured)
- Threshold remains at user's custom setting (doesn't auto-update for existing configurations)

### Safety Mechanisms

**Rate Limiting**
- Maximum one auto-top-up charge per hour per user
- Prevents rapid successive charges if balance quickly depletes
- Timestamp tracking ensures proper intervals between charges

**Validation Checks**
- Verifies user has valid saved payment method before attempting charge
- Confirms user preferences are still enabled
- Checks that current balance is actually below threshold
- Validates charge amount is within reasonable limits

**Failure Handling**
- Failed payments are logged but don't disable auto-top-up
- User receives notification of failed charges
- System retries may occur for temporary failures
- Persistent failures require user intervention to update payment method

### Configuration Flexibility

**Threshold Management**
- Minimum threshold: $1
- Maximum threshold: $1 less than top-up amount (prevents immediate re-triggering)
- Real-time validation ensures threshold never exceeds top-up amount
- Slider interface with immediate visual feedback

**Amount Synchronization**
- Auto-top-up amount automatically mirrors purchase amount slider
- Changes to purchase amount update auto-top-up amount if enabled
- Ensures consistency between manual purchases and automatic top-ups

---

## 6. User Interface States

### Visual Design System

The credit management interface uses a clean, color-coded system to communicate auto-top-up status at a glance:

**🟢 Green (Active)**
- Auto-top-up is enabled and fully configured
- User sees confirmation of current settings
- Standard purchase experience

**🔵 Blue (Setup Needed)**
- Auto-top-up is enabled but requires first purchase to save payment method
- Special button text guides user through setup
- Clear explanation of next steps

**🟡 Yellow (Deactivated)**
- Auto-top-up is configured but temporarily disabled
- User can easily re-enable with checkbox toggle
- Payment method remains securely saved

**⚪ Gray (Preview Mode)**
- Shows how auto-top-up would work if enabled
- No special messaging or setup prompts
- Standard purchase experience

### Responsive Design

**Mobile Experience**
- Simplified three-tab interface (Add Credits, Transaction History, Task Log)
- Large, touch-friendly controls and sliders
- Stacked layout for auto-top-up configuration
- Essential information prioritized, details available on desktop

**Desktop Experience**
- Full feature access including detailed task log with filtering
- Expanded transaction history with more columns
- Advanced filtering options for task analysis
- Complete auto-top-up configuration interface

### Real-Time Feedback

**Immediate Visual Updates**
- All sliders and controls update related values instantly
- Local state changes reflected immediately in UI
- No loading states for simple preference toggles
- Smooth transitions between different auto-top-up states

**Silent Background Saves**
- Preference changes save automatically without confirmation dialogs
- No toast notifications for routine updates
- Console logging for debugging without interrupting user experience

---

## 7. Integration & Processing

### Payment Processing

**Stripe Integration**
- Industry-standard payment processing with PCI compliance
- Secure storage of payment methods for auto-top-up functionality
- Off-session charging capability for automatic transactions
- Real-time webhook processing for immediate credit delivery

**Transaction Flow**
1. **Initial Setup**: First purchase with auto-top-up enabled saves payment method to Stripe
2. **Manual Purchases**: Standard Stripe Checkout flow for immediate credit additions
3. **Automatic Charges**: Background processing using saved payment method when threshold reached
4. **Transaction Recording**: All purchases logged in credits ledger with full audit trail

### Real-Time Balance Updates

**Immediate Synchronization**
- Credit balance updates instantly after successful payments
- Real-time deduction as AI features consume credits
- Live balance display refreshes automatically
- No manual refresh required for current credit status

**Cross-Session Consistency**
- Balance changes reflected across all open browser tabs
- Mobile and desktop interfaces stay synchronized
- Multi-device usage shows consistent credit information

### Data Management

**Transaction History**
- Complete audit trail of all credit transactions
- Detailed task log showing exact credit usage per AI operation
- Exportable data for user analysis and record-keeping
- Filtering and search capabilities for transaction analysis

---

## 8. Current Limitations

### Payment Method Management

**Single Payment Method**
- Currently supports one saved payment method per user
- No interface for updating or changing saved payment methods
- Payment method changes require contacting support

**Currency Support**
- USD only at this time
- No multi-currency support or international payment methods
- Pricing displayed and processed in US dollars

### Auto-Top-Up Constraints

**Threshold Limitations**
- Fixed relationship between top-up amount and maximum threshold
- No support for multiple threshold levels or tiered auto-top-up
- Minimum threshold of $1 may be too high for light usage patterns

**Scheduling Restrictions**
- No time-based controls (e.g., only charge during business hours)
- No spending limits or daily/monthly caps on auto-top-up
- No pause/vacation mode for temporary auto-top-up suspension

### Advanced Features Not Yet Implemented

**Analytics & Insights**
- No usage pattern analysis or spending insights
- No cost optimization recommendations
- No integration with external accounting systems

**Enterprise Features**
- No team billing or shared payment methods
- No department-level cost allocation
- No bulk credit purchasing with volume discounts

**Notification System**
- No email notifications for auto-top-up transactions
- No low balance warnings before auto-top-up triggers
- No spending alerts or budget management tools

### Known Technical Limitations

**Rate Limiting**
- One auto-top-up per hour maximum may cause gaps in heavy usage periods
- No smart rate limiting based on usage patterns

**Mobile Experience**
- Some advanced filtering features only available on desktop
- Task log detail view optimized for larger screens
- CSV export functionality may have mobile browser limitations

---

## Summary

Reigh's payment and credit system provides a robust foundation for AI feature usage with seamless credit management. The auto-top-up functionality ensures uninterrupted service while maintaining user control and transparency. The system balances simplicity for casual users with detailed tracking for power users, all built on secure, industry-standard payment processing infrastructure.

The current implementation successfully handles the core use cases while providing a clear path for future enhancements in payment method management, advanced analytics, and enterprise features.
