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
    /* drop any URL-carried mock session now that Firebase is live,
       then start the persistent auth restore (onAuthStateChanged) */
    if(window.LarpSession){
      if(window.LarpSession.onFirebaseReady) window.LarpSession.onFirebaseReady();
      if(window.LarpSession.watchAuth) window.LarpSession.watchAuth();
    }
  }catch(err){
    window.LarpFirebase = null;
  }
})();