/******************************************************
 * Clé-Finder – app.js  Firebase / Firestore
 ******************************************************/

/* === 1. charger db.json === */
let DB={};
fetch('./db.json').then(r=>r.json()).then(j=>DB=j);

const $ = id=>document.getElementById(id);
const RES=$('result'), CAM=$('camera-container'), VIEW=$('camera-view');
const IN=$('manual'), BTN=$('scan'), LIST=document.createElement('div');
const TAB_SCAN=$('tab-scan'), TAB_TODO=$('tab-todo');

/* === 2. liste plein-écran === */
LIST.id='list';
LIST.style.cssText='display:none;position:fixed;top:0;left:0;right:0;bottom:56px;'+
                   'background:#fff;overflow-y:auto;padding:1rem;z-index:50';
document.body.appendChild(LIST);

/* === 3. helpers === */
const show=(t,c='')=>{RES.textContent=t;RES.className=c;};
const toggle=list=>{
  LIST.style.display=list?'block':'none';
  CAM .style.display=list?'none' :'block';
  TAB_SCAN.classList.toggle('inactive',list);
  TAB_TODO.classList.toggle('inactive',!list);
};
TAB_SCAN.onclick=()=>toggle(false);
TAB_TODO.onclick=()=>toggle(true);

/* === 4. firestore === */
async function save(addr,key){
  const ref=db.collection('adresses').doc(addr);
  const ts=firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx=>{
    const s=await tx.get(ref);
    s.exists
      ? tx.update(ref,{count:firebase.firestore.FieldValue.increment(1),lastScanned:ts})
      : tx.set(ref,{key,count:1,firstScanned:ts,lastScanned:ts});
  });
}

/* === 5. lookup === */
async function lookup(addr){
  addr=addr.toUpperCase().trim();
  if(!addr)return show('Adresse vide','error');
  const key=DB[addr]||'';
  show(key?`🔑 Clé : ${key}`:'❓ Adresse inconnue',key?'success':'error');
  await save(addr,key);
}

/* === 6. saisie === */
IN.addEventListener('keypress',e=>{
  if(e.key==='Enter'){const v=IN.value.trim();if(v){lookup(v);IN.value='';}}
});

/* === 7. scan caméra === */
let scanning=false;
BTN.onclick=()=>scanning?stop():start();
async function start(){
  try{
    await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    scanning=true;BTN.textContent='⏹️ Arrêter';CAM.style.display='block';
    show('📷 Visez le code-barres…');
    Quagga.init({inputStream:{type:'LiveStream',target:VIEW,constraints:{facingMode:'environment'}},
                 decoder:{readers:['code_128_reader']}},err=>{
      if(err){show('Erreur scanner','error');stop();return;}
      Quagga.start();
    });
    Quagga.onDetected(r=>{
      const code=r.codeResult?.code;
      if(code){navigator.vibrate?.(120);stop();lookup(code);}
    });
  }catch{show('Caméra indisponible','error');}
}
function stop(){if(!scanning)return;scanning=false;BTN.textContent='📷 Scanner';CAM.style.display='none';try{Quagga.stop();Quagga.offDetected();}catch{}}

/* === 8. liste Firestore temps réel === */
db.collection('adresses').orderBy('firstScanned')
  .onSnapshot(s=>{
    LIST.innerHTML='';
    s.forEach(d=>{
      const v=d.data(), f=v.firstScanned?.toDate(), l=v.lastScanned?.toDate();
      const card=document.createElement('div');
      card.className='card';
      card.style.cssText='border:1px solid #e2e8f0;border-radius:6px;padding:.8rem;margin-bottom:.8rem;'+
                         'display:flex;justify-content:space-between;align-items:center';
      card.innerHTML=`<div>
         <div style="font-weight:600">${d.id}</div>
         <small>Clé : ${v.key||'???'}</small>
         <small>1ᵉʳ : ${f?.toLocaleDateString()||'-'}</small>
         <small>Dernier : ${l?.toLocaleDateString()||'-'}</small>
         <small>Scans : <strong>${v.count}</strong></small>
       </div>
       <button class="del" style="background:#b91c1c;color:#fff;border:none;border-radius:6px;'+
       'padding:.35rem .6rem;cursor:pointer">🗑️</button>`;
      card.querySelector('button').onclick=
        ()=>db.collection('adresses').doc(d.id).delete();
      LIST.appendChild(card);
    });
  });

console.log('🟢 Clé-Finder prêt');
