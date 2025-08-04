/******************************************************
 *  Clé-Finder – app.js  (Firebase, Firestore, SW)
 ******************************************************/

/* === 0. Version & changelog ======================= */
const VERSION  = 'cle-finder-v1';      // ↔ même que CACHE_VERSION dans sw.js
const CHANGELOG = [
  {v:'v1.2', date:'2025-08-04', notes:'♦ Nouveau logo pixel ♦ Refonte UI'},
  {v:'v1.1', date:'2025-08-04', notes:'◌ Nouveau logo pixel ◌ Refonte UI'},
  {v:'v1.0',   date:'2025-08-04', notes:'◌ BDD officielle ◌ Panneau version'},
  {v:'v0.9', date:'2025-07-30', notes:'◌ Première release publique'}
];

/* === 1. charger db.json =========================== */
let DB = {};
fetch('./db.json').then(r => r.json()).then(j => DB = j);

/* === 2. DOM helpers =============================== */
const $ = id => document.getElementById(id);
const RES   = $('result'),
      CAM   = $('camera-container'),
      VIEW  = $('camera-view'),
      IN    = $('manual'),
      BTN   = $('scan'),
      TAB_S = $('tab-scan'),
      TAB_T = $('tab-todo');

/* === 3. liste plein écran ========================= */
const LIST = document.createElement('div');
LIST.id = 'list';
document.body.appendChild(LIST);

/* === 4. nav actif / inactif ======================= */
TAB_S.classList.add('active');  // état par défaut

const MAIN = document.querySelector('main');   // 👈 nouvelle référence

function switchTab (scanActive){
  MAIN.style.display  = scanActive ? 'block' : 'none';
  LIST.style.display  = scanActive ? 'none'  : 'grid';   // on force grid
  CAM .style.display  = scanActive ? 'block' : 'none';

  TAB_S.classList.toggle('active',  scanActive);
  TAB_S.classList.toggle('inactive',!scanActive);
  TAB_T.classList.toggle('active', !scanActive);
  TAB_T.classList.toggle('inactive',scanActive);
}

TAB_S.onclick = () => switchTab(true);
TAB_T.onclick = () => switchTab(false);

/* === 5. Firestore save =========================== */
async function save(addr, key){
  const ref = db.collection('adresses').doc(addr);
  const ts  = firebase.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    snap.exists
      ? tx.update(ref, {
          count:       firebase.firestore.FieldValue.increment(1),
          lastScanned: ts
        })
      : tx.set(ref, {
          key,
          count:        1,
          firstScanned: ts,
          lastScanned:  ts
        });
  });
}

/* === 6. lookup ==================================== */
async function lookup(addr){
  addr = addr.toUpperCase().trim();
  if(!addr) return RES.textContent = 'Adresse vide';

  const key = DB[addr] || '';
  RES.textContent = key ? `🔑 Clé : ${key}` : '❓ Adresse inconnue';
  RES.className   = key ? 'success' : 'error';

  await save(addr, key);
}

/* saisie ------------------------------------------ */
IN.addEventListener('keypress', e => {
  if(e.key === 'Enter'){
    const v = IN.value.trim();
    if(v){ lookup(v); IN.value = ''; }
  }
});

/* === 7. Scan caméra ============================== */
let scanning = false;
BTN.onclick  = () => scanning ? stopScan() : startScan();

async function startScan(){
  try{
    await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    scanning = true; BTN.textContent = '⏹️ Arrêter'; CAM.style.display = 'block';
    RES.textContent = '📷 Visez le code-barres…'; RES.className = '';

    Quagga.init({
      inputStream:{type:'LiveStream',target:VIEW,constraints:{facingMode:'environment'}},
      decoder:{readers:['code_128_reader']}
    }, err => {
      if(err){ RES.textContent='Erreur scanner'; RES.className='error'; stopScan(); return; }
      Quagga.start();
    });

    Quagga.onDetected(r => {
      const code = r.codeResult?.code;
      if(code){ navigator.vibrate?.(120); stopScan(); lookup(code); }
    });
  }catch{
    RES.textContent = 'Caméra indisponible'; RES.className = 'error';
  }
}

function stopScan(){
  if(!scanning) return;
  scanning = false; BTN.textContent = '📷 Scanner'; CAM.style.display = 'none';
  try{ Quagga.stop(); Quagga.offDetected(); }catch{}
}

/* === 8. Liste Firestore temps réel =============== */
db.collection('adresses').orderBy('firstScanned')
  .onSnapshot(snap => {
    LIST.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data(),
            f = d.firstScanned?.toDate(),
            l = d.lastScanned ?.toDate();

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div>
          <div style="font-weight:600">${doc.id}</div>
          <small>Clé&nbsp;: ${d.key || '???'}</small>
          <small>1ᵉʳ&nbsp;: ${f?.toLocaleDateString() || '-'}</small>
          <small>Dernier&nbsp;: ${l?.toLocaleDateString() || '-'}</small>
          <small>Scans&nbsp;: <strong>${d.count}</strong></small>
        </div>
        <button class="del">🗑️</button>`;
      card.querySelector('button').onclick = () =>
        db.collection('adresses').doc(doc.id).delete();
      LIST.appendChild(card);
    });
  });

  LIST.style.display = 'none';

/* === 9. Panneau Info / M-à-J ===================== */
const infoBtn = $('info-btn'),
      about   = $('about'),
      verDiv  = $('ver'),
      histDiv = $('history');

      verDiv.textContent = `Version installée : ${VERSION}`;
histDiv.innerHTML  = CHANGELOG.map(c =>
  `<strong>${c.v}</strong> – ${c.date}<br>${c.notes}`
).join('<br><br>');


infoBtn.onclick = () => about.classList.toggle('open');
document.addEventListener('keyup', e => {
  if(e.key === 'Escape') about.classList.remove('open');
});



$('update').onclick = async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if(!reg){ alert('Pas de Service-Worker'); return; }
  await reg.update();
  reg.waiting && typeof showUpdateBanner === 'function'
    ? showUpdateBanner()
    : alert('Aucune mise à jour disponible 👍');
};

console.log('🟢 Clé-Finder prêt');
