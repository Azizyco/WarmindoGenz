const SUPABASE_URL = 'https://caheywvfmftksrjgdkjr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhaGV5d3ZmbWZ0a3Nyamdka2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwOTkwMzUsImV4cCI6MjA3MzY3NTAzNX0.GHTiKs0ewjUYr6PPxt7sufZk1mCMzshjVxvdv2j5TuA';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});
