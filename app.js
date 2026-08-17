/* ============================================================
   LARP — SHARED APP LOGIC
   No backend yet. Account state is intentionally mocked and
   carried between pages via the URL query string only —
   no localStorage / sessionStorage / cookies are used.
   Swap `LarpSession` for real auth later without touching pages.
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

/* ---------- mock session (URL-carried) ---------- */
const LarpSession = (function(){
  /* a tiny seeded "member directory" so Sign In has something to
     mock-match against even on a fresh page load with no prior URL
     state. Replace with a real backend lookup later. */
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

  function current(){
    return readFromUrl(location.search);
  }

  function findByEmail(email){
    const norm = (email||'').trim().toLowerCase();
    if(!norm) return null;
    const sessionNow = current();
    if(sessionNow && sessionNow.e.toLowerCase() === norm) return sessionNow;
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

  /* rewrite every same-site nav link on the page so the mock
     session travels along as the visitor browses. Query params are
     kept before any #fragment so section links survive too. */
  function propagateToLinks(){
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

  function urlWithSession(page, session, extra){
    const p = toParams(session);
    if(extra){ Object.keys(extra).forEach(k=>p.set(k, extra[k])); }
    const qs = p.toString();
    return qs ? (page + '?' + qs) : page;
  }

  function signOutHref(page){
    return page;
  }

  /* ---------- Firebase member helpers ----------
     These activate only when firebase-init.js found a real config.
     Full member records live in Firestore: members/{uid}. */
  function fbReady(){
    var F = window.LarpFirebase;
    return !!(F && F.ready && F.auth && F.db);
  }

  function memberDataFromDoc(d){
    return { n:d.name||'', e:d.email||'', m:d.membershipNo||'', t:d.tier||'LARP', d:d.memberSince||'' };
  }

  function memberDocPayload(m){
    return { name:m.n, email:m.e, membershipNo:m.m, tier:m.t, memberSince:m.d };
  }

  async function createMember(opts){
    if(!fbReady()) return null;
    var F = window.LarpFirebase;
    var cred = await F.auth.createUserWithEmailAndPassword(opts.email, opts.password);
    var m = { n:opts.name, e:opts.email, m:generateMembershipNo(), t:opts.tier||'LARP', d:memberSinceLabel() };
    await F.db.collection('members').doc(cred.user.uid).set(memberDocPayload(m));
    return m;
  }

  async function signInWithEmail(email, password){
    if(!fbReady()) return null;
    var F = window.LarpFirebase;
    var cred = await F.auth.signInWithEmailAndPassword(email, password);
    var doc = await F.db.collection('members').doc(cred.user.uid).get();
    if(!doc.exists) return null;
    return memberDataFromDoc(doc.data());
  }

  async function signInWithGoogle(){
    if(!fbReady()) return null;
    var F = window.LarpFirebase;
    var cred = await F.auth.signInWithPopup(F.google);
    var uid = cred.user.uid;
    var doc = await F.db.collection('members').doc(uid).get();
    if(doc.exists) return memberDataFromDoc(doc.data());
    var m = {
      n: cred.user.displayName || (cred.user.email||'').split('@')[0] || 'Member',
      e: cred.user.email || '',
      m: generateMembershipNo(),
      t: 'LARP',
      d: memberSinceLabel()
    };
    await F.db.collection('members').doc(uid).set(memberDocPayload(m));
    return m;
  }

  async function updateMember(fields){
    if(!fbReady()) return null;
    var F = window.LarpFirebase;
    var user = F.auth.currentUser;
    if(!user) return null;
    var doc = await F.db.collection('members').doc(user.uid).get();
    if(!doc.exists) return null;
    var data = doc.data();
    if(fields.email && fields.email !== user.email){
      // update Firebase Auth first: if reauth is required, this throws
      // and the Firestore doc stays untouched (no silent mismatch)
      await user.updateEmail(fields.email);
    }
    await F.db.collection('members').doc(user.uid).update({ name:fields.name, email:fields.email });
    return { n:fields.name, e:fields.email, m:data.membershipNo, t:data.tier, d:data.memberSince };
  }

  function signOut(){
    if(fbReady()) window.LarpFirebase.auth.signOut();
  }

  return { current, findByEmail, generateMembershipNo, memberSinceLabel, propagateToLinks, urlWithSession, toParams, fbReady, createMember, signInWithEmail, signInWithGoogle, updateMember, signOut };
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
    if(LarpSession.fbReady()) LarpSession.signOut();
  }
});
