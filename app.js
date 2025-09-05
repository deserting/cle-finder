/******************************************************
 * Clé-en-main – app.js
 * Logique applicative, interaction avec le DOM
 ******************************************************/

/* === 0. Version & changelog ======================= */
const VERSION  = 'cle-en-main-v1.3';
const CHANGELOG = [
  {v:'v1.3', date:'2025-09-05', notes:'♦ Remise à jour UI & UX complète.'},
  {v:'v1.2', date:'2025-08-15', notes:'◌ Quagga bundlé pour usage offline & sécurité ◌ Gestion des erreurs sur le chargement en retard de la BDD'},
  {v:'v1.1', date:'2025-08-07', notes:'◌ App 100% responsive ◌ Tweaks légers de design'},
  {v:'v1.0', date:'2025-07-30', notes:'◌ A survécu au betatest ◌ Intégration de la BDD officielle & offline'}
];

/* === 1. Chargement de la base de données locale === */
let DB = {};
const dbReady = (async () => {
  try {
    const r = await fetch('./db.json');
    if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
    DB = await r.json();
    console.log('DB locale chargée.');
  } catch (err) {
    console.error('Erreur de chargement de la DB locale', err);
    throw err;
  }
})();

/* === 2. Sélecteurs DOM & état initial ================ */
const $ = id => document.getElementById(id);

const RES = $('result'),
      CAM_CONTAINER = $('camera-container'),
      VIEW = $('camera-view'),
      IN = $('manual'),
      BTN_SCAN = $('scan'),
      TAB_S = $('tab-scan'),
      TAB_T = $('tab-todo'),
      SCAN_VIEW = $('scan-view'),
      LIST_VIEW = $('list-view');

// Désactiver les entrées tant que la DB n'est pas prête
(async () => {
  IN.disabled = BTN_SCAN.disabled = true;
  try {
    await dbReady;
    IN.disabled = BTN_SCAN.disabled = false;
  } catch {
    RES.textContent = '❌ Base de données indisponible';
    RES.className = 'error';
  }
})();

/* === 3. Gestion de la navigation par onglets ======== */
function switchView(isScanView) {
  SCAN_VIEW.classList.toggle('active', isScanView);
  LIST_VIEW.classList.toggle('active', !isScanView);
  TAB_S.classList.toggle('active', isScanView);
  TAB_T.classList.toggle('active', !isScanView);
  
  // S'assurer que le scan est arrêté si on quitte l'onglet
  if (!isScanView) {
    stopScan();
  }
}
TAB_S.onclick = () => switchView(true);
TAB_T.onclick = () => switchView(false);
switchView(true); // Vue par défaut

/* === 4. Sauvegarde des scans dans Firestore ========== */
async function saveToFirestore(addr, key) {
  if (!window.db) {
      console.error("Firestore non initialisé.");
      return;
  }
  const ref = db.collection('adresses').doc(addr);
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        tx.update(ref, {
          count: firebase.firestore.FieldValue.increment(1),
          lastScanned: ts
        });
      } else {
        tx.set(ref, {
          key: key,
          count: 1,
          firstScanned: ts,
          lastScanned: ts
        });
      }
    });
  } catch (error) {
    console.error("Erreur de transaction Firestore:", error);
  }
}

/* === 5. Logique de recherche (lookup) ============== */
async function lookup(addr) {
  await dbReady;
  addr = addr.toUpperCase().trim();
  if (!addr) {
    RES.textContent = 'Adresse vide';
    RES.className = 'error';
    return;
  }
  
  const key = DB[addr] || '';
  RES.textContent = key ? `🔑 Clé : ${key}` : '❓ Adresse inconnue';
  RES.className = key ? 'success' : 'error';
  
  saveToFirestore(addr, key);
}

IN.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const v = IN.value.trim();
    if (v) {
      lookup(v);
      IN.value = '';
    }
  }
});

/* === 6. Scan par caméra avec QuaggaJS =============== */
let isScanning = false;

BTN_SCAN.onclick = () => isScanning ? stopScan() : startScan();
$('stop-scan').onclick = () => stopScan(); // Bouton legacy, maintenant caché

