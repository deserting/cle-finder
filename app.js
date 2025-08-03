/******************************************************
 * Clé-Finder – app.js  Firebase / Firestore
 ******************************************************/

/* === 1. load local DB === */
let DB={};
fetch('./db.json').then(r=>r.json()).then(j=>DB=j);

const $ = id=>document.getElementById(id);
const RES=$('result'), CAM=$('camera-container'), VIEW=$('camera-view');
const IN=$('manual'), BTN=$('scan'), LIST=$('list'), TAB_SCAN=$('tab-scan'), TAB_TODO=$('tab-todo');

/* === 2. ui helper === */
const show=(t,c='')=>{RES.textContent=t;RES.className=c;};

/* === 3. firestore write === */
async function save(addr,key){
  const ref=db.collection('adresses').doc(addr);
  const ts=firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx=>{
    const s=await tx.get(ref);
    s.exists ?
      tx.update(ref,{count:firebase.firestore.FieldValue.increment(1),lastScanned:ts}) :
      tx.set(ref,{key,count:1,firstScanned:ts,lastScanned:ts});
  });
}

/* === 4. lookup === */
async function lookup(addr){
  addr=addr.toUpperCase().trim();
  if(!addr)return show('Adresse vide','error');
  const key=DB[addr]||'';
  show(key?`🔑 Clé : ${key}`:'❓ Adresse inconnue',key?'success':'error');
  await save(addr,key);
}

/* === 5. manual input === */
IN.addEventListener('keypress',e=>{if(e.key==='Enter'){const v=IN.value.trim();if(v){lookup(v);IN.value='';}}});

/* === 6. camera scan === */
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

/* === 7. tabs === */
function toggle(list){
  LIST.style.display=list?'block':'none';
  CAM .style.display=list?'none' :'block';
  TAB_SCAN.classList.toggle('inactive',list);
  TAB_TODO.classList.toggle('inactive',!list);
}
TAB_SCAN.onclick=()=>toggle(false);
TAB_TODO.onclick=()=>toggle(true);

/* === 8. realtime list === */
db.collection('adresses').orderBy('firstScanned')
  .onSnapshot(s=>{
    LIST.innerHTML='';
    s.forEach(d=>{
      const v=d.data(), first=v.firstScanned?.toDate(), last=v.lastScanned?.toDate();
      const card=document.createElement('div');
      card.className='card';
      card.innerHTML=`<div>
         <div style="font-weight:600">${d.id}</div>
         <small>Clé : ${v.key||'???'}</small>
         <small>1ᵉᵣ : ${first?.toLocaleDateString()||'-'}</small>
         <small>Dernier : ${last?.toLocaleDateString()||'-'}</small>
         <small>Scans : <strong>${v.count}</strong></small>
       </div>
       <button class="del">🗑️</button>`;
      card.querySelector('button').onclick=()=>db.collection('adresses').doc(d.id).delete();
      LIST.appendChild(card);
    });
  });

console.log('🟢 Clé-Finder prêt');
