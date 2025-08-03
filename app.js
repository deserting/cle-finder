/* URL Google Forms - REMPLACEZ PAR LA VÔTRE */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScm3l6PUAdxjPMLYfBG4lxOtRck841g-7RorNA9o1AfPalo0w/formResponse';

/* IDs des questions - REMPLACEZ PAR LES VRAIS IDs */
const A = 'entry.743566504';   // Adresse - VÉRIFIEZ CET ID !
const K = 'entry.838175931';  // Clé - VÉRIFIEZ CET ID !

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
  showResult('📷 Pointez vers un code-barres Code 128...', '');
  
  Quagga.init({
    inputStream: {
      type: 'LiveStream',
      target: CAMERA_VIEW,
      constraints: {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        facingMode: 'environment'
      }
    },
    decoder: {
      readers: ['code_128_reader'], // Focus uniquement sur Code 128
      debug: {
        showCanvas: false,
        showPatches: false,
        showFoundPatches: false,
        showSkeleton: false,
        showLabels: false,
        showPatchLabels: false,
        showRemainingPatchLabels: false,
        boxFromPatches: {
          showTransformed: false,
          showTransformedBox: false,
          showBB: false
        }
      }
    },
    locate: true,
    locator: {
      patchSize: 'large', // Patch plus large pour Code 128
      halfSample: false   // Pas de sous-échantillonnage
    },
    numOfWorkers: 2,
    frequency: 10
  }, (err) => {
    if (err) {
      console.error('Erreur Quagga init:', err);
      showResult('❌ Erreur initialisation scanner: ' + err.message, 'error');
      stopScanning();
      return;
    }
    
    console.log('Quagga initialisé avec succès pour Code 128');
    Quagga.start();
  });
  
  // Debug : afficher toutes les tentatives
  Quagga.onProcessed((result) => {
    const drawingCtx = Quagga.canvas.ctx.overlay;
    const drawingCanvas = Quagga.canvas.dom.overlay;

    if (result) {
      // Dessiner les zones détectées
      if (result.boxes) {
        drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
        result.boxes.filter(box => box !== result.box).forEach(box => {
          Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
        });
      }

      if (result.box) {
        Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
      }

      if (result.codeResult && result.codeResult.code) {
        Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
      }
    }
  });
  
  // Écouter les détections avec validation
  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    const format = result.codeResult.format;
    
    console.log('Code détecté:', code, 'Format:', format);
    
    // Validation : doit être Code 128 et correspondre au pattern attendu
    if (format === 'code_128' && code && code.length >= 3) {
      // Vibration si supportée
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
      
      stopScanning();
      lookup(code);
    } else {
      console.log('Code ignoré - format:', format, 'longueur:', code?.length);
    }
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

/* Envoi vers Google Forms - VERSION CORRIGÉE */
function send() {
  if (!navigator.onLine) {
    console.log('Hors ligne, envoi différé');
    return;
  }
  
  const q = JSON.parse(localStorage.getItem('q') || '[]');
  if (!q.length) return;
  
  const { addr, key } = q[0];
  
  console.log('🚀 Envoi:', { addr, key });
  
  // IMPORTANT : Utiliser URLSearchParams avec le bon Content-Type
  const formData = new URLSearchParams();
  formData.append(A, addr);
  formData.append(K, key);
  
  console.log('📤 Données à envoyer:', formData.toString());
  
  fetch(FORM_URL, {
    method: 'POST',
    body: formData,
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
  .then((response) => {
    console.log('✅ Réponse:', response.type);
    console.log('📨 Succès - Données envoyées:', addr, '→', key);
    
    // Retirer de la queue
    q.shift();
    localStorage.setItem('q', JSON.stringify(q));
    
    // Message de succès visible
    showResult(`✅ Envoyé: ${addr} → ${key}`, 'success');
    
    // Envoyer le suivant s'il y en a
    if (q.length > 0) {
      setTimeout(send, 1000);
    }
  })
  .catch((error) => {
    console.error('❌ Erreur envoi:', error);
    showResult(`❌ Erreur envoi: ${error.message}`, 'error');
    
    // Ne pas retirer de la queue en cas d'erreur
    // Réessaiera plus tard
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

// FONCTION DE TEST - Ajoutez un bouton pour tester l'envoi
function testSend() {
  console.log('🧪 Test envoi Google Forms...');
  
  const testData = new URLSearchParams();
  testData.append(A, 'TEST123');
  testData.append(K, 'CLE456');
  
  console.log('📤 Test data:', testData.toString());
  
  fetch(FORM_URL, {
    method: 'POST',
    body: testData,
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
  .then(() => {
    console.log('✅ Test envoi réussi');
    showResult('✅ Test envoi réussi - Vérifiez votre Google Sheets !', 'success');
  })
  .catch(err => {
    console.error('❌ Test envoi échoué:', err);
    showResult('❌ Test envoi échoué: ' + err.message, 'error');
  });
}

// Bouton de test (temporaire)
const testBtn = document.createElement('button');
testBtn.textContent = '🧪 Test Forms';
testBtn.onclick = testSend;
testBtn.style.cssText = 'position:fixed;bottom:10px;right:10px;padding:0.5rem;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;z-index:9999;';
document.body.appendChild(testBtn);