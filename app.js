/* ← colle ici ton URL “formResponse”  */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeGrY3_tG_8myZaIDc5TFdBP13UaYoH75uuWFkXstprxp6Kug/formResponse';
/* ← colle ici l’ID adresse  */ const A = 'entry.491906939';
/* ← colle ici l’ID clé      */ const K = 'entry.2038384954';

/* 1) charge la base */
let DB = {};
fetch('db.json').then(r => r.json()).then(j => DB = j);

const RES = document.getElementById('result');

/* 2) recherche + log */
function lookup(addr) {
  addr = addr.toUpperCase().trim();
  const key = DB[addr] || '';
  RES.textContent = key || '❓ inconnue';

  const q = JSON.parse(localStorage.q || '[]');
  q.push({ addr, key, ts: Date.now() });
  localStorage.q = JSON.stringify(q);
  send();
}

/* 3) saisie manuelle */
document.getElementById('manual')
  .addEventListener('keypress', e => { if (e.key === 'Enter') lookup(e.target.value); });

/* 4) scan caméra */
document.getElementById('scan').onclick = () => {
  Quagga.init({
    inputStream: { type: 'LiveStream',
                   constraints: { facingMode: 'environment' } },
    decoder: { readers: ['code_128_reader', 'ean_reader'] }
  }, err => {
    if (err) { alert(err); return; }
    Quagga.onDetected(d => { Quagga.stop(); lookup(d.codeResult.code); });
    Quagga.start();
  });
};

/* 5) envoi vers Google Forms */
function send() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.q || '[]');
  if (!q.length) return;

  const { addr, key } = q[0];
  const form = new URLSearchParams({ [A]: addr, [K]: key });
  fetch(FORM_URL, { method: 'POST', body: form, mode: 'no-cors' })
    .then(() => { q.shift(); localStorage.q = JSON.stringify(q); send(); })
    .catch(() => {});            // réessaiera plus tard
}
window.addEventListener('online', send);
