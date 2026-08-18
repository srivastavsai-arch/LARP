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

  async function signInWithGoogle(){
    if(!fbReady()) return null;
    const F = window.LarpFirebase;
    const cred = await F.auth.signInWithPopup(F.google);
    const uid = cred.user.uid;
    const ref = F.db.collection('members').doc(uid);
    const doc = await ref.get();
    if(doc.exists) return memberDataFromDoc(doc.data());
    const m = {
      n: cred.user.displayName || (cred.user.email||'').split('@')[0] || 'Member',
      e: cred.user.email || '',
      m: generateMembershipNo(),
      t: 'LARP',
      d: memberSinceLabel(),
      s: 'Active'
    };
    const payload = memberDocPayload(uid, m);
    await F.db.runTransaction(async t=>{
      const fresh = await t.get(ref);
      if(fresh.exists) return;
      await t.set(ref, payload);
      const cntRef = F.db.collection('counters').doc('members');
      const cnt = await t.get(cntRef);
      const next = (cnt.exists ? cnt.data().value : 0) + 1;
      if(cnt.exists) await t.update(cntRef, { value: next });
      else await t.set(cntRef, { value: next });
    });
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
          const doc = await F.db.collection('members').doc(user.uid).get();
          if(doc.exists){
            /* existing member: load their record. NEVER re-create
               or re-generate a membership number here. */
            const member = memberDataFromDoc(doc.data());
            set(member);
          }
          /* authenticated but no record yet: creation happens exactly
             once inside signInWithGoogle (transaction + counter), so
             the membership number is never generated twice. */
        } else {
          set(null);
        }
      }catch(err){
        /* silent: never log member data */
      }
    });
  }

  /* ---------- guest license (no account) ----------
     Identity: Firebase anonymous auth. The anonymous UID persists
     across refresh/reopen (token lives in the browser), so the
     guest is never forgotten and can never mint a second identity.
     Quota is enforced twice: the client pre-checks for UX, and
     Firestore rules are the hard cap (monotonic quotaUsed, frozen
     identity fields, uid == auth uid, quota cap in the rules file). */
  const GUEST_QUOTA = 1; /* keep in sync with the /guests rules cap */
  const MOCK_GUEST_KEY = 'larp-guest';

  function readMockGuest(){
    try{ return JSON.parse(localStorage.getItem(MOCK_GUEST_KEY) || 'null'); }catch(err){ return null; }
  }
  function saveMockGuest(g){
    try{ localStorage.setItem(MOCK_GUEST_KEY, JSON.stringify(g)); }catch(err){}
  }

  async function generateGuestLicense(name, age){
    const clean = String(name || '').trim();
    const ageNum = parseInt(age, 10);
    if(!clean) throw { code: 'guest-name' };
    if(isNaN(ageNum) || ageNum < 13) throw { code: 'guest-age' };
    if(!fbReady()){
      const existing = readMockGuest();
      if(existing) throw { code: 'guest-quota' };
      const mock = { uid:'mock-' + Math.random().toString(36).slice(2,10), n:clean, a:ageNum, m:generateMembershipNo(), q:GUEST_QUOTA, qU:1 };
      saveMockGuest(mock);
      return { n:mock.n, m:mock.m };
    }
    const F = window.LarpFirebase;
    const cred = await F.auth.signInAnonymously();
    const uid = cred.user.uid;
    const ref = F.db.collection('guests').doc(uid);
    const doc = await ref.get();
    const now = new Date().toISOString();
    if(doc.exists){
      const g = doc.data();
      if((g.quotaUsed || 0) >= (g.quota || GUEST_QUOTA)) throw { code: 'guest-quota' };
      await ref.update({
        uid, name:g.name, licenseNo:g.licenseNo, age:g.age,
        quota:g.quota, quotaUsed:(g.quotaUsed || 0) + 1,
        createdAt:g.createdAt, updatedAt:now
      });
      return { n:g.name, m:g.licenseNo };
    }
    /* guest record + member counter, atomically in one transaction:
       the count is exact and a refresh can never double-count */
    const licenseNo = generateMembershipNo();
    const payload = {
      uid, name:clean, licenseNo, age:ageNum,
      quota:GUEST_QUOTA, quotaUsed:1,
      createdAt:now, updatedAt:now
    };
    await F.db.runTransaction(async t=>{
      const fresh = await t.get(ref);
      if(fresh.exists) return;
      await t.set(ref, payload);
      const cntRef = F.db.collection('counters').doc('members');
      const cnt = await t.get(cntRef);
      const next = (cnt.exists ? cnt.data().value : 0) + 1;
      if(cnt.exists) await t.update(cntRef, { value: next });
      else await t.set(cntRef, { value: next });
    });
    return { n:clean, m:licenseNo };
  }

  async function currentGuest(){
    if(!fbReady()){
      const g = readMockGuest();
      return g ? { n:g.n, m:g.m, quotaUsed:g.qU, quota:g.q } : null;
    }
    const F = window.LarpFirebase;
    const user = F.auth.currentUser;
    if(!user || !user.isAnonymous) return null;
    const doc = await F.db.collection('guests').doc(user.uid).get();
    if(!doc.exists) return null;
    const g = doc.data();
    return { n:g.name, m:g.licenseNo, quotaUsed:g.quotaUsed, quota:g.quota };
  }

  return { current, generateMembershipNo, memberSinceLabel, propagateToLinks, toParams, fbReady, signInWithGoogle, updateMember, signOut, set, clear, onChange, watchAuth, onFirebaseReady, generateGuestLicense, currentGuest, GUEST_QUOTA };
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
