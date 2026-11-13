// The collaboration integration test must never send email.
export class WorkerMailer { static connect() { throw new Error('Email unavailable in this test'); } }
