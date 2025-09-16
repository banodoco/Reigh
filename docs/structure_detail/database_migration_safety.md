# Safe Deployment Guide

## 🚨 CRITICAL WARNING - NEVER RESET THE DATABASE 🚨

```
██████████████████████████████████████████████████████████████████
█                                                                █
█  ⚠️  NEVER RUN `npx supabase db reset --linked` ON PRODUCTION  █
█                                                                █
█  THIS WILL DELETE ALL USER DATA AND CANNOT BE UNDONE          █
█                                                                █
██████████████████████████████████████████████████████████████████
```

---

## Database Migrations

### ✅ SAFE - Apply Migrations
```bash
# The ONLY safe way to apply database changes
npx supabase db push --linked
```

### ❌ DANGEROUS - Never Use
```bash
# NEVER use these commands - they delete all data
npx supabase db reset --linked
npx supabase db reset
```

### Migration Workflow
1. Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Write your SQL changes
3. Apply safely: `npx supabase db push --linked`
4. Verify in Supabase Dashboard

---

## Edge Functions

### ✅ SAFE - Deploy One at a Time
```bash
# Deploy individual functions (SAFE)
npx supabase functions deploy function-name --project-ref your-project-ref

# Examples:
npx supabase functions deploy complete-task --project-ref your-project-ref
npx supabase functions deploy create-task --project-ref your-project-ref
```

### ❌ DANGEROUS - Never Deploy All at Once
```bash
# NEVER use this - can break multiple services
npx supabase functions deploy --project-ref your-project-ref
```

### Function Deployment Workflow
1. Deploy one function: `npx supabase functions deploy function-name --project-ref your-project-ref`
2. Test it works
3. Check logs: `npx supabase functions logs function-name --project-ref your-project-ref`
4. Only then deploy the next function

---

## Quick Reference

### Safe Commands ✅
```bash
# Database migrations
npx supabase db push --linked

# Individual function deployment  
npx supabase functions deploy function-name --project-ref your-project-ref

# Check status
npx supabase db diff
npx supabase functions list --project-ref your-project-ref
```

### Dangerous Commands ❌
```bash
# Database reset (DELETES ALL DATA)
npx supabase db reset --linked

# Bulk function deployment (CAN BREAK SERVICES)
npx supabase functions deploy --project-ref your-project-ref
```

---

## Golden Rules

1. **Database**: Always use `db push --linked`, never `db reset --linked`
2. **Functions**: Always deploy one at a time, never all at once
3. **Test**: Always test after each deployment
4. **Backup**: Your data is irreplaceable - treat it with care

**When in doubt, deploy slowly and test frequently.**