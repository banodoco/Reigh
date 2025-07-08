-- Create training_data_batches table
CREATE TABLE training_data_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ
);

-- Add batch_id column to training_data table
ALTER TABLE training_data 
ADD COLUMN batch_id UUID REFERENCES training_data_batches(id) ON DELETE CASCADE;

-- Create RLS policies for training_data_batches
ALTER TABLE training_data_batches ENABLE ROW LEVEL SECURITY;

-- Users can only access their own batches
CREATE POLICY "Users can view their own training data batches" ON training_data_batches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training data batches" ON training_data_batches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training data batches" ON training_data_batches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training data batches" ON training_data_batches
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_training_data_batches_user_id ON training_data_batches(user_id);
CREATE INDEX idx_training_data_batches_created_at ON training_data_batches(created_at);
CREATE INDEX idx_training_data_batch_id ON training_data(batch_id); 