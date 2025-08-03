/******************************************************
 *  Clé-Finder  –  app.js (Firebase / Firestore)
 *  • Lookup local dans db.json
 *  • Ajout / incrément d’une entrée Firestore :
 *      collection "adresses"  (doc-ID = adresse scannée)
 *      { key, count, firstScanned, lastScanned }
 *  • Liste “À réimprimer” temps réel, suppression par 🗑️
 ******************************************************/

/* ---------- 1. CHARGER LA BASE LOCALE db.json ---------- */

let DB = {};

fetch('./db.json')
  .then(r => r.json())
  .then(j => {
    DB = j;
    console.log('✅ db.json chargée :', Object.keys(DB).length, 'adresses');
  })
  .catch(err => {
    console.error('❌ Erreur chargement DB :', err);
    showResult('Erreur chargement base', 'error');
  });

/* ---------- 2. ELEMENTS DOM ---------- */

const RES             = document.getElementById('result');
const CAMERA_CONT     = document.getElementById('camera-container');
const CAMERA_VIEW     = document.getElementById('camera-view');
const MANUAL_INPUT    = document.getElementById('manual');
const SCAN_BTN        = document.getElementById('scan');

/* ---------- 3. AFFICHAGE RESULTAT ---------- */

function showResult(text, type = '') {
  RES.textContent = text;
  RES.className   = type;            // '' | 'success' | 'error'
}

/* ---------- 4. FONCTION PRINCIPALE lookup(addr) ---------- */

async function lookup(addr) {
  if (!addr) { showResult('Adresse vide', 'error'); return; }

  addr = addr.toUpperCase().trim();
  const key = DB[addr] || '';

  showResult(
    key ? `🔑 Clé : ${key}` : '❓ Adresse inconnue',
    key ? 'success'        : 'error'
  );

  /* ---- Ecriture / mise à jour Firestore ---- */
  const ref = db.collection('adresses').doc(addr);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now  = firebase.firestore.FieldValue.serverTimestamp();

    if (snap.exists) {
      tx.update(ref, {
        count:       firebase.firestore.FieldValue.increment(1),
        lastScanned: now
      });
    } else {
      tx.set(ref, {
        key,
        count:        1,
        firstScanned: now,
        lastScanned:  now
      });
    }
  }).catch(err => console.error('⚠️ Firestore', err));
}

/* ---------- 5. SAISIE MANUELLE ---------- */

MANUAL_INPUT.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const v = e.target.value.trim();
    if (v) { lookup(v); e.target.value = ''; }
  }
});

/* ---------- 6. SCAN CAMÉRA via Quagga ---------- */

let isScanning = false;

SCAN_BTN.onclick = () => isScanning ? stopScanning() : startCamera();

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia non supporté');
    }
    showResult('Demande d’accès à la caméra…');
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }});
    stream.getTracks().forEach(t => t.stop());   // juste pour déclencher la permission
    startQuagga();
  } catch (err) {
    console.error('Caméra :', err);
    showResult('Caméra indisponible', 'error');
  }
}

function startQuagga() {
  isScanning = true;
  SCAN_BTN.textContent        = '⏹️ Arrêter';
  CAMERA_CONT.style.display   = 'block';
  showResult('📷 Visez le code barre…');

  Quagga.init({
    inputStream:{
      type:'LiveStream',
      target:CAMERA_VIEW,
      constraints:{ facingMode:'environment' }
    },
    decoder:{ readers:['code_128_reader'] },
    numOfWorkers:2,
    locate:true
  }, (err)=>{
    if(err){ showResult('Erreur scanner', 'error'); console.error(err); stopScanning(); return; }
    Quagga.start();
  });

  Quagga.onDetected(res=>{
    const code = res.codeResult?.code;
    if (code) {
      navigator.vibrate?.(150);
      stopScanning();
      lookup(code);
    }
  });
}

function stopScanning() {
  if (!isScanning) return;
  isScanning = false;
  SCAN_BTN.textContent        = '📷 Scanner';
  CAMERA_CONT.style.display   = 'none';
  try { Quagga.stop(); Quagga.offDetected(); } catch(e){}
}

/* ---------- 7. LISTE “À RÉIMPRIMER” TEMPS RÉEL ---------- */

const TODO_BTN  = document.createElement('button');
TODO_BTN.id     = 'todo';
TODO_BTN.textContent = '📋 À réimprimer';
TODO_BTN.style.marginTop = '1rem';
document.body.insertBefore(TODO_BTN, CAMERA_CONT.nextSibling);

const LIST_DIV  = document.createElement('div');
LIST_DIV.id     = 'list';
LIST_DIV.style.display = 'none';
LIST_DIV.style.marginTop = '1rem';
document.body.appendChild(LIST_DIV);

TODO_BTN.onclick = ()=> {
  LIST_DIV.style.display = LIST_DIV.style.display==='none' ? 'block':'none';
};

db.collection('adresses').orderBy('firstScanned')
  .onSnapshot(snap=>{
    LIST_DIV.innerHTML = '';
    snap.forEach(doc=>{
      const d = doc.data();
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;' +
                          'align-items:center;border-bottom:1px solid #ccc;padding:.5rem;';
      row.innerHTML = `
        <div>
          <strong>${doc.id}</strong> → ${d.key || '???'}<br>
          <small>scans : ${d.count} | 1ᵉʳ : ${
            d.firstScanned?.toDate().toLocaleDateString()}</small>
        </div>
        <button style="background:#dc2626;color:#fff;border:none;
                       border-radius:4px;cursor:pointer;">🗑️</button>`;
      row.querySelector('button').onclick =
        ()=>db.collection('adresses').doc(doc.id).delete();
      LIST_DIV.appendChild(row);
    });
  });

console.log('✅ App initialisée – getUserMedia',
            !!navigator.mediaDevices?.getUserMedia,
            '| ServiceWorker', 'serviceWorker' in navigator);
