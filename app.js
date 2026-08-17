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
  /* mock directory so Sign In has something to match against when
     Firebase is not configured. Real auth always wins when present. */
  const DEMO_DIRECTORY = [
    { e:'demo@larp.club', n:'A. Pretender', m:'LARP-000001', t:'LARP', d:'2025' }
  ];

  function readFromUrl(url){
    const params = new URLSearchParams(url || location.search);
    if(!params.get('m')) return null;
    return {
      n: params.get('n') || '',
      e: params.get('e') || '',
      m: params.get('m') || '',
      t: params.get('t') || 'LARP',
      d: params.get('d') || ''
    };
  }

  function toParams(session){
    const p = new URLSearchParams();
    if(session.n) p.set('n', session.n);
    if(session.e) p.set('e', session.e);
    if(session.m) p.set('m', session.m);
    if(session.t) p.set('t', session.t);
    if(session.d) p.set('d', session.d);
    return p;
  }

  /* the single source of truth for the current session */
  let memory = readFromUrl(location.search);
  const listeners = [];

  function current(){
    return memory;
  }

  function findByEmail(email){
    const norm = (email||'').trim().toLowerCase();
    if(!norm) return null;
    if(memory && memory.e && memory.e.toLowerCase() === norm) return memory;
    const match = DEMO_DIRECTORY.find(d=>d.e.toLowerCase() === norm);
    return match ? {...match} : null;
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
  const URL_SESSION_KEYS = ['n','e','m','t','d'];

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
      s: d.status || 'Active'
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
      createdAt: m.createdAt || now,
      updatedAt: now
    };
  }

  /* ---------- public directory (members.html) ----------
     Mirrors ONLY the member name into publicMembers/{uid}.
     Best-effort: a directory failure never breaks the private
     member/account flow. The field is guarded by Firestore rules
     (keys().hasOnly(['name'])), so nothing else can be stored. */
  function syncPublicName(uid, name){
    if(!fbReady()) return Promise.resolve();
    const F = window.LarpFirebase;
    const clean = String(name || '').trim();
    if(!clean) return Promise.resolve();
    return F.db.collection('publicMembers').doc(uid).get()
      .then(function(doc){
        if(!doc.exists || (doc.data().name || '') !== clean){
          return F.db.collection('publicMembers').doc(uid).set({ name: clean });
        }
      })
      .catch(function(){ /* silent: never fail the member flow */ });
  }

  async function createMember(opts){
    if(!fbReady()) return null;
    const F = window.LarpFirebase;
    const cred = await F.auth.createUserWithEmailAndPassword(opts.email, opts.password);
    const uid = cred.user.uid;
    /* check members/{uid} before creating: if a record already
       exists (e.g. sign-in raced with the auth listener), load it.
       The membership number is generated exactly once, only here. */
    const existing = await F.db.collection('members').doc(uid).get();
    if(existing.exists) return memberDataFromDoc(existing.data());
    const m = {
      n: opts.name, e: opts.email,
      m: generateMembershipNo(),
      t: opts.tier || 'LARP',
      d: memberSinceLabel(),
      s: 'Active'
    };
    await F.db.collection('members').doc(uid).set(memberDocPayload(uid, m));
    syncPublicName(uid, m.n);
    return m;
  }

  async function signInWithEmail(email, password){
    if(!fbReady()) return null;
    const F = window.LarpFirebase;
    const cred = await F.auth.signInWithEmailAndPassword(email, password);
    const doc = await F.db.collection('members').doc(cred.user.uid).get();
    if(!doc.exists) return null;
    return memberDataFromDoc(doc.data());
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
    syncPublicName(uid, m.n);
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
    syncPublicName(user.uid, fields.name);
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
          const doc = await F.db.collection('members').doc(user.uid).get();
          if(doc.exists){
            /* existing member: load their record. NEVER re-create
               or re-generate a membership number here. */
            const member = memberDataFromDoc(doc.data());
            set(member);
            /* keep the public name directory in sync (covers members
               registered before this feature existed) */
            syncPublicName(user.uid, member.n);
          }
          /* authenticated but no record yet: creation happens exactly
             once inside createMember / signInWithGoogle, so the
             membership number is never generated twice. */
        } else {
          set(null);
        }
      }catch(err){
        /* silent: never log member data */
      }
    });
  }

  return { current, findByEmail, generateMembershipNo, memberSinceLabel, propagateToLinks, toParams, fbReady, createMember, signInWithEmail, signInWithGoogle, updateMember, signOut, set, clear, onChange, watchAuth, onFirebaseReady };
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
