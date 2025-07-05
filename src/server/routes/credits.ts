import express, { Request, Response } from 'express';
import { supabaseAdmin } from '../../integrations/supabase/admin';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router() as any;

// Apply authentication middleware to all routes
router.use(authenticate);

// Validation schemas
const checkoutSchema = z.object({
  amount: z.number().min(10).max(100), // $10 to $100
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

// GET /api/credits/balance - Get user's budget balance
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
      console.error('Error fetching budget balance:', balanceError);
      return res.status(500).json({ error: 'Failed to fetch budget balance' });
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

// GET /api/credits/ledger - Get user's budget transaction history
router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate query parameters
    const { limit, offset } = ledgerQuerySchema.parse(req.query);

    // Get user's budget ledger with pagination
    const { data: ledgerData, error: ledgerError, count } = await supabaseAdmin
      .from('credits_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ledgerError) {
      console.error('Error fetching budget ledger:', ledgerError);
      return res.status(500).json({ error: 'Failed to fetch budget ledger' });
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

// POST /api/credits/checkout - Create Stripe checkout session for dollar amount
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate request body
    const { amount } = checkoutSchema.parse(req.body);

    // For now, return a placeholder response since Stripe integration needs to be set up
    res.json({
      error: 'Stripe integration not yet configured',
      message: `Would create checkout session for $${amount}`,
    });
  } catch (error) {
    console.error('Error in POST /api/credits/checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/credits/grant - Grant budget to user (admin only)
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

    // Insert budget grant into ledger using service role
    const { data: ledgerEntry, error: ledgerError } = await supabaseAdmin
      .from('credits_ledger')
      .insert({
        user_id: userId,
        amount: amount * 100, // Convert dollars to cents
        type: 'manual',
        metadata: {
          reason: reason || 'Admin grant',
          granted_by: adminUserId,
        },
      })
      .select()
      .single();

    if (ledgerError) {
      console.error('Error granting budget:', ledgerError);
      return res.status(500).json({ error: 'Failed to grant budget' });
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