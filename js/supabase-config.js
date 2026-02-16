// Supabase Configuration for DataRoom.ai
const SUPABASE_URL = 'https://axdemummseyqhzzjxquy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IS_Xc9xhjH1kAYj4UL1Ctg_og7xJO_b';

// Initialize the Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth helper functions
const auth = {
    // Sign up with email and password
    async signUp(email, password, fullName) {
          const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                            data: { full_name: fullName }
                  }
          });
          return { data, error };
    },

    // Sign in with email and password
    async signIn(email, password) {
          const { data, error } = await supabase.auth.signInWithPassword({
                  email,
                  password
          });
          return { data, error };
    },

    // Sign in with Google
    async signInWithGoogle() {
          const { data, error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                            redirectTo: window.location.origin + '/dashboard.html'
                  }
          });
          return { data, error };
    },

    // Sign out
    async signOut() {
          const { error } = await supabase.auth.signOut();
          return { error };
    },

    // Get current session
    async getSession() {
          const { data: { session }, error } = await supabase.auth.getSession();
          return { session, error };
    },

    // Get current user
    async getUser() {
          const { data: { user }, error } = await supabase.auth.getUser();
          return { user, error };
    },

    // Reset password
    async resetPassword(email) {
          const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: window.location.origin + '/update-password.html'
          });
          return { data, error };
    },

    // Update password
    async updatePassword(newPassword) {
          const { data, error } = await supabase.auth.updateUser({
                  password: newPassword
          });
          return { data, error };
    },

    // Listen for auth state changes
    onAuthStateChange(callback) {
          return supabase.auth.onAuthStateChange(callback);
    }
};

// Profile helper functions
const profiles = {
    // Get current user's profile
    async getMyProfile() {
          const { user } = await auth.getUser();
          if (!user) return { profile: null, error: 'Not authenticated' };

      const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          return { profile: data, error };
    },

    // Update profile
    async updateProfile(updates) {
          const { user } = await auth.getUser();
          if (!user) return { data: null, error: 'Not authenticated' };

      // Prevent role updates from client
      delete updates.role;
          delete updates.id;
          delete updates.created_at;

      const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();
          return { data, error };
    },

    // Check if handle is available
    async checkHandleAvailable(handle) {
          const { user } = await auth.getUser();
          const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('handle', handle.toLowerCase())
            .neq('id', user?.id || '')
            .maybeSingle();

      if (error) return { available: false, error };
          return { available: data === null, error: null };
    },

    // Upload avatar
    async uploadAvatar(file) {
          const { user } = await auth.getUser();
          if (!user) return { url: null, error: 'Not authenticated' };

      const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/avatar.${fileExt}`;

      const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });

      if (error) return { url: null, error };

      const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

      // Update profile with new avatar URL
      await profiles.updateProfile({ avatar_url: publicUrl });

      return { url: publicUrl, error: null };
    }
};

// Route guard - redirect to login if not authenticated
async function requireAuth() {
    const { session } = await auth.getSession();
    if (!session) {
          window.location.href = '/login.html';
          return false;
    }
    return true;
}

// Redirect to dashboard if already authenticated
async function redirectIfAuth() {
    const { session } = await auth.getSession();
    if (session) {
          window.location.href = '/dashboard.html';
          return true;
    }
    return false;
}
