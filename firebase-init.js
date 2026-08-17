/* ============================================================
   LARP — FIREBASE INIT
   Boots Firebase Auth + Firestore when a real config is present.
   Exposes window.LarpFirebase = { ready, auth, db, google }.
   When config is still placeholder, LarpFirebase is null and
   the site falls back to the mock URL-carried session.
   ============================================================ */
(function(){
  var cfg = window.LARP_FIREBASE_CONFIG || {};
  var hasRealConfig = !!(cfg.apiKey && cfg.apiKey.indexOf('YOUR_') === -1);
  if(!hasRealConfig || !window.firebase){
    window.LarpFirebase = null;
    return;
  }
  try{
    window.firebase.initializeApp(cfg);
    window.LarpFirebase = {
      ready: true,
      auth: window.firebase.auth(),
      db: window.firebase.firestore(),
      google: new window.firebase.auth.GoogleAuthProvider()
    };
  }catch(err){
    window.LarpFirebase = null;
  }
})();