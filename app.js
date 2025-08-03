/* URL de VOTRE Google Apps Script */
const SCRIPT_URL = 'https://script.google.com/a/macros/auchan.fr/s/AKfycbywcvs3EBokeLltMb7m-47nJve7qxcf8On6KrC6ZojBK4__32-13BCNl-bvNvwyqs07/exec';

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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia non supporté par ce navigateur');
    }
    
    showResult('🔄 Demande d\'accès à la caméra...', '');
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'environment',
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    
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
      readers: ['code_128_reader'],
      debug: { showCanvas: false }
    },
    locate: true,
    locator: {
      patchSize: 'large',
      halfSample: false
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
  
  Quagga.onProcessed((result) => {
    const drawingCtx = Quagga.canvas.ctx.overlay;
    const drawingCanvas = Quagga.canvas.dom.overlay;
    if (result) {
      drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
      if (result.boxes) {
        result.boxes.filter(box => box !== result.box).forEach(box => {
          Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
        });
      }
      if (result.box) {
        Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
      }
    }
  });
  
  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    const format = result.codeResult.format;
    
    if (format === 'code_128' && code && code.length >= 3) {
      if (navigator.vibrate) navigator.vibrate(200);
      stopScanning();
      lookup(code);
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


// ===================================================================
// FONCTION D'ENVOI MISE À JOUR POUR UTILISER GOOGLE APPS SCRIPT
// ===================================================================
function send() {
  if (!navigator.onLine) {
    console.log('Hors ligne, envoi différé.');
    return;
  }
  
  const q = JSON.parse(localStorage.getItem('q') || '[]');
  if (!q.length) return;
  
  const { addr, key } = q[0];
  console.log('🚀 Envoi vers Apps Script:', { addr, key });

  // On construit une URL avec des paramètres de requête
  const url = new URL(SCRIPT_URL);
  url.searchParams.append('addr', addr);
  url.searchParams.append('key', key);

  // On utilise une requête GET simple et on lit la réponse JSON
  fetch(url, {
    method: 'GET',
    redirect: 'follow'
  })
  .then(response => response.json())
  .then(data => {
    if (data.status === 'success') {
      console.log('✅ Succès - Données envoyées via Apps Script:', data.data);
      showResult(`✅ Envoyé: ${addr} → ${key}`, 'success');

      // On retire de la queue SEULEMENT si l'envoi a réussi
      q.shift();
      localStorage.setItem('q', JSON.stringify(q));
      
      // On envoie le suivant s'il y en a un
      if (q.length > 0) {
        setTimeout(send, 500);
      }
    } else {
      // Gérer une erreur renvoyée par le script (ex: feuille non trouvée)
      throw new Error(data.message || 'Erreur inconnue du script');
    }
  })
  .catch((error) => {
    console.error('❌ Erreur envoi vers Apps Script:', error);
    showResult(`❌ Erreur envoi: ${error.message}`, 'error');
    // On ne retire pas de la queue, on réessaiera plus tard
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


// ===================================================================
// FONCTION DE TEST MISE À JOUR
// ===================================================================
function testSend() {
  console.log('🧪 Test envoi Apps Script...');
  
  const testUrl = new URL(SCRIPT_URL);
  testUrl.searchParams.append('addr', 'TEST_APP_JS');
  testUrl.searchParams.append('key', 'CLE_TEST_SCRIPT');

  fetch(testUrl, { method: 'GET', redirect: 'follow' })
    .then(r => r.json())
    .then(data => {
      console.log('✅ Réponse du test:', data);
      if (data.status === 'success') {
        showResult('✅ Test envoi réussi via Apps Script !', 'success');
      } else {
        showResult(`❌ Test envoi échoué: ${data.message}`, 'error');
      }
    })
    .catch(err => {
      console.error('❌ Test envoi échoué:', err);
      showResult('❌ Test envoi échoué: ' + err.message, 'error');
    });
}

// Bouton de test (temporaire)
const testBtn = document.createElement('button');
testBtn.textContent = '🧪 Test Script'; // Texte mis à jour
testBtn.onclick = testSend;
testBtn.style.cssText = 'position:fixed;bottom:10px;right:10px;padding:0.5rem;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;z-index:9999;';
document.body.appendChild(testBtn);