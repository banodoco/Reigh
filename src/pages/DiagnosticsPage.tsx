import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';

interface DiagnosticResult {
  test: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  details?: any;
}

export function DiagnosticsPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    const diagnosticResults: DiagnosticResult[] = [];

    // Test 1: Check Supabase URL and Key
    diagnosticResults.push({
      test: 'Environment Variables',
      status: 'success',
      message: 'Checking Supabase configuration',
      details: {
        SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'Not set',
        SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Set (hidden)' : '✗ Not set',
        API_TARGET_URL: import.meta.env.VITE_API_TARGET_URL || 'Not set',
      }
    });
    setResults([...diagnosticResults]);

    // Test 2: Check Auth Status
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      diagnosticResults.push({
        test: 'Authentication',
        status: user ? 'success' : 'error',
        message: user ? `Authenticated as ${user.email}` : 'Not authenticated',
        details: { userId: user?.id, error }
      });
    } catch (error) {
      diagnosticResults.push({
        test: 'Authentication',
        status: 'error',
        message: 'Failed to check auth status',
        details: error
      });
    }
    setResults([...diagnosticResults]);

    // Test 3: Test RPC Function
    try {
      const { error } = await supabase.rpc('create_user_record_if_not_exists');
      diagnosticResults.push({
        test: 'RPC Function (create_user_record_if_not_exists)',
        status: error ? 'error' : 'success',
        message: error ? `RPC Error: ${error.message}` : 'RPC function accessible',
        details: error
      });
    } catch (error) {
      diagnosticResults.push({
        test: 'RPC Function',
        status: 'error',
        message: 'Failed to call RPC function',
        details: error
      });
    }
    setResults([...diagnosticResults]);

    // Test 4: Check User Table Access
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, credits')
          .eq('id', user.id)
          .single();

        diagnosticResults.push({
          test: 'User Table Access',
          status: error ? 'error' : 'success',
          message: error ? `Query Error: ${error.message}` : 'User data accessible',
          details: { data, error }
        });
      }
    } catch (error) {
      diagnosticResults.push({
        test: 'User Table Access',
        status: 'error',
        message: 'Failed to query users table',
        details: error
      });
    }
    setResults([...diagnosticResults]);

    // Test 5: Check Projects Table
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id')
        .limit(1);

      diagnosticResults.push({
        test: 'Projects Table Access',
        status: error ? 'error' : 'success',
        message: error ? `Query Error: ${error.message}` : 'Projects table accessible',
        details: { count: data?.length, error }
      });
    } catch (error) {
      diagnosticResults.push({
        test: 'Projects Table Access',
        status: 'error',
        message: 'Failed to query projects table',
        details: error
      });
    }
    setResults([...diagnosticResults]);

    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Supabase Connection Diagnostics</span>
            <Button 
              onClick={runDiagnostics} 
              disabled={isRunning}
              size="sm"
            >
              {isRunning ? 'Running...' : 'Run Again'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div 
                key={index} 
                className={`p-4 rounded-lg border ${
                  result.status === 'success' 
                    ? 'bg-green-50 border-green-200' 
                    : result.status === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{result.test}</h3>
                  <span className={`text-sm font-medium ${
                    result.status === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {result.status === 'success' ? '✓ Pass' : '✗ Fail'}
                  </span>
                </div>
                <p className="text-sm mt-1">{result.message}</p>
                {result.details && (
                  <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 