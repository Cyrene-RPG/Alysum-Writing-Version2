module.exports = async function sharedSection(req, res) {
    const { handleSharedSection } = await import('../core/server/http-handlers/shared-section.mjs');
    const token = typeof req.query?.token === 'string' ? req.query.token : '';
    const request = new Request(`https://alysumwriting.com/shared-section/${encodeURIComponent(token)}`, { method: req.method || 'GET' });
    const response = await handleSharedSection(request, { token });
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(req.method === 'HEAD' ? undefined : await response.text());
};
