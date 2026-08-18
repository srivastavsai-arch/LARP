/* ============================================================
   LARP — SHARED APP LOGIC
   Session source of truth:
   1) Firebase persistent auth (onAuthStateChanged) when configured
   2) URL-carried mock session otherwise
   No passwords, tokens or private credentials are stored/logged.
   ============================================================ */

/* ---------- mobile nav ---------- */
(function initNav(){
  const burger = document.querySelector('.nav-burger');
  const mobile = document.querySelector('.nav-mobile');
  if(burger && mobile){
    burger.addEventListener('click', ()=>{
      const open = mobile.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true':'false');
      document.body.style.overflow = open ? 'hidden':'';
    });
    mobile.querySelectorAll('a').forEach(a=>{
      a.addEventListener('click', ()=>{
        mobile.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav-link]').forEach(a=>{
    if(a.getAttribute('data-nav-link') === here) a.classList.add('is-active');
  });
})();

/* ---------- session store ---------- */
const LarpSession = (function(){
  function current(){
    return memory;
  }

  function readFromUrl(url){
    const params = new URLSearchParams(url || location.search);
    if(!params.get('m')) return null;
    return {
      n: params.get('n') || '',
      e: params.get('e') || '',
      m: params.get('m') || '',
      t: params.get('t') || 'LARP',
      d: params.get('d') || '',
      age: params.get('age') || ''
    };
  }

  function toParams(session){
    const p = new URLSearchParams();
    if(session.n) p.set('n', session.n);
    if(session.e) p.set('e', session.e);
    if(session.m) p.set('m', session.m);
    if(session.t) p.set('t', session.t);
    if(session.d) p.set('d', session.d);
    if(session.age) p.set('age', session.age);
    return p;
  }

  /* the single source of truth for the current session */
  let memory = readFromUrl(location.search);
  const listeners = [];

  function current(){
    return memory;
  }

  function generateMembershipNo(){
    const n = Math.floor(100000 + Math.random()*899999);
    return 'LARP-' + n;
  }

  function memberSinceLabel(){
    const d = new Date();
    return d.toLocaleString('en-US',{month:'short'}).toUpperCase() + ' ' + d.getFullYear();
  }

  /* when Firebase is live, member data NEVER rides in the URL:
     links stay clean and the URL is never a source of truth. */
  const URL_SESSION_KEYS = ['n','e','m','t','d','age'];

  function stripSessionParamsFromUrl(){
    if(!location.search) return;
    const p = new URLSearchParams(location.search);
    let dirty = false;
    URL_SESSION_KEYS.forEach(k=>{
      if(p.has(k)){ p.delete(k); dirty = true; }
    });
    if(dirty){
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?'+qs : '') + location.hash);
    }
  }

  function propagateToLinks(){
    if(fbReady()) return;
    const session = current();
    document.querySelectorAll('a[data-carry-session]').forEach(a=>{
      const href = a.getAttribute('href') || '';
      const hashIdx = href.indexOf('#');
      const path = hashIdx === -1 ? href : href.slice(0, hashIdx);
      const fragment = hashIdx === -1 ? '' : href.slice(hashIdx);
      const qsIdx = path.indexOf('?');
      const page = qsIdx === -1 ? path : path.slice(0, qsIdx);
      const existing = qsIdx === -1 ? '' : path.slice(qsIdx + 1);
      const merged = new URLSearchParams(existing);
      if(session){
        toParams(session).forEach((v,k)=>merged.set(k,v));
      }
      const outQs = merged.toString();
      a.setAttribute('href', page + (outQs ? '?' + outQs : '') + fragment);
    });
  }

  function notify(){
    try{ refreshAccountLinks(); }catch(err){}
    listeners.slice().forEach(function(cb){
      try{ cb(memory); }catch(err){}
    });
  }

  function set(session){
    memory = session;
    if(fbReady()){
      /* Firebase is the source of truth: never write member data
         to the URL. On sign-out, scrub any leftover params. */
      if(!session) stripSessionParamsFromUrl();
    } else {
      history.replaceState(null, '', location.pathname + (session && session.m ? '?'+toParams(session).toString() : ''));
      propagateToLinks();
    }
    notify();
  }

  function clear(){
    set(null);
  }

  /* called by firebase-init.js once Firebase boots: drop any
     URL-carried mock session so the URL is never a source of truth. */
  function onFirebaseReady(){
    memory = null;
    stripSessionParamsFromUrl();
  }

  function onChange(cb){
    listeners.push(cb);
    return function(){
      const i = listeners.indexOf(cb);
      if(i > -1) listeners.splice(i, 1);
    };
  }

  /* ---------- Firebase member helpers ----------
     Activate only when firebase-init.js found a real config.
     Full member records live in Firestore: members/{uid}. */
  function fbReady(){
    const F = window.LarpFirebase;
    return !!(F && F.ready && F.auth && F.db);
  }

  function memberDataFromDoc(d){
    return {
      n: d.name || '',
      e: d.email || '',
      m: d.membershipNumber || d.membershipNo || '',
      t: d.membershipTier || d.tier || 'LARP',
      d: d.memberSince || '',
      s: d.status || 'Active',
      age: d.age || ''
    };
  }

  function memberDocPayload(uid, m){
    const now = new Date().toISOString();
    return {
      uid: uid || '',
      name: m.n,
      email: m.e,
      membershipNumber: m.m,
      membershipTier: m.t,
      status: m.s || 'Active',
      memberSince: m.d,
      age: m.age || '',
      createdAt: m.createdAt || now,
      updatedAt: now
    };
  }

  /* ---------- local guest identity (fallback) ----------
     Used only when Firebase is absent or the Anonymous provider is
     disabled: the guest still gets a persistent identity and license,
     stored in localStorage so it survives refreshes and is never
     duplicated. Dropped automatically once real auth exists. */
  const LOCAL_GUEST_KEY = 'larp_guest_v1';

  function loadLocalGuest(){
    try{
      const raw = window.localStorage.getItem(LOCAL_GUEST_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(s && s.m && s.guest) return s;
    }catch(err){}
    return null;
  }

  function saveLocalGuest(session){
    try{ window.localStorage.setItem(LOCAL_GUEST_KEY, JSON.stringify(session)); }catch(err){}
  }

  function clearLocalGuest(){
    try{ window.localStorage.removeItem(LOCAL_GUEST_KEY); }catch(err){}
  }

  function localGuestMember(opts){
    const existing = loadLocalGuest();
    const m = existing && existing.m ? existing : {
      n:'', e:'',
      m: generateMembershipNo(),
      t: opts.tier || 'LARP',
      d: memberSinceLabel(),
      s: 'Active',
      guest: true
    };
    if(opts.name){ m.n = opts.name; m.age = opts.age || m.age; }
    saveLocalGuest(m);
    return m;
  }

  /* Guest flow: Firebase Anonymous Auth is the primary identity — the
     guest gets a persistent UID, the same member/license record is
     restored on every refresh, and records are checked before creation
     so a returning guest is never duplicated. If the Anonymous
     provider is not enabled, fall back to the persistent local guest
     identity above so the flow still completes end to end. */
  async function createGuest(opts){
    if(!fbReady()) return localGuestMember(opts);
    const F = window.LarpFirebase;
    try{
      let user = F.auth.currentUser;
      if(!user){
        const cred = await F.auth.signInAnonymously();
        user = cred.user;
      }
      const uid = user.uid;
      /* check members/{uid} before creating: if a record already
         exists (returning guest, or a signed-in member who chose the
         guest path), load it. The membership number is generated
         exactly once, only here. */
      const existing = await F.db.collection('members').doc(uid).get();
      if(existing.exists){
        const data = existing.data();
        const member = memberDataFromDoc(data);
        if(opts.name && (data.name !== opts.name || String(data.age||'') !== String(opts.age||''))){
          await F.db.collection('members').doc(uid).update({
            name: opts.name,
            age: opts.age,
            updatedAt: new Date().toISOString()
          });
          member.n = opts.name;
          member.age = opts.age;
        }
        clearLocalGuest();
        return member;
      }
      const m = {
        n: opts.name, e: '',
        m: generateMembershipNo(),
        t: opts.tier || 'LARP',
        d: memberSinceLabel(),
        s: 'Active',
        age: opts.age || ''
      };
      await F.db.collection('members').doc(uid).set(memberDocPayload(uid, m));
      clearLocalGuest();
      return m;
    }catch(err){
      /* Anonymous provider disabled: this is the only Firebase-supported
         client-side guest mechanism, so fall back to the persistent
         local identity instead of surfacing an admin-restricted error. */
      if(err && (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed')){
        return localGuestMember(opts);
      }
      throw err;
    }
  }

  async function signInWithGoogle(){
    if(!fbReady()) return null;
    const F = window.LarpFirebase;
    const cred = await F.auth.signInWithPopup(F.google);
    const uid = cred.user.uid;
    const doc = await F.db.collection('members').doc(uid).get();
    if(doc.exists) return memberDataFromDoc(doc.data());
    const m = {
      n: cred.user.displayName || (cred.user.email||'').split('@')[0] || 'Member',
      e: cred.user.email || '',
      m: generateMembershipNo(),
      t: 'LARP',
      d: memberSinceLabel(),
      s: 'Active'
    };
    await F.db.collection('members').doc(uid).set(memberDocPayload(uid, m));
    return m;
  }

  async function updateMember(fields){
    if(!fbReady()) return null;
    const F = window.LarpFirebase;
    const user = F.auth.currentUser;
    if(!user) return null;
    const doc = await F.db.collection('members').doc(user.uid).get();
    if(!doc.exists) return null;
    const data = doc.data();
    if(fields.email && fields.email !== user.email){
      /* update Firebase Auth first: if reauthentication is required
         this throws and the Firestore doc stays untouched */
      await user.updateEmail(fields.email);
    }
    await F.db.collection('members').doc(user.uid).update({
      name: fields.name,
      email: fields.email,
      updatedAt: new Date().toISOString()
    });
    return {
      n: fields.name, e: fields.email,
      m: data.membershipNumber || data.membershipNo || '',
      t: data.membershipTier || data.tier || 'LARP',
      d: data.memberSince || '',
      s: data.status || 'Active'
    };
  }

  function signOut(){
    if(!fbReady()) return;
    try{ window.LarpFirebase.auth.signOut().catch(function(){}); }catch(err){}
  }

  /* ---------- persistent auth restore ----------
     Called once per page load (from firebase-init.js). Firebase
     restores the authenticated session on refresh / reopen, so the
     user never logs in twice while the session is valid. */
  function watchAuth(){
    if(!fbReady()) return;
    const F = window.LarpFirebase;
    F.auth.onAuthStateChanged(async function(user){
      try{
        if(user){
          clearLocalGuest();
          const doc = await F.db.collection('members').doc(user.uid).get();
          if(doc.exists){
            /* existing member: load their record. NEVER re-create
               or re-generate a membership number here. */
            const member = memberDataFromDoc(doc.data());
            set(member);
          }
          /* authenticated but no record yet: creation happens exactly
             once inside createGuest / signInWithGoogle, so the
             membership number is never generated twice. */
        } else {
          /* no auth user: restore a persistent local guest identity
             if one exists, so a fallback guest survives refreshes */
          set(loadLocalGuest());
        }
      }catch(err){
        /* silent: never log member data */
      }
    });
  }

  return { current, generateMembershipNo, memberSinceLabel, propagateToLinks, toParams, fbReady, createGuest, signInWithGoogle, updateMember, signOut, set, clear, onChange, watchAuth, onFirebaseReady };
})();

window.LarpSession = LarpSession;

function refreshAccountLinks(){
  const session = LarpSession.current();
  document.querySelectorAll('[data-account-link]').forEach(a=>{
    a.textContent = session ? (a.classList.contains('nav-cta') ? 'My LARP →' : 'My LARP') : (a.classList.contains('nav-cta') ? 'Account →' : 'Account');
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  LarpSession.propagateToLinks();
  refreshAccountLinks();
});

/* menu "Sign out" clears the Firebase session too (menu renders
   after DOMContentLoaded, so use a delegated listener) */
document.addEventListener('click', (e)=>{
  const el = e.target.closest ? e.target.closest('[data-modifier="signout"]') : null;
  if(el){
    e.preventDefault();
    if(LarpSession.fbReady()) LarpSession.signOut();
    LarpSession.clear();
  }
});
