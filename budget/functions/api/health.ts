export const onRequest: PagesFunction = async () => {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
};