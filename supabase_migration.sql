-- ============================================================================
-- Financial Analyzer — Supabase Database Migration
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hattlirxjifrbmmwwytj/sql/new
-- ============================================================================

-- 1. Create the analyses table
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    job_id TEXT NOT NULL,
    analysis_data JSONB,
    recommendation TEXT,
    confidence TEXT,
    report_storage_path TEXT,
    filenames TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON public.analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_company ON public.analyses(company_name);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON public.analyses(created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — users can only access their own data
CREATE POLICY "Users can view own analyses"
    ON public.analyses FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
    ON public.analyses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses"
    ON public.analyses FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Allow the service to insert via service_role key (bypasses RLS)
-- The anon key + user JWT will use the policies above.

-- 6. Create storage bucket for reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policies — users can access their own folder
CREATE POLICY "Users can upload own reports"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'reports'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can view own reports"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'reports'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