async function startScan() {
  if (isScanning) return;
  try {
    // Demander l'accès à la caméra
    await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    
    isScanning = true;
    document.body.classList.add('scanning');
    RES.textContent = '📷 Initialisation...';
    RES.className = '';

    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: VIEW,
        constraints: { facingMode: 'environment' }
      },
      decoder: { readers: ['code_128_reader'] }
    }, err => {
      if (err) {
        console.error("Erreur d'initialisation Quagga:", err);
        RES.textContent = 'Erreur scanner';
        RES.className = 'error';
        stopScan();
        return;
      }
      Quagga.start();
      RES.textContent = '🎯 Visez le code-barres...';
    });

    Quagga.onDetected(r => {
      const code = r.codeResult?.code;
      if (code) {
        navigator.vibrate?.(120);
        stopScan();
        lookup(code);
      }
    });

  } catch (err) {
    console.error("Erreur d'accès caméra:", err);
    RES.textContent = '⛔ Caméra indisponible';
    RES.className = 'error';
    stopScan();
  }
}

function stopScan() {
  if (!isScanning) return;
  isScanning = false;
  document.body.classList.remove('scanning');
  
  try {
    Quagga.stop();
    Quagga.offDetected();
  } catch(e) {
    console.log("Quagga n'était pas lancé, pas besoin de l'arrêter.");
  }
}

/* === 7. Affichage temps réel de la liste Firestore === */
if (window.db) {
  db.collection('adresses').orderBy('firstScanned', 'desc')
    .onSnapshot(snap => {
      LIST_VIEW.innerHTML = '';
      if (snap.empty) {
          LIST_VIEW.innerHTML = '<p class="empty-list-message">Aucune clé scannée pour le moment.</p>';
          return;
      }
      snap.forEach(doc => {
        const d = doc.data();
        const f = d.firstScanned?.toDate();
        const l = d.lastScanned?.toDate();

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-info">
            <div class="addr">${doc.id}</div>
            <div class="details">
              <span><strong class="key">${d.key || '???'}</strong></span>
              <span>1er: ${f ? f.toLocaleDateString() : '-'}</span>
              <span>Dernier: ${l ? l.toLocaleDateString() : '-'}</span>
            </div>
          </div>
          <div class="card-actions">
            <span class="scan-count">${d.count}</span>
            <button class="del-btn" aria-label="Supprimer">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>`;
        card.querySelector('.del-btn').onclick =
          () => db.collection('adresses').doc(doc.id).delete();
        LIST_VIEW.appendChild(card);
      });
    }, err => {
        console.error("Erreur Firestore Snapshot:", err);
        LIST_VIEW.innerHTML = '<p class="empty-list-message error">Impossible de charger la liste.</p>';
    });
} else {
    LIST_VIEW.innerHTML = '<p class="empty-list-message error">Connexion à la base de données impossible.</p>';
}

/* === 8. Panneau "À propos" ========================= */
$('ver').textContent = `Version installée : ${VERSION}`;
$('history').innerHTML = CHANGELOG
  .map(c => `<div><strong>${c.v}</strong> – ${c.date}<p>${c.notes}</p></div>`)
  .join('');

const aboutPanel = $('about');
const aboutOverlay = $('about-overlay');
const closeAboutBtn = $('close-about-btn');

function toggleAboutPanel(open) {
    document.body.classList.toggle('about-open', open);
}

$('info-btn').onclick = () => toggleAboutPanel(true);
aboutOverlay.onclick = () => toggleAboutPanel(false);
closeAboutBtn.onclick = () => toggleAboutPanel(false);


document.addEventListener('keyup', e => {
  if (e.key === 'Escape') {
    toggleAboutPanel(false);
  }
});

/* === 9. Notifications & Mises à jour =================== */

function showNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Fade in
  setTimeout(() => notification.classList.add('show'), 10);

  // Fade out and remove
  setTimeout(() => {
    notification.classList.remove('show');
    notification.addEventListener('transitionend', () => notification.remove());
  }, duration);
}


$('update').onclick = async () => {
  if (!navigator.serviceWorker) {
    showNotification('Service Worker non supporté.');
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    showNotification('Pas de Service-Worker. L\'app ne peut pas se mettre à jour.');
    return;
  }
  await reg.update();
  if (reg.waiting && typeof showUpdateBanner === 'function') {
    showUpdateBanner();
  } else {
    showNotification('Aucune mise à jour disponible 👍');
  }
};

console.log(`🟢 Clé-en-main ${VERSION} prêt.`);

