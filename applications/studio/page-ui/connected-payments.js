const bookId = new URLSearchParams(window.location.search).get('book');
if (bookId) {
    const link = document.getElementById('openPublish');
    link.href = `/publish?book=${encodeURIComponent(bookId)}#purchaseLinkCard`;
    link.textContent = 'Open publishing settings';
}
