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
    delete updates.id;
    delete updates.created_at;
    var r = await _supabase.from('profiles').update(updates).eq('id', u.user.id);
    return { data: r.data, error: r.error };
  },
  checkHandleAvailable: async function(handle) {
    var u = await auth.getUser();
    var uid = u.user ? u.user.id : '';
    var r = await _supabase.from('profiles').select('id').eq('handle', handle.toLowerCase()).neq('id', uid).maybeSingle();
    if (r.error) return { available: false, error: r.error };
    return { available: r.data === null, error: null };
  },
  getProfileByHandle: async function(handle) {
    var r = await _supabase.from('profiles').select('id, display_name, email, handle').eq('handle', handle.toLowerCase()).maybeSingle();
    return { profile: r.data, error: r.error };
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

var dataRooms = {
  createRoom: async function(roomData) {
    var u = await auth.getUser();
    if (!u.user) return { data: null, error: 'Not authenticated' };
    var r = await _supabase.from('data_rooms').insert({
      owner_id: u.user.id,
      company_name: roomData.company_name,
      short_description: roomData.short_description || null,
      stage: roomData.stage || null,
      owner_role: roomData.owner_role || 'founder',
      logo_url: roomData.logo_url || null,
      website: roomData.website || null,
      location: roomData.location || null
    }).select().single();
    return { data: r.data, error: r.error };
  },
  getMyRooms: async function() {
    var u = await auth.getUser();
    if (!u.user) return { rooms: [], error: 'Not authenticated' };
    var r = await _supabase.from('data_rooms').select('*').eq('owner_id', u.user.id).order('created_at', { ascending: false });
    return { rooms: r.data || [], error: r.error };
  },
  // Returns { data, error, isOwner } — widened to allow invited members too
  getRoom: async function(id) {
    var u = await auth.getUser();
    if (!u.user) return { data: null, error: 'Not authenticated', isOwner: false };
    var r = await _supabase.from('data_rooms').select('*').eq('id', id).single();
    if (r.error || !r.data) return { data: null, error: r.error, isOwner: false };
    var isOwner = (r.data.owner_id === u.user.id);
    return { data: r.data, error: null, isOwner: isOwner };
  },
  updateRoom: async function(id, updates) {
    var u = await auth.getUser();
    if (!u.user) return { data: null, error: 'Not authenticated' };
    var r = await _supabase.from('data_rooms').update(updates).eq('id', id).eq('owner_id', u.user.id).select().single();
    return { data: r.data, error: r.error };
  },
  deleteRoom: async function(id) {
    var u = await auth.getUser();
    if (!u.user) return { error: 'Not authenticated' };
    var r = await _supabase.from('data_rooms').delete().eq('id', id).eq('owner_id', u.user.id);
    return { error: r.error };
  }
,
  uploadLogo: async function(roomId, file) {
    var u = await auth.getUser();
    if (!u.user) return { url: null, error: 'Not authenticated' };
    var ext = file.name.split('.').pop().toLowerCase();
    var path = roomId + '/logo.' + ext;
    var up = await _supabase.storage.from('room-logos').upload(path, file, { upsert: true });
    if (up.error) return { url: null, error: up.error };
    var pub = _supabase.storage.from('room-logos').getPublicUrl(path);
    var logoUrl = pub.data.publicUrl;
    var upd = await dataRooms.updateRoom(roomId, { logo_url: logoUrl });
    if (upd.error) return { url: null, error: upd.error };
    return { url: logoUrl, error: null };
  }
};

var documents = {
  uploadDocument: async function(roomId, file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var uid = crypto.randomUUID();
    var filePath = 'rooms/' + roomId + '/' + uid + '-' + file.name;
    var uploadResult = await _supabase.storage.from('room-documents').upload(filePath, file, { upsert: false });
    if (uploadResult.error) return { document: null, error: uploadResult.error };
    var r = await _supabase.from('documents').insert([{
      room_id: roomId,
      uploader_id: (await _supabase.auth.getUser()).data.user.id,
      original_filename: file.name,
      file_path: filePath,
      file_type: file.type || ext,
      file_size: file.size
    }]).select().single();
    if (!r.error) {
      await _supabase.from('data_rooms').update({ updated_at: new Date().toISOString() }).eq('id', roomId);
    }
    return { document: r.data, error: r.error };
  },
  getDocuments: async function(roomId) {
    var r = await _supabase.from('documents').select('*').eq('room_id', roomId).order('created_at', { ascending: false });
    return { documents: r.data, error: r.error };
  },
  getSignedUrl: async function(filePath) {
    var r = await _supabase.storage.from('room-documents').createSignedUrl(filePath, 3600);
    return { url: r.data?.signedUrl, error: r.error };
  },
  addLinkDocument: async function(roomId, label, url) {
    var u = await auth.getUser();
    if (!u.user) return { document: null, error: 'Not authenticated' };
    var r = await _supabase.from('documents').insert([{
      room_id: roomId,
      uploader_id: u.user.id,
      original_filename: label,
      file_path: null,
      file_type: 'link',
      file_size: null,
      source_type: 'link',
      source_url: url
    }]).select().single();
    if (!r.error) {
      await _supabase.from('data_rooms').update({ updated_at: new Date().toISOString() }).eq('id', roomId);
    }
    return { document: r.data, error: r.error };
  },
  deleteDocument: async function(documentId, filePath, roomId) {
    if (filePath) {
      var storageResult = await _supabase.storage.from('room-documents').remove([filePath]);
      if (storageResult.error) return { error: storageResult.error };
    }
    var r = await _supabase.from('documents').delete().eq('id', documentId);
    if (!r.error) {
      await _supabase.from('data_rooms').update({ updated_at: new Date().toISOString() }).eq('id', roomId);
    }
    return { error: r.error };
  }
};

// ── Invites namespace ─────────────────────────────────────────────────────────
var invites = {
  // Parse a raw input string (comma/newline separated) into an array of
  // { raw, type: 'email'|'handle', value } objects.
  parseRecipients: function(raw) {
    return raw
      .split(/[,\n]+/)
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 0; })
      .map(function(s) {
        var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRe.test(s)) return { raw: s, type: 'email', value: s.toLowerCase() };
        var handle = s.replace(/^@/, '').toLowerCase();
        return { raw: s, type: 'handle', value: handle };
      });
  },

  // Resolve a single recipient to an email address.
  // For email type: returns the email directly.
  // For handle type: looks up profiles table.
  // Returns { email, error }
  resolveRecipient: async function(recipient) {
    if (recipient.type === 'email') {
      return { email: recipient.value, error: null };
    }
    // handle lookup
    var r = await _supabase
      .from('profiles')
      .select('id, email, handle')
      .eq('handle', recipient.value)
      .maybeSingle();
    if (r.error) return { email: null, error: r.error.message };
    if (!r.data) return { email: null, error: 'No user found with handle @' + recipient.value };
    // get the actual email from auth.users via the profile id
    // We store email on profiles if available, otherwise we need another approach.
    // Since profiles may not store email, fall back to a raw invite by handle
    // and store handle in the memberships row so it can be matched on login.
    if (r.data.email) return { email: r.data.email, error: null };
    // If no email on profile, we cannot send an invite by handle alone —
    // return error asking for email instead.
    return { email: null, error: 'Could not resolve email for @' + recipient.value + '. Please use their email address.' };
  },

  // Invite multiple recipients to a room.
  // Returns { results: [{ raw, email, token, error }], successCount }
  inviteToRoom: async function(roomId, rawInput) {
    var u = await auth.getUser();
    if (!u.user) return { results: [], successCount: 0, error: 'Not authenticated' };

    var recipients = invites.parseRecipients(rawInput);
    if (recipients.length === 0) return { results: [], successCount: 0, error: 'No recipients entered' };

    var results = [];
    for (var i = 0; i < recipients.length; i++) {
      var rec = recipients[i];
      var resolved = await invites.resolveRecipient(rec);
      if (resolved.error) {
        results.push({ raw: rec.raw, email: null, token: null, error: resolved.error });
        continue;
      }
      // Upsert: if already invited, return the existing token (do nothing new)
      var existing = await _supabase
        .from('room_memberships')
        .select('id, token, status')
        .eq('room_id', roomId)
        .eq('email', resolved.email)
        .maybeSingle();
      if (existing.data) {
        results.push({ raw: rec.raw, email: resolved.email, token: existing.data.token, error: null, alreadyInvited: true });
        continue;
      }
      // Insert new membership
      var ins = await _supabase.from('room_memberships').insert({
        room_id: roomId,
        invited_by: u.user.id,
        email: resolved.email,
        handle: rec.type === 'handle' ? rec.value : null,
        role: 'investor',
        status: 'pending'
      }).select('id, token').single();
      if (ins.error) {
        results.push({ raw: rec.raw, email: resolved.email, token: null, error: ins.error.message });
      } else {
        results.push({ raw: rec.raw, email: resolved.email, token: ins.data.token, error: null });
      }
    }

    var successCount = results.filter(function(r) { return !r.error; }).length;
    return { results: results, successCount: successCount };
  },

  // Accept an invite by token (called when the deep-link is visited by a logged-in user)
  acceptInvite: async function(token) {
    var u = await auth.getUser();
    if (!u.user) return { error: 'Not authenticated' };
    // Find the membership by token
    var r = await _supabase
      .from('room_memberships')
      .select('id, room_id, email, status')
      .eq('token', token)
      .maybeSingle();
    if (r.error || !r.data) return { error: 'Invalid or expired invite link.' };
    if (r.data.status === 'accepted') return { roomId: r.data.room_id, error: null }; // already accepted
    // Update to accepted + set user_id
    var upd = await _supabase
      .from('room_memberships')
      .update({ status: 'accepted', user_id: u.user.id })
      .eq('id', r.data.id);
    if (upd.error) return { error: upd.error.message };
    return { roomId: r.data.room_id, error: null };
  },

  // Get all memberships for a room (owner view)
  getMemberships: async function(roomId) {
    var r = await _supabase
      .from('room_memberships')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    return { memberships: r.data || [], error: r.error };
  }
};
