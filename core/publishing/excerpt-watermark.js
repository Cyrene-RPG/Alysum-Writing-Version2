/** A self-contained text mask for shared excerpts; never sends author text elsewhere. */
export function excerptWatermark(author = '') {
    const name = String(author || '').replace(/\s+/gu, ' ').trim();
    const characters = Array.from(name);
    const displayName = characters.length > 40 ? characters.slice(0, 39).join('') + '…' : name;
    const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180"><g transform="rotate(-18 180 90)" fill="black" font-family="sans-serif" text-anchor="middle"><text x="180" y="84" font-size="18" font-weight="600">${escape(displayName || 'Shared excerpt')}</text><text x="180" y="110" font-size="13">${name ? 'Shared excerpt · Alysum' : 'Alysum'}</text></g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}
