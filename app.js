/******************************************************
 *  Clé-en-main – app.js  (Firebase, Firestore, SW)
 ******************************************************/

/* === 0. Version & changelog ======================= */
const VERSION  = 'cle-en-main-v1.2';          // ↔ même que CACHE_VERSION
const CHANGELOG = [
  {v:'v1.2', date:'2025-08-15', notes:'Bundled Quagga library for offline use'},
  {v:'v1.1', date:'2025-08-07', notes:'♦ App 100% responsive ♦ Tweaks légéers de design'},
  {v:'v1.0', date:'2025-07-30', notes:'◌ A survécu au betatest ◌ Intégration de la BDD officielle & offline'}
];

/* === 1. charger db.json =========================== */
let DB={};
const dbReady=(async()=>{
  try{
    const r=await fetch('./db.json');
    DB=await r.json();
  }catch(err){
    console.error('Erreur chargement DB',err);
    throw err;
  }
})();

/* === 2. DOM helpers =============================== */
const $     = id=>document.getElementById(id);
const RES   = $('result'),
      CAM   = $('camera-container'),
      VIEW  = $('camera-view'),
      IN    = $('manual'),
      BTN   = $('scan'),
      STOP  = $('stop-scan'),
      TAB_S = $('tab-scan'),
      TAB_T = $('tab-todo');

(async()=>{
  IN.disabled=BTN.disabled=true;
  try{
    await dbReady;
    IN.disabled=BTN.disabled=false;
  }catch{
    RES.textContent='❌ Base de données indisponible';
    RES.className='error';
  }
})();

/* === 3. liste plein écran ========================= */
const LIST=document.createElement('div');
LIST.id='list';LIST.style.display='none';
document.body.appendChild(LIST);

/* === 4. nav actif / inactif ======================= */
const MAIN=document.querySelector('main');
function switchTab(scan){
  MAIN.style.display=scan?'block':'none';
  LIST.style.display=scan?'none':'grid';
  CAM .style.display  = 'none';
  TAB_S.classList.toggle('active',scan);
  TAB_S.classList.toggle('inactive',!scan);
  TAB_T.classList.toggle('active',!scan);
  TAB_T.classList.toggle('inactive',scan);
}
TAB_S.onclick=()=>switchTab(true);
TAB_T.onclick=()=>switchTab(false);
switchTab(true);  // par défaut

/* === 5. Firestore save =========================== */
async function save(addr,key){
  const ref=db.collection('adresses').doc(addr);
  const ts =firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    snap.exists
      ? tx.update(ref,{count:firebase.firestore.FieldValue.increment(1),lastScanned:ts})
      : tx.set(ref,{key,count:1,firstScanned:ts,lastScanned:ts});
  });
}

/* === 6. lookup =================================== */
async function lookup(addr){
  await dbReady;
  addr=addr.toUpperCase().trim();
  if(!addr) return RES.textContent='Adresse vide';
  const key=DB[addr]||'';
  RES.textContent=key?`🔑 Clé : ${key}`:'❓ Adresse inconnue';
  RES.className =key?'success':'error';
  await save(addr,key);
}

/* saisie ------------------------------------------ */
IN.addEventListener('keypress',e=>{
  if(e.key==='Enter'){
    const v=IN.value.trim();
    if(v){lookup(v);IN.value='';}
  }
});

/* === 7. Scan caméra ============================== */
let scanning=false;
BTN.onclick=()=>scanning?stopScan():startScan();
STOP.onclick=()=>stopScan();

async function startScan(){
  try{
    await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    scanning=true;
    BTN.textContent='⏹️ Arrêter';
    CAM.style.display='flex';
    STOP.style.display='none';
    RES.textContent='📷 Initialisation caméra…';RES.className='';

    Quagga.init({
      inputStream:{type:'LiveStream',target:VIEW,constraints:{facingMode:'environment'}},
      decoder:{readers:['code_128_reader']}
    },err=>{
      if(err){RES.textContent='Erreur scanner';RES.className='error';stopScan();return;}
      Quagga.start();
      /* pré-visualisation prête */
      STOP.style.display='inline-block';
      RES.textContent='📷 Visez le code-barres…';
    });

    Quagga.onDetected(r=>{
      const code=r.codeResult?.code;
      if(code){navigator.vibrate?.(120);stopScan();lookup(code);}
    });
  }catch{
    RES.textContent='Caméra indisponible';RES.className='error';
  }
}

function stopScan(){
  if(!scanning) return;
  scanning=false;
  BTN.textContent='📷 Scanner';
  CAM.style.display='none';
  STOP.style.display='none';
  try{Quagga.stop();Quagga.offDetected();}catch{}
}

/* === 8. Liste Firestore temps réel =============== */
db.collection('adresses').orderBy('firstScanned')
  .onSnapshot(snap=>{
    LIST.innerHTML='';
    snap.forEach(doc=>{
      const d=doc.data(),f=d.firstScanned?.toDate(),l=d.lastScanned?.toDate();
      const card=document.createElement('div');
      card.className='card';
      card.innerHTML=`
        <div>
          <div style="font-weight:600">${doc.id}</div>
          <small>Clé : ${d.key||'???'}</small>
          <small>1ᵉʳ : ${f?.toLocaleDateString()||'-'}</small>
          <small>Dernier : ${l?.toLocaleDateString()||'-'}</small>
          <small>Scans : <strong>${d.count}</strong></small>
        </div>
        <button class="del">🗑️</button>`;
      card.querySelector('button').onclick=
        ()=>db.collection('adresses').doc(doc.id).delete();
      LIST.appendChild(card);
    });
  });

/* === 9. Panneau Info / M-à-J ===================== */
$('ver').textContent =`Version installée : ${VERSION}`;
$('history').innerHTML = CHANGELOG
  .map(c=>`<strong>${c.v}</strong> – ${c.date}<br>${c.notes}`)
  .join('<br><br>');

$('info-btn').onclick =()=> $('about').classList.toggle('open');
document.addEventListener('keyup',e=>{
  if(e.key==='Escape') $('about').classList.remove('open');
});

$('update').onclick =async ()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  if(!reg){alert('Pas de Service-Worker');return;}
  await reg.update();
  reg.waiting&&typeof showUpdateBanner==='function'
    ? showUpdateBanner()
    : alert('Aucune mise à jour disponible 👍');
};

console.log('🟢 Clé-en-main prêt');
