/* URL Google Forms */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeGrY3_tG_8myZaIDc5TFdBP13UaYoH75uuWFkXstprxp6Kug/formResponse';

/* IDs des questions */
const A = 'entry.491906939';   // Adresse
const K = 'entry.2038384954';  // Clé

/* Base de données locale */
let DB = {};

// Chargement de la base avec gestion d'erreur
fetch('./db.json')
  .then(r => r.json())
  .then(j => {
    DB = j;
    console.log('Base de données chargée:', Object.keys(DB).length, 'entrées');
  })
  .catch(err => {
    console.error('Erreur chargement DB:', err);
    showResult('❌ Erreur de chargement de la base', 'error');
  });

const RES = document.getElementById('result');
const CAMERA_CONTAINER = document.getElementById('camera-container');
const CAMERA_VIEW = document.getElementById('camera-view');

/* Affichage des résultats */
function showResult(text, type = '') {
  RES.textContent = text;
  RES.className = type;
}

/* Lookup principal */
function lookup(addr) {
  if (!addr) {
    showResult('❌ Adresse vide', 'error');
    return;
  }
  
  addr = addr.toUpperCase().trim();
  const key = DB[addr] || '';
  
  if (key) {
    showResult(`🔑 Clé: ${key}`, 'success');
  } else {
    showResult('❓ Adresse inconnue', 'error');
  }
  
  // Sauvegarde dans la queue
  const q = JSON.parse(localStorage.getItem('q') || '[]');
  q.push({ 
    addr, 
    key: key || 'INCONNU', 
    ts: Date.now() 
  });
  localStorage.setItem('q', JSON.stringify(q));
  
  send();
}

/* Saisie manuelle */
document.getElementById('manual').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const value = e.target.value.trim();
    if (value) {
      lookup(value);
      e.target.value = ''; // Vider le champ
    }
  }
});

/* Variables pour la caméra */
let isScanning = false;

/* Bouton Scanner */
document.getElementById('scan').onclick = async () => {
  if (isScanning) {
    stopScanning();
    return;
  }
  
  try {
    // Vérifier le support des médias
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia non supporté par ce navigateur');
    }
    
    showResult('🔄 Demande d\'accès à la caméra...', '');
    
    // Demander permission caméra
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'environment',
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    
    // Arrêter le stream immédiatement (Quagga va créer le sien)
    stream.getTracks().forEach(track => track.stop());
    
    startQuagga();
    
  } catch (error) {
    console.error('Erreur caméra:', error);
    let errorMsg = '❌ ';
    
    if (error.name === 'NotAllowedError') {
      errorMsg += 'Permission caméra refusée';
    } else if (error.name === 'NotFoundError') {
      errorMsg += 'Caméra non trouvée';
    } else if (error.name === 'NotSupportedError') {
      errorMsg += 'Caméra non supportée';
    } else {
      errorMsg += 'Erreur caméra: ' + error.message;
    }
    
    showResult(errorMsg, 'error');
  }
};

/* Démarrer Quagga */
function startQuagga() {
  isScanning = true;
  document.getElementById('scan').textContent = '⏹️ Arrêter';
  CAMERA_CONTAINER.style.display = 'block';
  showResult('📷 Pointez vers un code-barres...', '');
  
  Quagga.init({
    inputStream: {
      type: 'LiveStream',
      target: CAMERA_VIEW,
      constraints: {
        width: { min: 320, ideal: 640, max: 800 },
        height: { min: 240, ideal: 480, max: 600 },
        facingMode: 'environment'
      }
    },
    decoder: {
      readers: [
        'code_128_reader',
        'ean_reader',
        'ean_8_reader',
        'code_39_reader',
        'code_39_vin_reader',
        'codabar_reader'
      ]
    },
    locate: true,
    locator: {
      patchSize: 'medium',
      halfSample: true
    }
  }, (err) => {
    if (err) {
      console.error('Erreur Quagga init:', err);
      showResult('❌ Erreur initialisation scanner: ' + err.message, 'error');
      stopScanning();
      return;
    }
    
    console.log('Quagga initialisé avec succès');
    Quagga.start();
  });
  
  // Écouter les détections
  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    console.log('Code détecté:', code);
    
    // Vibration si supportée
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
    
    stopScanning();
    lookup(code);
  });
}

/* Arrêter le scanning */
function stopScanning() {
  if (!isScanning) return;
  
  isScanning = false;
  document.getElementById('scan').textContent = '📷 Scanner';
  CAMERA_CONTAINER.style.display = 'none';
  
  try {
    Quagga.stop();
    Quagga.offDetected();
  } catch (e) {
    console.warn('Erreur arrêt Quagga:', e);
  }
}

/* Bouton arrêter scan */
document.getElementById('stop-scan').onclick = stopScanning;

/* Envoi vers Google Forms */
function send() {
  if (!navigator.onLine) {
    console.log('Hors ligne, envoi différé');
    return;
  }
  
  const q = JSON.parse(localStorage.getItem('q') || '[]');
  if (!q.length) return;
  
  const { addr, key } = q[0];
  const body = new URLSearchParams({
    [A]: addr,
    [K]: key
  });
  
  fetch(FORM_URL, {
    method: 'POST',
    body,
    mode: 'no-cors'
  })
  .then(() => {
    console.log('Données envoyées:', addr, key);
    q.shift();
    localStorage.setItem('q', JSON.stringify(q));
    if (q.length > 0) send(); // Envoyer le suivant
  })
  .catch((error) => {
    console.warn('Erreur envoi:', error);
    // Réessaiera quand la connexion reviendra
  });
}

/* Réessayer l'envoi quand on revient en ligne */
window.addEventListener('online', () => {
  console.log('Connexion rétablie, envoi des données...');
  send();
});

/* Debug info */
console.log('App initialisée');
console.log('Support getUserMedia:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
console.log('Support ServiceWorker:', 'serviceWorker' in navigator);