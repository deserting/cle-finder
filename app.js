/* URL Google Forms : /formResponse */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeGrY3_tG_8myZaIDc5TFdBP13UaYoH75uuWFkXstprxp6Kug/formResponse';
/* IDs des deux questions */
const A = 'entry.491906939';   // Adresse
const K = 'entry.2038384954';  // Clé

/* Charge la base locale */
let DB = {};
fetch('./db.json').then(r => r.json()).then(j => DB = j);

const RES = document.getElementById('result');

/* Lookup + log */
function lookup(addr) {
  addr = addr.toUpperCase().trim();
  const key = DB[addr] || '';
  RES.textContent = key || '❓ inconnue';

  const q = JSON.parse(localStorage.q || '[]');
  q.push({ addr, key, ts: Date.now() });
  localStorage.q = JSON.stringify(q);
  send();
}

/* Saisie manuelle */
document.getElementById('manual')
  .addEventListener('keypress', e => { if (e.key === 'Enter') lookup(e.target.value); });

/* Scan */
document.getElementById('scan').onclick = () => {
  Quagga.init({
    inputStream: { type:'LiveStream', constraints:{ facingMode:'environment' } },
    decoder: { readers:['code_128_reader','ean_reader'] }
  }, err => {
    if (err) { alert(err); return; }
    Quagga.onDetected(d => { Quagga.stop(); lookup(d.codeResult.code); });
    Quagga.start();
  });
};

/* Envoi vers Google Forms (queue offline) */
function send() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.q || '[]');
  if (!q.length) return;

  const { addr, key } = q[0];
  const body = new URLSearchParams({ [A]: addr, [K]: key });

  fetch(FORM_URL, { method:'POST', body, mode:'no-cors' })
    .then(() => { q.shift(); localStorage.q = JSON.stringify(q); send(); })
    .catch(() => {});          // réessaiera plus tard
}
window.addEventListener('online', send);
