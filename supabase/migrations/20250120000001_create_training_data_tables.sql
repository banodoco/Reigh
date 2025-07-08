-- Create training_data table
CREATE TABLE IF NOT EXISTS training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    storage_location TEXT NOT NULL,
    duration INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Create training_data_segments table
CREATE TABLE IF NOT EXISTS training_data_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_data_id UUID NOT NULL REFERENCES training_data(id) ON DELETE CASCADE,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    segment_location TEXT,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on training_data table
ALTER TABLE training_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for training_data table
CREATE POLICY "Users can view their own training data"
ON training_data
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training data"
ON training_data
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training data"
ON training_data
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training data"
ON training_data
FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on training_data_segments table
ALTER TABLE training_data_segments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for training_data_segments table
CREATE POLICY "Users can view their own training data segments"
ON training_data_segments
FOR SELECT
USING (auth.uid() = (SELECT user_id FROM training_data WHERE id = training_data_id));

CREATE POLICY "Users can insert their own training data segments"
ON training_data_segments
FOR INSERT
WITH CHECK (auth.uid() = (SELECT user_id FROM training_data WHERE id = training_data_id));

CREATE POLICY "Users can update their own training data segments"
ON training_data_segments
FOR UPDATE
USING (auth.uid() = (SELECT user_id FROM training_data WHERE id = training_data_id));

CREATE POLICY "Users can delete their own training data segments"
ON training_data_segments
FOR DELETE
USING (auth.uid() = (SELECT user_id FROM training_data WHERE id = training_data_id));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_training_data_user_id ON training_data(user_id);
CREATE INDEX IF NOT EXISTS idx_training_data_created_at ON training_data(created_at);
CREATE INDEX IF NOT EXISTS idx_training_data_segments_training_data_id ON training_data_segments(training_data_id);
CREATE INDEX IF NOT EXISTS idx_training_data_segments_created_at ON training_data_segments(created_at); 