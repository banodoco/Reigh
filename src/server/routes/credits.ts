import express, { Request, Response } from 'express';
import { supabaseAdmin } from '../../integrations/supabase/admin';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router() as any;

// Apply authentication middleware to all routes
router.use(authenticate);

// Validation schemas
const checkoutSchema = z.object({
  packageId: z.string().min(1),
});

const grantSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

const ledgerQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// Credit packages configuration
const CREDIT_PACKAGES = {
  'starter': { credits: 100, priceId: process.env.STRIPE_PRICE_ID_STARTER, amount: 999 }, // $9.99
  'professional': { credits: 500, priceId: process.env.STRIPE_PRICE_ID_PROFESSIONAL, amount: 3999 }, // $39.99
  'enterprise': { credits: 1500, priceId: process.env.STRIPE_PRICE_ID_ENTERPRISE, amount: 9999 }, // $99.99
};

// GET /api/credits/balance - Get user's credit balance
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's current balance and summary
    const { data: balanceData, error: balanceError } = await supabaseAdmin
      .from('user_credit_balance')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (balanceError) {
      console.error('Error fetching credit balance:', balanceError);
      return res.status(500).json({ error: 'Failed to fetch credit balance' });
    }

    res.json({
      currentBalance: balanceData?.current_balance || 0,
      totalPurchased: balanceData?.total_purchased || 0,
      totalSpent: balanceData?.total_spent || 0,
      totalRefunded: balanceData?.total_refunded || 0,
    });
  } catch (error) {
    console.error('Error in GET /api/credits/balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/credits/ledger - Get user's credit transaction history
router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate query parameters
    const { limit, offset } = ledgerQuerySchema.parse(req.query);

    // Get user's credit ledger with pagination
    const { data: ledgerData, error: ledgerError, count } = await supabaseAdmin
      .from('credits_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ledgerError) {
      console.error('Error fetching credit ledger:', ledgerError);
      return res.status(500).json({ error: 'Failed to fetch credit ledger' });
    }

    res.json({
      transactions: ledgerData || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in GET /api/credits/ledger:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/credits/checkout - Create Stripe checkout session
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // For now, return a placeholder response since Stripe integration will be configured later
    res.json({
      error: 'Stripe integration not yet configured',
      message: 'Please complete Stripe setup first',
    });
  } catch (error) {
    console.error('Error in POST /api/credits/checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/credits/packages - Get available credit packages
router.get('/packages', (req: Request, res: Response) => {
  const packages = Object.entries(CREDIT_PACKAGES).map(([id, config]) => ({
    id,
    credits: config.credits,
    amount: config.amount,
    pricePerCredit: Math.round(config.amount / config.credits),
  }));

  res.json({ packages });
});

// POST /api/credits/grant - Grant credits to user (admin only)
router.post('/grant', async (req: Request, res: Response) => {
  try {
    const adminUserId = req.userId;
    if (!adminUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // TODO: Add proper admin role check
    // This is a placeholder - in production, you'd check if user has admin role
    const isAdmin = process.env.NODE_ENV === 'development';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate request body
    const { userId, amount, reason } = grantSchema.parse(req.body);

    // Insert credit grant into ledger using service role
    const { data: ledgerEntry, error: ledgerError } = await supabaseAdmin
      .from('credits_ledger')
      .insert({
        user_id: userId,
        amount,
        type: 'manual',
        metadata: {
          reason: reason || 'Admin grant',
          granted_by: adminUserId,
        },
      })
      .select()
      .single();

    if (ledgerError) {
      console.error('Error granting credits:', ledgerError);
      return res.status(500).json({ error: 'Failed to grant credits' });
    }

    res.json({
      success: true,
      transaction: ledgerEntry,
    });
  } catch (error) {
    console.error('Error in POST /api/credits/grant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 