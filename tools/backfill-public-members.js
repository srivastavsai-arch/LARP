/*
  One-time backfill: seed publicMembers/{uid} from every existing
  members/{uid} record so the Members page counts ALL registered
  members (including those registered before this feature existed).

  Reads the private members collection with the Firebase Admin SDK
  (full access), then creates missing publicMembers docs containing
  ONLY the member's name. Never touches existing publicMembers docs.

  Setup (once):
    1. Firebase Console -> Project settings -> Service accounts ->
       Generate new private key -> save as serviceAccountKey.json
    2. npm install firebase-admin
    3. node tools/backfill-public-members.js serviceAccountKey.json

  Safe to re-run: uids that already have a publicMembers doc are
  skipped. The script never writes emails, UIDs, numbers, tiers,
  status or dates to publicMembers.
*/
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const keyPath = process.argv[2] || 'serviceAccountKey.json';

if(!fs.existsSync(keyPath)){
  console.error('Missing service account key: ' + keyPath);
  console.error('Generate one: Firebase Console -> Project settings -> Service accounts -> Generate new private key');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyPath)))
});

async function main(){
  const db = admin.firestore();
  const members = await db.collection('members').get();
  let created = 0;
  let skipped = 0;
  let missingName = 0;

  for(const doc of members.docs){
    const name = String(doc.data().name || '').trim();
    if(!name){ missingName++; continue; }
    const pub = db.collection('publicMembers').doc(doc.id);
    const existing = await pub.get();
    if(existing.exists){ skipped++; continue; }
    await pub.set({ name: name });
    created++;
  }

  console.log('members read: ' + members.size);
  console.log('publicMembers created: ' + created);
  console.log('already present (skipped): ' + skipped);
  console.log('members with no name (skipped): ' + missingName);
  console.log('Done. The Members page now counts ' + (members.size - missingName) + ' members.');
}

main()
  .then(function(){ process.exit(0); })
  .catch(function(err){ console.error(err); process.exit(1); });
