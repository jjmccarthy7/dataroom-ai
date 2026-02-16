var SUPABASE_URL = 'https://axdemummseyqhzzjxquy.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_IS_Xc9xhjH1kAYj4UL1Ctg_og7xJO_b';
var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var auth = {
      signUp: async function(email, password, fullName) {
              return await _supabase.auth.signUp({ email: email, password: password, options: { data: { full_name: fullName } } });
      },
      signIn: async function(email, password) {
              return await _supabase.auth.signInWithPassword({ email: email, password: password });
      },
      signInWithGoogle: async function() {
              return await _supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/dashboard.html' } });
      },
      signOut: async function() { return await _supabase.auth.signOut(); },
      getSession: async function() {
              var r = await _supabase.auth.getSession();
              return { session: r.data.session, error: r.error };
      },
      getUser: async function() {
              var r = await _supabase.auth.getUser();
              return { user: r.data.user, error: r.error };
      },
      resetPassword: async function(email) {
              return await _supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/update-password.html' });
      },
      updatePassword: async function(newPassword) {
              return await _supabase.auth.updateUser({ password: newPassword });
      },
      onAuthStateChange: function(callback) { return _supabase.auth.onAuthStateChange(callback); }
};
var profiles = {
      getMyProfile: async function() {
              var u = await auth.getUser();
              if (!u.user) return { profile: null, error: 'Not authenticated' };
              var r = await _supabase.from('profiles').select('*').eq('id', u.user.id).single();
              return { profile: r.data, error: r.error };
      },
      updateProfile: async function(updates) {
              var u = await auth.getUser();
              if (!u.user) return { data: null, error: 'Not authenticated' };
              delete updates.role; delete updates.id; delete updates.created_at;
              var r = await _supabase.from('profiles').update(updates).eq('id', u.user.id).select().single();
              return { data: r.data, error: r.error };
      },
      checkHandleAvailable: async function(handle) {
              var u = await auth.getUser();
              var uid = u.user ? u.user.id : '';
              var r = await _supabase.from('profiles').select('id').eq('handle', handle.toLowerCase()).neq('id', uid).maybeSingle();
              if (r.error) return { available: false, error: r.error };
              return { available: r.data === null, error: null };
      },
      uploadAvatar: async function(file) {
              var u = await auth.getUser();
              if (!u.user) return { url: null, error: 'Not authenticated' };
              var ext = file.name.split('.').pop();
              var path = u.user.id + '/avatar.' + ext;
              var up = await _supabase.storage.from('avatars').upload(path, file, { upsert: true });
              if (up.error) return { url: null, error: up.error };
              var pub = _supabase.storage.from('avatars').getPublicUrl(path);
              await profiles.updateProfile({ avatar_url: pub.data.publicUrl });
              return { url: pub.data.publicUrl, error: null };
      }
};
async function requireAuth() {
      var r = await auth.getSession();
      if (!r.session) { window.location.href = '/login.html'; return false; }
      return true;
}
async function redirectIfAuth() {
      var r = await auth.getSession();
      if (r.session) { window.location.href = '/dashboard.html'; return true; }
      return false;
}
