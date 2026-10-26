// The preview is isolated and never initializes authentication or a backend client.
if(new URLSearchParams(location.search).has('preview')) await import('./hub-preview.js');
else await import('./hub-boot.js');
