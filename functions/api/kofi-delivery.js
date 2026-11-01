// Internal endpoint for a separately authenticated scheduled delivery runner.
// Deliberately disabled until the transactional outbox and Resend sender are ready.
export const onRequest=()=>Response.json({error:'Delivery worker not configured'},{status:503});
