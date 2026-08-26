// Registra o service worker do PWA do CORTEX (profissional).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // caminho relativo ao /frontend/
    const base = location.pathname.includes('/frontend/')
      ? location.pathname.slice(0, location.pathname.indexOf('/frontend/') + '/frontend/'.length)
      : './';
    navigator.serviceWorker.register(base + 'pwa-sw.js', { scope: base }).catch(()=>{});
  });
}
