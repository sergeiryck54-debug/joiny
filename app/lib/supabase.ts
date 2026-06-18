import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://zyfhggktehjjdlwbckzt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5ZmhnZ2t0ZWhqamRsd2Jja3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTY1NDQsImV4cCI6MjA5MzU5MjU0NH0.YijvciMjqU9B7NhwRH1k-YLIStcVLk-HCrjtt0L5omk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
